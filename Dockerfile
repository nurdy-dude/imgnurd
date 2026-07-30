# ==========================================
# Phase 1: Build Phase
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json tsconfig.json ./

# Install all dependencies (including devDependencies needed for build)
RUN npm ci || npm install

# Copy source files
COPY src ./src

# Compile TypeScript to JavaScript in /app/dist
RUN npm run build

# ==========================================
# Phase 2: Production Runtime Phase
# ==========================================
FROM node:22-alpine

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production || npm install --production

# Copy compiled JavaScript backend from the builder phase
COPY --from=builder /app/dist ./dist

# Copy static frontend HTML/assets into runtime location
COPY --from=builder /app/src/public ./dist/public

# Expose default application port
EXPOSE 3000

# Set production environment
ENV NODE_ENV=production

# Start the imgnurd server
CMD ["node", "dist/backend/server.js"]
