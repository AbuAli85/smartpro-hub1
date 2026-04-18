# ─── Stage 1: Dependencies ───────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Install pnpm (version must match packageManager field in package.json)
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Copy lockfile and manifests only (better layer caching)
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

RUN pnpm install --frozen-lockfile --prod=false

# ─── Stage 2: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build client (Vite) + server (esbuild) in production mode
RUN NODE_ENV=production pnpm build

# ─── Stage 3: Production runtime ─────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Non-root user for least-privilege execution
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 appuser

# Copy only what is needed to run
COPY --from=builder --chown=appuser:nodejs /app/dist ./dist
COPY --from=builder --chown=appuser:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=appuser:nodejs /app/package.json ./package.json

# Install production dependencies only (no dev tools)
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY pnpm-lock.yaml ./
COPY patches/ ./patches/
RUN pnpm install --frozen-lockfile --prod

USER appuser

EXPOSE 3000

ENV NODE_ENV=production \
    PORT=3000

CMD ["node", "dist/index.js"]
