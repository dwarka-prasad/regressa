package dev.regressa;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** One LLM call. Field names follow the Regressa ingest API. Build with {@link #builder()}. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class Trace {
  public String id;
  public String timestamp;
  public String model;
  public String provider;
  @JsonProperty("input_messages") public List<Map<String, Object>> inputMessages = new ArrayList<>();
  @JsonProperty("output_text") public String outputText;
  @JsonProperty("prompt_tokens") public Integer promptTokens;
  @JsonProperty("completion_tokens") public Integer completionTokens;
  @JsonProperty("total_cost_usd") public Double totalCostUsd;
  @JsonProperty("latency_ms") public Integer latencyMs;
  public String status;
  @JsonProperty("error_message") public String errorMessage;
  @JsonProperty("trace_group_id") public String traceGroupId;
  @JsonProperty("prompt_template") public Map<String, String> promptTemplate;
  public Map<String, Object> metadata;

  public static Builder builder(String model, String provider) { return new Builder(model, provider); }

  public static final class Builder {
    private final Trace t = new Trace();
    Builder(String model, String provider) { t.model = model; t.provider = provider; }
    public Builder message(String role, Object content) { Map<String, Object> m = new LinkedHashMap<>(); m.put("role", role); m.put("content", content); t.inputMessages.add(m); return this; }
    public Builder output(String text) { t.outputText = text; return this; }
    public Builder tokens(Integer prompt, Integer completion) { t.promptTokens = prompt; t.completionTokens = completion; return this; }
    public Builder latencyMs(int ms) { t.latencyMs = ms; return this; }
    public Builder costUsd(double usd) { t.totalCostUsd = usd; return this; }
    public Builder error(String message) { t.status = "error"; t.errorMessage = message; return this; }
    public Builder timeout(String message) { t.status = "timeout"; t.errorMessage = message; return this; }
    public Builder group(String id) { t.traceGroupId = id; return this; }
    /** Declare the prompt template so Regressa can version it. */
    public Builder template(String name, String raw) { Map<String, String> p = new LinkedHashMap<>(); p.put("name", name); p.put("raw", raw); t.promptTemplate = p; return this; }
    public Builder metadata(Map<String, Object> m) { t.metadata = m; return this; }
    public Trace build() { if (t.status == null) t.status = "success"; return t; }
  }
}
