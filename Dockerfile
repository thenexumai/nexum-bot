FROM node:20-alpine AS builder

RUN apk add --no-cache python3 py3-pip make g++ sqlite

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine

RUN apk add --no-cache python3 py3-pip sqlite ffmpeg

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/public ./src/public
COPY system ./system

RUN mkdir -p data logs

EXPOSE 3000
CMD ["node", "dist/index.js"]
