// history.js
// Сохранение и чтение истории переписки в базе данных — только для
// авторизованных пользователей (у гостей история остаётся в localStorage
// браузера, как и было раньше).

const { pool } = require('./db');

const MAX_HISTORY_MESSAGES = 200;

async function saveMessage(userId, role, content, sources = [], tone = null) {
  if (!pool || !userId) return;
  try {
    await pool.query(
      'INSERT INTO messages (user_id, role, content, sources, tone) VALUES ($1, $2, $3, $4, $5)',
      [userId, role, content, JSON.stringify(sources || []), tone]
    );
  } catch (err) {
    // Не сохранившаяся история не должна ронять ответ бота пользователю —
    // просто логируем и продолжаем.
    console.error('Не удалось сохранить сообщение в БД:', err);
  }
}

async function getHistory(userId) {
  if (!pool || !userId) return [];
  try {
    const result = await pool.query(
      `SELECT role, content, sources, tone, created_at
       FROM messages
       WHERE user_id = $1
       ORDER BY created_at ASC
       LIMIT $2`,
      [userId, MAX_HISTORY_MESSAGES]
    );
    return result.rows;
  } catch (err) {
    console.error('Не удалось прочитать историю из БД:', err);
    return [];
  }
}

async function clearHistory(userId) {
  if (!pool || !userId) return;
  try {
    await pool.query('DELETE FROM messages WHERE user_id = $1', [userId]);
  } catch (err) {
    console.error('Не удалось очистить историю в БД:', err);
  }
}

module.exports = { saveMessage, getHistory, clearHistory, MAX_HISTORY_MESSAGES };
