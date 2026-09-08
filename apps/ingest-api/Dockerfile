FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/ingest-api ./apps/ingest-api
RUN pnpm install --frozen-lockfile --filter @regressa/ingest-api...
RUN pnpm --filter @regressa/ingest-api... build
EXPOSE 4100
CMD ["node", "apps/ingest-api/dist/server.js"]
