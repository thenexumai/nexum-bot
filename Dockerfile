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

# Install ALL deps (including devDeps like typescript) for build
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Copy public assets next to compiled dist so server can find them
RUN cp -r src/public dist/public

# Remove devDeps after build to keep image lean
RUN npm prune --omit=dev

RUN mkdir -p /app/data

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "start"]
