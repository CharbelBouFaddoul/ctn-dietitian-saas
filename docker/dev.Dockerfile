# Development image only. Production still uses docker/web.Dockerfile and docker/api.Dockerfile.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
ENV NODE_ENV=development

RUN mkdir -p /pnpm/store \
  && pnpm config set store-dir /pnpm/store

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @nutrition-saas/api exec prisma generate
RUN pnpm --filter "./packages/*" build

COPY docker/dev-entrypoint.sh /usr/local/bin/dev-entrypoint.sh
COPY docker/dev-web.sh /usr/local/bin/dev-web.sh
COPY docker/dev-api.sh /usr/local/bin/dev-api.sh
COPY docker/dev-worker.sh /usr/local/bin/dev-worker.sh
RUN chmod +x /usr/local/bin/dev-entrypoint.sh /usr/local/bin/dev-web.sh /usr/local/bin/dev-api.sh /usr/local/bin/dev-worker.sh

ENTRYPOINT ["/usr/local/bin/dev-entrypoint.sh"]
