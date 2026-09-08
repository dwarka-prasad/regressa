FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/worker ./apps/worker
RUN pnpm install --frozen-lockfile --filter @regressa/worker...
RUN pnpm --filter @regressa/worker... build
CMD ["node", "apps/worker/dist/main.js"]
