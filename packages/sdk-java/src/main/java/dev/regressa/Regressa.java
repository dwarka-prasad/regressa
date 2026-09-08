package dev.regressa;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

/**
 * Regressa client: buffers traces and flushes them in batches.
 *
 * <pre>
 * Regressa regressa = Regressa.builder().apiKey(System.getenv("REGRESSA_API_KEY")).build();
 * Regressa.Span span = regressa.start("gpt-4o-mini", "openai")
 *     .message("system", PROMPT).message("user", question)
 *     .template("support-agent", PROMPT_TEMPLATE);
 * ... call the provider ...
 * span.end(outputText, promptTokens, completionTokens);   // or span.fail(exception)
 * regressa.shutdown();
 * </pre>
 */
public final class Regressa implements AutoCloseable {
  public static final String SDK_NAME = "regressa-java";
  public static final String SDK_VERSION = "0.1.0";
  public static final String KEY_HEADER = "X-Regressa-Project-Key";

  private static final ObjectMapper JSON = new ObjectMapper();

  private final String apiKey;
  private final String baseUrl;
  private final int flushAt;
  private final Duration flushInterval;
  private final boolean disabled;
  private final Map<String, Object> defaultMetadata;
  private final HttpClient http;
  private final Consumer<Throwable> onError;
  private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(r -> { Thread t = new Thread(r, "regressa-flush"); t.setDaemon(true); return t; });
  private final List<Trace> buffer = new ArrayList<>();
  private ScheduledFuture<?> pending;
  private final AtomicBoolean warned = new AtomicBoolean();
  private volatile boolean closed;

  private Regressa(Builder b) {
    String key = b.apiKey != null ? b.apiKey : System.getenv("REGRESSA_API_KEY");
    String url = b.baseUrl != null ? b.baseUrl : System.getenv("REGRESSA_BASE_URL");
    this.baseUrl = (url == null || url.isEmpty() ? "https://ingest.regressa.dev" : url).replaceAll("/+$", "");
    this.flushAt = b.flushAt;
    this.flushInterval = b.flushInterval;
    this.defaultMetadata = b.defaultMetadata;
    this.http = b.http != null ? b.http : HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    this.onError = b.onError != null ? b.onError : e -> { if (warned.compareAndSet(false, true)) System.err.println("[regressa] failed to send traces: " + e.getMessage()); };
    boolean off = b.disabled || "1".equals(System.getenv("REGRESSA_DISABLED"));
    if ((key == null || key.isEmpty()) && !off) { System.err.println("[regressa] no API key set (REGRESSA_API_KEY); tracing disabled"); off = true; }
    this.apiKey = key == null ? "" : key;
    this.disabled = off;
    Runtime.getRuntime().addShutdownHook(new Thread(this::shutdown));
  }

  public static Builder builder() { return new Builder(); }

  /** Record a trace. Thread-safe. */
  public void trace(Trace t) {
    if (disabled || closed) return;
    if (t.id == null) t.id = UUID.randomUUID().toString();
    if (t.timestamp == null) t.timestamp = Instant.now().toString();
    if (t.status == null) t.status = "success";
    if (defaultMetadata != null && !defaultMetadata.isEmpty()) {
      Map<String, Object> merged = new LinkedHashMap<>(defaultMetadata);
      if (t.metadata != null) merged.putAll(t.metadata);
      t.metadata = merged;
    }
    boolean full;
    synchronized (buffer) {
      buffer.add(t);
      full = buffer.size() >= flushAt;
      if (!full && pending == null) pending = scheduler.schedule(this::flush, flushInterval.toMillis(), TimeUnit.MILLISECONDS);
    }
    if (full) flush();
  }

  /** Start timing a call. */
  public Span start(String model, String provider) { return new Span(this, model, provider); }

  /** Send buffered traces now (blocking). */
  public void flush() {
    List<Trace> batch;
    synchronized (buffer) {
      if (pending != null) { pending.cancel(false); pending = null; }
      if (buffer.isEmpty()) return;
      batch = new ArrayList<>(buffer);
      buffer.clear();
    }
    send(batch);
  }

  /** Flush and stop. Idempotent. */
  public void shutdown() { if (closed) return; flush(); closed = true; scheduler.shutdownNow(); }

  @Override public void close() { shutdown(); }

  private void send(List<Trace> batch) {
    Throwable last = null;
    for (int attempt = 0; attempt < 4; attempt++) {
      try {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("traces", batch);
        body.put("sdk", Map.of("name", SDK_NAME, "version", SDK_VERSION));
        HttpRequest req = HttpRequest.newBuilder(URI.create(baseUrl + "/v1/traces"))
            .timeout(Duration.ofSeconds(10))
            .header("Content-Type", "application/json").header(KEY_HEADER, apiKey).header("User-Agent", SDK_NAME + "/" + SDK_VERSION)
            .POST(HttpRequest.BodyPublishers.ofByteArray(JSON.writeValueAsBytes(body))).build();
        HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() < 400) return;
        last = new IOException("regressa ingest " + res.statusCode() + ": " + res.body());
        if (res.statusCode() != 429 && res.statusCode() < 500) break; // client error, don't retry
      } catch (IOException | InterruptedException e) {
        last = e;
        if (e instanceof InterruptedException) { Thread.currentThread().interrupt(); break; }
      }
      try { Thread.sleep(250L * (1L << attempt)); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); break; }
    }
    if (last != null) onError.accept(last);
  }

  /** In-flight call timer; end() or fail() records the trace. */
  public static final class Span {
    private final Regressa client;
    private final Trace.Builder b;
    private final long started = System.nanoTime();
    private String systemPrompt;
    private boolean declaredTemplate;
    Span(Regressa client, String model, String provider) { this.client = client; this.b = Trace.builder(model, provider); }
    public Span message(String role, Object content) { b.message(role, content); if ("system".equals(role) && content instanceof String && systemPrompt == null) systemPrompt = (String) content; return this; }
    public Span template(String name, String raw) { b.template(name, raw); declaredTemplate = true; return this; }
    public Span group(String id) { b.group(id); return this; }
    public Span metadata(Map<String, Object> m) { b.metadata(m); return this; }
    public void end(String output, Integer promptTokens, Integer completionTokens) { finish(b.output(output).tokens(promptTokens, completionTokens)); }
    public void fail(Throwable error) {
      String msg = String.valueOf(error.getMessage());
      boolean timeout = error instanceof java.net.http.HttpTimeoutException || error instanceof java.util.concurrent.TimeoutException || msg.toLowerCase().contains("timeout");
      finish(timeout ? b.timeout(msg) : b.error(msg));
    }
    private void finish(Trace.Builder done) {
      if (!declaredTemplate && systemPrompt != null && !systemPrompt.isEmpty()) done.template("system:" + Integer.toHexString(systemPrompt.hashCode()), systemPrompt);
      client.trace(done.latencyMs((int) ((System.nanoTime() - started) / 1_000_000L)).build());
    }
  }

  public static final class Builder {
    private String apiKey, baseUrl;
    private int flushAt = 50;
    private Duration flushInterval = Duration.ofSeconds(2);
    private boolean disabled;
    private Map<String, Object> defaultMetadata;
    private HttpClient http;
    private Consumer<Throwable> onError;
    public Builder apiKey(String v) { apiKey = v; return this; }
    public Builder baseUrl(String v) { baseUrl = v; return this; }
    public Builder flushAt(int v) { flushAt = v; return this; }
    public Builder flushInterval(Duration v) { flushInterval = v; return this; }
    public Builder disabled(boolean v) { disabled = v; return this; }
    public Builder defaultMetadata(Map<String, Object> v) { defaultMetadata = v; return this; }
    public Builder httpClient(HttpClient v) { http = v; return this; }
    public Builder onError(Consumer<Throwable> v) { onError = v; return this; }
    public Regressa build() { return new Regressa(this); }
  }
}
