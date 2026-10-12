// db.js
// Подключение к базе данных PostgreSQL + создание нужных таблиц при старте.
//
// ВАЖНО: используем ВНЕШНЮЮ базу (например, бесплатный Neon.tech), а не
// SQLite-файл на диске Render. Бесплатный тариф Render не сохраняет файлы
// между деплоями/перезапусками — SQLite-файл стирался бы, и все аккаунты
// с историей пропадали бы. Внешняя БД живёт отдельно от сервера и не зависит
// от его перезапусков.

const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.warn(
    '⚠️  DATABASE_URL не задан в .env — аккаунты и сохранение истории в базе ' +
    'данных работать не будут (бот всё равно будет отвечать, просто без входа/истории).'
  );
}

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      // Большинство бесплатных облачных Postgres (Neon, Render Postgres и т.п.)
      // требуют SSL, но с самоподписанным/неполным цепочечным сертификатом —
      // поэтому отключаем строгую проверку цепочки.
      ssl: { rejectUnauthorized: false }
    })
  : null;

async function initDb() {
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL,              -- 'user' или 'bot'
      content TEXT NOT NULL,
      sources JSONB DEFAULT '[]'::jsonb,
      tone TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_messages_user_created
    ON messages (user_id, created_at);
  `);

  console.log('✅ Таблицы базы данных проверены/созданы (users, messages).');
}

module.exports = { pool, initDb };
