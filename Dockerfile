FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
RUN addgroup -S solo && adduser -S solo -G solo
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
USER solo
EXPOSE 3000
CMD ["node", "dist/server.js"]
