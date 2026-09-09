// auth.js
// Регистрация, вход и проверка пользователей. Пароли хешируются через
// bcryptjs (чистый JS, без компиляции — надёжно ставится на Render).
// Авторизация — через JWT в httpOnly-cookie (сервер не хранит сессии в
// памяти, поэтому это переживает перезапуск сервера).

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_COOKIE = 'token';
const TOKEN_TTL = '30d';
const TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

function dbIsReady(res) {
  if (!pool) {
    res.status(503).json({
      error: 'База данных не настроена на сервере (нет DATABASE_URL). Аккаунты сейчас недоступны.'
    });
    return false;
  }
  if (!JWT_SECRET) {
    res.status(503).json({
      error: 'JWT_SECRET не настроен на сервере. Аккаунты сейчас недоступны.'
    });
    return false;
  }
  return true;
}

function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function setAuthCookie(res, token) {
  res.cookie(TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: TOKEN_MAX_AGE_MS
  });
}

function clearAuthCookie(res) {
  res.clearCookie(TOKEN_COOKIE);
}

// Не обязательная авторизация: если токена нет или он невалиден —
// просто идём дальше как гость (req.user = null), не блокируем запрос.
function authOptional(req, res, next) {
  const token = req.cookies?.[TOKEN_COOKIE];
  req.user = null;
  if (token && JWT_SECRET) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch {
      req.user = null;
    }
  }
  next();
}

function authRequired(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Нужно войти в аккаунт.' });
  next();
}

async function registerUser(req, res) {
  if (!dbIsReady(res)) return;

  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Укажи имя пользователя и пароль.' });
  }
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({
      error: 'Имя пользователя: 3-20 символов, только латинские буквы, цифры и "_".'
    });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов.' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Это имя пользователя уже занято.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username, passwordHash]
    );

    const user = result.rows[0];
    setAuthCookie(res, signToken(user));
    res.json({ user: { id: user.id, username: user.username } });
  } catch (err) {
    console.error('Ошибка регистрации:', err);
    res.status(500).json({ error: 'Не удалось зарегистрироваться, попробуй позже.' });
  }
}

async function loginUser(req, res) {
  if (!dbIsReady(res)) return;

  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Укажи имя пользователя и пароль.' });
  }

  try {
    const result = await pool.query(
      'SELECT id, username, password_hash FROM users WHERE username = $1',
      [username]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Неверное имя пользователя или пароль.' });

    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) return res.status(401).json({ error: 'Неверное имя пользователя или пароль.' });

    setAuthCookie(res, signToken(user));
    res.json({ user: { id: user.id, username: user.username } });
  } catch (err) {
    console.error('Ошибка входа:', err);
    res.status(500).json({ error: 'Не удалось войти, попробуй позже.' });
  }
}

function logoutUser(req, res) {
  clearAuthCookie(res);
  res.json({ ok: true });
}

function meHandler(req, res) {
  res.json({ user: req.user ? { id: req.user.id, username: req.user.username } : null });
}

module.exports = {
  authOptional,
  authRequired,
  registerUser,
  loginUser,
  logoutUser,
  meHandler
};
