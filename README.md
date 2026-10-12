# Aevrix AI 3.0

Исходный код и инструкции находятся в [AevrixAI](AevrixAI/README.md).

## Существующий сервис Render

| Настройка | Значение |
|---|---|
| Branch | `main` |
| Root Directory | `AevrixAI` |
| Build Command | `npm ci --omit=dev --ignore-scripts` |
| Start Command | `npm start` |
| Health Check Path | `/readyz` |
| Instances | `1` |
| NODE_VERSION | `24.20.0` |
| NODE_ENV | `production` |

`PUBLIC_ORIGIN` должен содержать фактический HTTPS-адрес сайта. Сохраните существующие ключи провайдеров, `DATABASE_URL` и `JWT_SECRET` в Environment сервиса. Минимальная длина `JWT_SECRET` при подключённой БД — 32 байта.

Перед миграцией непустой старой БД сделайте и проверьте резервную копию. `LEGACY_BACKUP_CONFIRMED=true` устанавливается только после этой проверки; сам флаг резервную копию не создаёт. Подробная процедура сохранения и восстановления данных находится в README приложения.

Для первого запуска 3.0 сначала настройте сервис, затем выполните ручной Deploy latest commit. Коммит исправления структуры содержит `[skip render]`, чтобы он не запускал обновление до настройки сервиса. После запуска проверьте `/healthz`, `/readyz`, вход и ответ бота.

Официальные инструкции: [папка приложения](https://render.com/docs/monorepo-support), [деплой](https://render.com/docs/deploys), [health checks](https://render.com/docs/health-checks).
