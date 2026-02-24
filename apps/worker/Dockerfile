FROM oven/bun:1.2.3
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/security/package.json packages/security/package.json
COPY packages/providers-gmail/package.json packages/providers-gmail/package.json
COPY packages/observability/package.json packages/observability/package.json

RUN bun install

COPY . .

CMD ["bun", "--cwd", "apps/worker", "run", "start"]
