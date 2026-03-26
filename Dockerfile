FROM node:20-slim

WORKDIR /app

# Install Python (needed for some npm packages)
RUN apt-get update && apt-get install -y python3 && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies (sqlite3 has prebuilt binaries - no compilation needed)
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
