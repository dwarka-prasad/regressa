package dev.regressa;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class RegressaTest {
  private static final ObjectMapper JSON = new ObjectMapper();
  private HttpServer server;
  private final List<JsonNode> bodies = new CopyOnWriteArrayList<>();
  private final List<String> keys = new CopyOnWriteArrayList<>();
  private final AtomicInteger status = new AtomicInteger(202);
  private String url;

  @BeforeEach void up() throws Exception {
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext("/v1/traces", ex -> {
      bodies.add(JSON.readTree(ex.getRequestBody()));
      keys.add(ex.getRequestHeaders().getFirst(Regressa.KEY_HEADER));
      byte[] out = "{\"accepted\":1,\"rejected\":0,\"errors\":[]}".getBytes();
      ex.sendResponseHeaders(status.get(), out.length);
      ex.getResponseBody().write(out);
      ex.close();
    });
    server.start();
    url = "http://127.0.0.1:" + server.getAddress().getPort();
  }

  @AfterEach void down() { server.stop(0); }

  private Regressa client() { return Regressa.builder().apiKey("rgsa_test_abc").baseUrl(url).flushAt(10).flushInterval(Duration.ofHours(1)).build(); }

  @Test void bufferedTraceIsSentWithKeyHeader() {
    Regressa r = client();
    r.trace(Trace.builder("gpt-4o-mini", "openai").message("user", "hi").output("hello").build());
    r.flush();
    assertEquals(1, bodies.size());
    assertEquals("rgsa_test_abc", keys.get(0));
    JsonNode t = bodies.get(0).get("traces").get(0);
    assertEquals("hello", t.get("output_text").asText());
    assertEquals("success", t.get("status").asText());
    assertFalse(t.get("id").asText().isEmpty());
    assertEquals(Regressa.SDK_NAME, bodies.get(0).get("sdk").get("name").asText());
  }

  @Test void spanRecordsLatencyTemplateAndErrors() {
    Regressa r = Regressa.builder().apiKey("k").baseUrl(url).flushInterval(Duration.ofHours(1)).defaultMetadata(Map.of("env", "test")).build();
    r.start("gpt-4o-mini", "openai").message("system", "You are a ping bot.").message("user", "ping").template("ping", "You are a ping bot.").metadata(Map.of("user", "u1")).end("pong", 5, 1);
    r.start("gpt-4o", "openai").message("system", "Be brief.").message("user", "x").fail(new RuntimeException("429 rate limited"));
    r.flush();
    JsonNode ok = bodies.get(0).get("traces").get(0);
    assertEquals("pong", ok.get("output_text").asText());
    assertEquals(5, ok.get("prompt_tokens").asInt());
    assertEquals("ping", ok.get("prompt_template").get("name").asText());
    assertEquals("test", ok.get("metadata").get("env").asText());
    assertEquals("u1", ok.get("metadata").get("user").asText());
    assertTrue(ok.has("latency_ms"));
    JsonNode bad = bodies.get(0).get("traces").get(1);
    assertEquals("error", bad.get("status").asText());
    assertEquals("429 rate limited", bad.get("error_message").asText());
    assertEquals("Be brief.", bad.get("prompt_template").get("raw").asText(), "system prompt is inferred as the template");
  }

  @Test void flushAtTriggersSend() {
    Regressa r = Regressa.builder().apiKey("k").baseUrl(url).flushAt(2).flushInterval(Duration.ofHours(1)).build();
    r.trace(Trace.builder("m", "other").message("user", "1").build());
    r.trace(Trace.builder("m", "other").message("user", "2").build());
    r.shutdown();
    assertEquals(1, bodies.size());
    assertEquals(2, bodies.get(0).get("traces").size());
  }

  @Test void retriesServerErrorsAndReportsOnce() {
    status.set(503);
    AtomicInteger reported = new AtomicInteger();
    Regressa r = Regressa.builder().apiKey("k").baseUrl(url).flushInterval(Duration.ofHours(1)).onError(e -> reported.incrementAndGet()).build();
    r.trace(Trace.builder("m", "other").message("user", "x").build());
    r.flush();
    assertEquals(4, bodies.size(), "1 attempt + 3 retries");
    assertEquals(1, reported.get());
  }

  @Test void disabledClientSendsNothing() {
    Regressa r = Regressa.builder().apiKey("k").baseUrl(url).disabled(true).build();
    r.trace(Trace.builder("m", "other").build());
    r.shutdown();
    assertTrue(bodies.isEmpty());
  }
}
