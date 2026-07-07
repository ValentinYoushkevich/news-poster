# news-poster

Сервис аппрува и публикации новостей в Telegram-каналы.

Конвейер: **n8n** собирает новости из RSS/Telegram-источников (через RSSHub) и шлёт их в сервис → **ИИ-обработка** (смысловой дедуп по эмбеддингам, классификация по бакетам, рерайт с переводом) → **человек модерирует** карточки в веб-админке (правит текст/картинку, аппрувит с превью «как встанет в канал») → готовые посты встают в **очередь публикации**, откуда n8n по расписанию постит их в основные каналы.

> ⚠️ Сами n8n-воркфлоу (сбор и публикация) ещё не созданы — реализован REST-контракт бэкенда для них.

Подробнее:
- [docs/устройство системы.md](docs/устройство%20системы.md) — как всё работает, человеческим языком (+ «как запустить и куда заходить»);
- [docs/PO-PLAN.md](docs/PO-PLAN.md) — ТЗ: модель данных, статусная модель, REST API;
- [docs/plans/](docs/plans/) — дорожная карта и планы фаз (исторические).

## Стек

- **Бэкенд:** Node.js + TypeScript + Express, PostgreSQL + Prisma
- **Фронтенд (админка):** Vue 3 + PrimeVue + Tailwind + Vite, отдаётся через nginx
- **ИИ:** Ollama (`bge-m3`, эмбеддинги для дедупа), OpenRouter (рерайт/перевод)
- **Оркестрация:** n8n (сбор RSS и публикация), RSSHub (Telegram-источники → RSS)
- **Telegram:** один бот на все каналы, общий служебный чат (превью + CDN картинок через `file_id`)
- **Инфраструктура:** Docker Compose

## Быстрый старт

1. Скопируйте `.env.example` → `.env` и заполните: `OPENROUTER_API_KEY`, `BOT_TOKEN`, `SERVICE_CHAT_ID`, `N8N_ENCRYPTION_KEY`, `ADMIN_LOGIN`, `ADMIN_PASSWORD` (опционально `ADMIN_COOKIE_SECURE`, `REWRITE_MODEL` и др.).
2. Запустите всё:

```bash
npm run start
```

Команда соберёт и поднимет контейнеры (`docker compose up --build -d`) и напечатает адреса сервисов.

## Сервисы и порты

| Сервис | Адрес | Примечание |
|---|---|---|
| Админка | http://localhost:8081 | вход по логину/паролю из `ADMIN_LOGIN`/`ADMIN_PASSWORD` (страница `/login`) |
| n8n | http://localhost:5678 | оркестратор сбора и публикации |
| RSSHub | http://localhost:1200 | Telegram-источники → RSS |
| Ollama | http://localhost:11434 | эмбеддинги |
| Backend | — | наружу не публикуется: с хоста только через nginx (`/api`), внутри docker-сети — `backend:3000` |
| Postgres | — | внешнего порта нет |

nginx проверяет каждый запрос к `/api/*` через `auth_request` (cookie-сессия `admin_session`); n8n ходит в бэкенд напрямую по docker-сети, без аутентификации.

## Команды

| Команда | Что делает |
|---|---|
| `npm run start` | поднять всё в Docker и напечатать адреса |
| `npm run stop` | остановить контейнеры |
| `npm run logs` | логи всех сервисов (follow) |
| `npm run dev` | бэкенд локально в watch-режиме (tsx) |
| `npm run test` | тесты (Vitest + Supertest, нужен Postgres) |
| `npm run build` | сборка бэкенда (tsc) |

## Структура репозитория

```
src/          бэкенд: routes → services → db (Prisma), ИИ-воркер, Telegram-клиент, auth
web/          фронтенд-админка (Vue 3 + PrimeVue) и конфиг nginx (default.conf)
prisma/       схема БД и миграции
scripts/      start.mjs — запуск docker compose + печать адресов
tests/        интеграционные и юнит-тесты бэкенда
docs/         ТЗ (PO-PLAN.md), «устройство системы.md», планы фаз (plans/)
docker-compose.yml, Dockerfile — контейнеры: db, backend, web (nginx), n8n, rsshub, ollama
```
