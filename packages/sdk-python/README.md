# regressa-sdk

Regressa SDK for Python. Wraps your OpenAI / Anthropic client and streams every LLM call
(prompt, response, tokens, cost, latency, prompt-template hash) to Regressa.

```bash
pip install regressa-sdk
```

```python
from openai import OpenAI
from anthropic import Anthropic
from regressa import Regressa, wrap_openai, wrap_anthropic

regressa = Regressa(api_key="rgsa_live_...")  # or REGRESSA_API_KEY env var

openai = wrap_openai(OpenAI(), regressa)
anthropic = wrap_anthropic(Anthropic(), regressa)

SUPPORT_PROMPT = "You are a support agent for {company}. Be concise."

openai.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "system", "content": SUPPORT_PROMPT.format(company="Acme")}, {"role": "user", "content": q}],
    regressa_prompt_template={"name": "support-agent", "raw": SUPPORT_PROMPT},
)

regressa.shutdown()  # flush; also registered via atexit
```

Passing `regressa_prompt_template` lets Regressa detect a new *version* whenever the raw template changes and
compare eval scores / cost / latency across versions. Without it, the system message is used as the template.

Environment: `REGRESSA_API_KEY`, `REGRESSA_BASE_URL` (default `https://ingest.regressa.dev`), `REGRESSA_DISABLED=1`.
