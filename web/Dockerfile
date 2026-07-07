# --- web admin (Vue build -> nginx) ---
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
RUN apk add --no-cache openssl
COPY docker-entrypoint.d/40-admin-auth.sh /docker-entrypoint.d/40-admin-auth.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
