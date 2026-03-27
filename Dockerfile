FROM node:20-slim

RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    build-essential \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

# Install all deps (devDeps needed for tsc)
RUN npm ci

# Explicitly rebuild native modules (sqlite3) for this environment
RUN npm rebuild sqlite3

COPY tsconfig.json ./
COPY src ./src

# Compile TypeScript
RUN npm run build

# Copy static assets to dist
RUN cp -r src/public dist/public

# Remove devDeps to slim the image
RUN npm prune --omit=dev

# Ensure data directory exists
RUN mkdir -p /app/data

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/index.js"]
