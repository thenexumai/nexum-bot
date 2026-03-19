FROM node:20-slim

WORKDIR /app

# Install edge-tts for voice support
RUN apt-get update && apt-get install -y python3 python3-pip && \
    pip3 install edge-tts --break-system-packages && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

ENV NODE_ENV=production
ENV NODE_PORT=3000

EXPOSE 3000

CMD ["npx", "ts-node", "src/index.ts"]
