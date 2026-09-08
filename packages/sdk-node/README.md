# @regressa/node

Regressa SDK for Node.js. Wraps your OpenAI / Anthropic client and streams every LLM call
(prompt, response, tokens, cost, latency, prompt-template hash) to Regressa.

```bash
npm i @regressa/node
```

```ts
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { Regressa, wrapOpenAI, wrapAnthropic } from "@regressa/node";

const regressa = new Regressa({ apiKey: process.env.REGRESSA_API_KEY }); // rgsa_live_…

const openai = wrapOpenAI(new OpenAI(), regressa);
const anthropic = wrapAnthropic(new Anthropic(), regressa);

const SUPPORT_PROMPT = "You are a support agent for {{company}}. Be concise.";

await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "system", content: SUPPORT_PROMPT.replace("{{company}}", "Acme") }, { role: "user", content: q }],
  regressa: { promptTemplate: { name: "support-agent", raw: SUPPORT_PROMPT } },
});

await regressa.shutdown(); // flush on exit
```

Declaring `promptTemplate` lets Regressa detect a new *version* whenever the raw template changes and
compare eval scores / cost / latency across versions. Without it, the system message is used as the template.

Environment: `REGRESSA_API_KEY`, `REGRESSA_BASE_URL` (default `https://ingest.regressa.dev`), `REGRESSA_DISABLED=1`.
