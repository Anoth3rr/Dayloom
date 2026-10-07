FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production DAYLOOM_HOST=0.0.0.0 DAYLOOM_PORT=4318 DAYLOOM_DATA_DIR=/data
COPY --from=build /app/dist ./dist
COPY shared ./shared
COPY server ./server
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 4318
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:4318/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.mjs"]
