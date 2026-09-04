FROM node:22-bookworm-slim

WORKDIR /app

# Install dependencies first so this layer is cached unless package*.json change
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App source
COPY db.js processImage.js auth.js server.js ./
COPY public ./public

# SQLite data lives here — mounted as a volume in docker-compose.yml so it
# survives container rebuilds.
RUN mkdir -p /app/data

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
