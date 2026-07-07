# --- backend (Express + Prisma) ---
FROM node:22-slim AS build
WORKDIR /app
# openssl нужен prisma generate, чтобы правильно определить движок (debian-openssl-3.0.x)
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# openssl нужен движку Prisma на debian-slim (и для prisma generate ниже)
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
# Ставим ТОЛЬКО production-зависимости — devDependencies (typescript, ts-node и пр.)
# в runtime-образ не попадают. prisma CLI лежит в dependencies: он нужен
# для `npx prisma migrate deploy` в CMD.
RUN npm ci --omit=dev
COPY --from=build /app/prisma ./prisma
# После чистого `npm ci` сгенерированного Prisma-клиента нет — генерируем заново
# по схеме (вариант с generate выбран вместо COPY из build: клиент гарантированно
# соответствует установленным prod-зависимостям).
RUN npx prisma generate
COPY --from=build /app/dist ./dist
EXPOSE 3000
# накатываем миграции и стартуем сервер
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
