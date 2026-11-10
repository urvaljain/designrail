# syntax=docker/dockerfile:1
FROM node:22-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
ENV BUILD_STANDALONE=true NEXT_TELEMETRY_DISABLED=1
# A placeholder URL is enough to build: pages are rendered on demand, never at build time.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npm run build

# Web server: the self-contained Next.js build, running as a non-root user.
FROM base AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]

# Worker and one-off tasks (migrations, sync): full dependencies and source.
FROM deps AS worker
COPY . .
RUN npx prisma generate
ENV NODE_ENV=production
USER node
CMD ["npm", "run", "worker"]
