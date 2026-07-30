FROM node:22-alpine

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy compiled backend files
COPY dist ./dist

# Copy static frontend files
COPY src/public ./dist/public

EXPOSE 3000
ENV NODE_ENV=production

CMD ["node", "dist/backend/server.js"]
