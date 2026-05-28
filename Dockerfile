FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY server/package*.json ./server/
COPY client/package*.json ./client/
RUN cd server && npm install --quiet
RUN cd client && npm install --quiet

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY --from=deps /app/client/node_modules ./client/node_modules
COPY . .
RUN cd client && npm run build
RUN cd server && npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder --chown=appuser:appgroup /app/server/dist ./server/dist
COPY --from=builder --chown=appuser:appgroup /app/server/node_modules ./server/node_modules
COPY --from=builder --chown=appuser:appgroup /app/client/dist ./client/dist

USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3000/api/config || exit 1

CMD ["node", "server/dist/index.js"]
