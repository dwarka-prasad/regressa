# Contributing

## Where to start

See [ROADMAP.md](ROADMAP.md). Issues labelled `good first issue` are small and documented; `help wanted` are open to anyone. Comment on the issue to claim it before starting.

## Setup

```bash
pnpm install
pnpm infra:up && pnpm db:migrate && pnpm db:seed
pnpm dev
```

Node 20+, pnpm 9, Docker. Python 3.9+ for the Python SDK, Go 1.21+ and JDK 17+ for those SDKs.

## Tests

`pnpm test:all` runs vitest across the workspace, pytest, `go test` and `mvn test`. Unit tests never need
Postgres or Redis. Add tests next to the code (`*.test.ts`) and keep them free of network calls.

## Conventions

- SQL migrations are the source of truth for the schema; mirror changes in `packages/db/src/schema.ts`.
- Anything crossing a process boundary (SDK to ingest, ingest to worker) is a zod schema in `packages/shared-types`.
- Server components must not pass functions to client components; pass serializable props.
- Server-only helpers that touch `next/headers` live in `*.server.ts` files.
- Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`).

## Pull requests

CI must be green: typecheck, all test suites, and a production `next build`. Include a short note on how you
verified the change locally.
