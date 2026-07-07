#!/bin/sh
# Генерирует nginx-конфиг с Basic Auth из ADMIN_LOGIN/ADMIN_PASSWORD.
# Кладётся в /docker-entrypoint.d/ — официальный образ nginx выполняет это до старта.
set -e

AUTH_LINES=""
if [ -n "$ADMIN_LOGIN" ] && [ -n "$ADMIN_PASSWORD" ]; then
  printf '%s:%s\n' "$ADMIN_LOGIN" "$(openssl passwd -apr1 "$ADMIN_PASSWORD")" > /etc/nginx/.htpasswd
  AUTH_LINES='auth_basic "news-poster admin"; auth_basic_user_file /etc/nginx/.htpasswd;'
  echo "admin-auth: Basic Auth включён (пользователь: $ADMIN_LOGIN)"
else
  echo "admin-auth: WARN — ADMIN_LOGIN/ADMIN_PASSWORD не заданы, админка БЕЗ пароля" >&2
fi

cat > /etc/nginx/conf.d/default.conf <<EOF
server {
  listen 80;
  server_name _;

  # /api/* -> бэкенд по имени сервиса, срезая префикс /api. Под тем же Basic Auth.
  location /api/ {
    ${AUTH_LINES}
    proxy_pass http://backend:3000/;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  }

  # SPA (history-режим vue-router), под Basic Auth.
  location / {
    ${AUTH_LINES}
    root /usr/share/nginx/html;
    try_files \$uri \$uri/ /index.html;
  }
}
EOF
