# Balance service

API списания/начисления баланса пользователя на основе журнала операций (append-only ledger).

Стек: NestJS 10 · Prisma 6 · PostgreSQL 16 · Redis 7 · class-validator · Swagger · Jest · Docker Compose.

## Модель данных

- `users(id, balance, ...)`
- `transaction_history(id, user_id, action, amount, ts)`

`transaction_history` — источник истины. `users.balance` пересчитывается как `SUM(transaction_history.amount)` внутри той же транзакции, в которой добавляется новая запись.

## Запуск

```bash
cp .env.example .env
npm install

docker compose up -d
npx prisma migrate deploy
npm run prisma:seed

npm run start:dev
```

API: `http://localhost:3000`. Swagger: `http://localhost:3000/docs`.

Postgres/Redis в docker-compose проброшены на порты 5433/6380 (не дефолтные 5432/6379).

Полностью в Docker:

```bash
docker build -t balance-service .
docker run --rm -p 3000:3000 \
  --network balance-service_default \
  -e DATABASE_URL=postgresql://postgres:postgres@postgres:5432/balance_service?schema=public \
  -e REDIS_HOST=redis -e REDIS_PORT=6379 \
  -e REDIS_BALANCE_TTL_SECONDS=30 \
  balance-service
```

## Эндпоинты

| Метод | Путь                      | Описание                                    |
| ----- | ------------------------- | -------------------------------------------- |
| GET   | `/users/:id/balance`      | Текущий баланс (кэш Redis)                   |
| POST  | `/users/:id/transactions` | Запись операции, пересчёт баланса            |
| GET   | `/health`                 | Статус Postgres + Redis                       |

```json
POST /users/1/transactions
{ "action": "PURCHASE", "amount": "100.00" }
```

`action`: `PURCHASE` (списание), `TOPUP` / `REFUND` (начисление). `amount` — положительная строка, направление берётся из `action`.

Коды ответов: `404` — пользователь не найден, `409` — недостаточно средств, `400` — невалидный ввод.

## Ключевые решения

- Деньги — `Prisma.Decimal` везде, без `number`/float.
- Конкурентные списания одного пользователя сериализуются через `SELECT ... FOR UPDATE`.
- CHECK-constraints в БД: `balance >= 0`, `amount <> 0`.
- Кэш баланса в Redis — cache-aside, инвалидация (`DEL`) после коммита транзакции, TTL 30с.
- Конфиг валидируется при старте (`src/config/env.validation.ts`).

## Тесты

```bash
npm test          # юнит, без БД
npm run test:e2e  # против реальных Postgres/Redis, требует docker compose up -d + миграции
```

`test/app.e2e-spec.ts` включает тест на гонки: 10 параллельных `PURCHASE` против баланса 500 — проходит ровно 5, баланс не уходит в минус.

## Не реализовано

- Авторизация — не требовалась по заданию.
- Idempotency-ключи на повторный запрос.
- Эндпоинт со списком истории операций.

## Структура

```
prisma/schema.prisma, migrations/, seed.ts
src/
  config/        валидация env
  prisma/        PrismaService
  redis/         RedisService
  common/        ключ кэша
  users/         GET баланса
  transactions/  POST операция
  health/        GET /health
```
