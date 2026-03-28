FROM node:20-slim

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    make \
    g++ \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (layer caching)
COPY package*.json ./
RUN npm ci

# Copy source and compile TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Copy static assets to dist
RUN cp -r src/public dist/public

# Prune dev dependencies
RUN npm prune --omit=dev

# Create data directory for SQLite
RUN mkdir -p /app/data

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/index.js"]
