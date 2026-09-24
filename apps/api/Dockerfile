FROM oven/bun:1.3 AS base
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY packages/sdk/package.json packages/sdk/
RUN bun install --frozen-lockfile --filter @scrappy/api
COPY apps/api apps/api
WORKDIR /app/apps/api
ENV PORT=8787
EXPOSE 8787
CMD ["bun", "src/index.ts"]
