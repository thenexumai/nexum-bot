FROM node:20-slim

WORKDIR /app

# Install system deps for native modules (better-sqlite3, node-gyp) + Playwright + edge-tts
RUN apt-get update && apt-get install -y \
    python3 python3-pip \
    make g++ build-essential \
    libsqlite3-dev \
    chromium \
    libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libgbm1 libasound2 \
    && pip3 install edge-tts --break-system-packages \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

ENV PLAYWRIGHT_BROWSERS_PATH=/usr/bin
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Build TypeScript
COPY . .
RUN npm run build

ENV NODE_ENV=production

EXPOSE 3000

# Use compiled JavaScript, not ts-node
CMD ["node", "dist/index.js"]
