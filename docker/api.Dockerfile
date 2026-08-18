FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @nutrition-saas/api exec prisma generate
RUN pnpm turbo build --filter=@nutrition-saas/api

FROM base AS runtime
ENV NODE_ENV=production
ENV SWAGGER_ENABLED=false
WORKDIR /app
COPY --from=build /app /app
COPY docker/api-entrypoint.sh /app/docker/api-entrypoint.sh
COPY docker/worker-entrypoint.sh /app/docker/worker-entrypoint.sh
RUN chmod +x /app/docker/api-entrypoint.sh /app/docker/worker-entrypoint.sh
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["/app/docker/api-entrypoint.sh"]
