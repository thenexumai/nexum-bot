FROM node:20-slim

WORKDIR /app

# Install system deps ONLY for better-sqlite3 (native module)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    build-essential \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install ONLY production dependencies (no devDependencies)
RUN npm ci --only=production

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Copy public folder to dist (for mini-apps)
RUN cp -r src/public dist/public

ENV NODE_ENV=production

EXPOSE 3000

# Use compiled JavaScript
CMD ["node", "dist/index.js"]
