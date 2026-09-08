# Local development

```bash
cp .env.example .env
pnpm install
pnpm infra:up         # TimescaleDB :5433, Redis :6380
pnpm db:migrate
pnpm db:seed          # prints a test API key
pnpm dev              # web :3100, ingest-api :4100, worker
```

Then either sign up at http://localhost:3100/signup, or use the seeded key with the SDK examples:

```bash
REGRESSA_API_KEY=rgsa_test_... REGRESSA_BASE_URL=http://localhost:4100 npx tsx packages/sdk-node/examples/basic.ts
```

Python SDK: `cd packages/sdk-python && pip install -e '.[dev]' && pytest`.
