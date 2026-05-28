FROM node:20-alpine AS deps
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm install --quiet

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY server ./server
RUN cd server && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY public ./public
RUN mkdir -p /app/data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3000/api/config || exit 1
CMD ["node", "server/dist/index.js"]
