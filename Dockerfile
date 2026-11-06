FROM node:22.21.0-bookworm-slim AS web
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client ./
COPY src /app/src
WORKDIR /app
COPY package*.json ./
RUN npm ci
RUN npm run build:web

FROM node:22.21.0-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM node:22.21.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && mkdir /workspace && chown node:node /workspace
COPY --from=build /app/dist ./dist
COPY --from=web /app/client/dist ./client/dist
USER node
ENV HOST=0.0.0.0 PORT=5002 WORKSPACE_ROOT=/workspace
VOLUME /workspace
EXPOSE 5002
CMD ["node", "dist/app/apps/control-api/main.js"]
