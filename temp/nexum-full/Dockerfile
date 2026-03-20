FROM node:20-slim

WORKDIR /app

# Install system deps for Playwright + edge-tts
RUN apt-get update && apt-get install -y \
    python3 python3-pip \
    chromium \
    libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libgbm1 libasound2 \
    && pip3 install edge-tts --break-system-packages \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

ENV PLAYWRIGHT_BROWSERS_PATH=/usr/bin
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

COPY package*.json ./
RUN npm install

# Install playwright browsers
RUN npx playwright install chromium --with-deps 2>/dev/null || true

COPY . .

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npx", "ts-node", "src/index.ts"]
