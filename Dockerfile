# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
# .npmrc comes along deliberately: it is what stops npm compiling
# better-sqlite3 from source, which is why no toolchain is installed above.
# better-sqlite3 13 ships a linuxmusl prebuild, so alpine is served too.
COPY package.json package-lock.json .npmrc ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 BUILD_STANDALONE=1
RUN npm run build

FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat tini
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 DATA_DIR=/data

RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Scripts and their runtime deps, so `docker compose exec app npm run bootstrap` works.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/lib ./lib
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

RUN mkdir -p /data/assets /data/backups && chown -R nextjs:nodejs /data
VOLUME /data
USER nextjs
EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
