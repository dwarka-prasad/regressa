FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile --filter @regressa/web...
RUN pnpm --filter @regressa/web... build
EXPOSE 3100
CMD ["pnpm", "--filter", "@regressa/web", "start"]
