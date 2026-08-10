# Multi-stage: build the TS in stage 1, ship only node_modules (prod) + lib in stage 2.
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/lib ./lib
EXPOSE 8080
# Serves the same onCall/onRequest handlers the Firebase functions exported,
# on a plain host (see src/server.ts). Requires GOOGLE_APPLICATION_CREDENTIALS
# and GCLOUD_PROJECT env (set in docker-compose.yml).
CMD ["node", "lib/server.js"]
