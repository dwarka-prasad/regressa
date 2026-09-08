import { Regressa } from "@regressa/node";

const regressa = new Regressa({ apiKey: process.env.REGRESSA_API_KEY, baseUrl: "http://localhost:4100" });

regressa.trace({
  model: "gpt-4o-mini", provider: "openai",
  input_messages: [{ role: "system", content: "Say hi to {{name}}" }, { role: "user", content: "Ada" }],
  output_text: "Hi Ada!", prompt_tokens: 12, completion_tokens: 3, latency_ms: 380,
  prompt_template: { name: "greeting", raw: "Say hi to {{name}}" },
});
await regressa.shutdown();
