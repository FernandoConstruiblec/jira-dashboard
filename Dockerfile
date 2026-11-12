# Imagen única (API + dashboard) para cualquier plataforma que ejecute contenedores.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
COPY backend/package.json backend/package-lock.json backend/
COPY frontend/package.json frontend/package-lock.json frontend/
RUN npm run install:all
COPY backend backend
COPY frontend frontend
RUN npm run build && npm --prefix backend prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3100
COPY --from=build /app/package.json ./
COPY --from=build /app/backend/package.json backend/
COPY --from=build /app/backend/node_modules backend/node_modules
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/backend/dashboard.config.json backend/
COPY --from=build /app/frontend/dist frontend/dist
EXPOSE 3100
HEALTHCHECK CMD wget -qO- http://localhost:${PORT}/api/health || exit 1
CMD ["node", "backend/dist/main.js"]
