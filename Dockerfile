# Build Phase
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm install
COPY src ./src
RUN npm run build

# Production Phase
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/public ./dist/public

EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "dist/backend/server.js"]