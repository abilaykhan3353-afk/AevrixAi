const jwt = require('jsonwebtoken');
const { randomUUID, randomBytes, timingSafeEqual } = require('node:crypto');
const { AppError, fail, assert } = require('./errors');
function limiter(limit, windowMs, maxKeys = 10000) {
  const entries = new Map();
  return (req, res, next) => {
    const now = Date.now(), key = req.user ? 'u:' + req.user.id : 'ip:' + req.ip;
    for (const [k, v] of entries) { if (v.until <= now) entries.delete(k); }
    if (!entries.has(key) && entries.size >= maxKeys) return next(new AppError(429, 'busy', 'Слишком много запросов. Попробуй позже.'));
    const entry = entries.get(key) || { count: 0, until: now + windowMs };
    entries.set(key, entry); entry.count++;
    if (entry.count > limit) { res.set('Retry-After', String(Math.ceil((entry.until - now) / 1000))); return next(new AppError(429, 'rate_limit', 'Слишком много запросов. Подожди немного.')); }
    next();
  };
}
function authMiddleware(cfg, db) {
  return async (req, res, next) => {
    req.user = null;
    if (req.cookies.token && cfg.jwtSecret && db) {
      try {
        const payload = jwt.verify(req.cookies.token, cfg.jwtSecret, { algorithms: ['HS256'], issuer: 'aevrix', audience: 'aevrix-web' });
        const user = (await db.query('SELECT id,username,session_version FROM users WHERE id=$1', [payload.id])).rows[0];
        if (user && user.session_version === payload.v) req.user = user;
      } catch (error) { if (!['JsonWebTokenError','TokenExpiredError','NotBeforeError'].includes(error.name)) return next(error); }
    }
    let guest = req.cookies.guest;
    if (typeof guest !== 'string' || !/^[a-f0-9]{48}$/.test(guest)) {
      guest = randomBytes(24).toString('hex');
      res.cookie('guest', guest, { httpOnly: true, secure: cfg.production, sameSite: 'strict', maxAge: 86400000 * 30 });
    }
    req.actor = req.user ? 'u:' + req.user.id : 'g:' + guest;
    req.requestId = randomUUID(); next();
  };
}
const required = (req, res, next) => req.user ? next() : next(new AppError(401, 'unauthorized', 'Войди в аккаунт.'));
function originGuard(cfg) {
  return (req, res, next) => {
    const origin = req.get('origin');
    const own = cfg.origin || `${req.protocol}://${req.get('host')}`;
    // Opening the public page from Render/search is navigation, not an API call.
    const publicNavigation = ['GET', 'HEAD'].includes(req.method)
      && ['/', '/index.html'].includes(req.path)
      && req.get('sec-fetch-mode') === 'navigate'
      && req.get('sec-fetch-dest') === 'document';
    if (origin && origin !== own && !cfg.origins.has(origin)) return next(new AppError(403, 'origin_forbidden', 'Источник запроса не разрешён.'));
    if (req.get('sec-fetch-site') === 'cross-site' && !origin && !publicNavigation && !req.path.startsWith('/api/telegram/')) return next(new AppError(403, 'origin_forbidden', 'Источник запроса не разрешён.'));
    if (origin && cfg.origins.has(origin)) { res.set('Access-Control-Allow-Origin', origin); res.set('Access-Control-Allow-Credentials', 'true'); res.vary('Origin'); }
    if (req.method === 'OPTIONS') { res.set('Access-Control-Allow-Headers', 'Content-Type'); res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE'); return res.sendStatus(204); }
    next();
  };
}
function admin(cfg) {
  return (req, res, next) => {
    if (!cfg.adminPassword) return next(new AppError(503, 'admin_disabled', 'Админ-панель отключена.'));
    const header = req.get('authorization') || '';
    const decoded = header.startsWith('Basic ') ? Buffer.from(header.slice(6), 'base64').toString() : '';
    const i = decoded.indexOf(':');
    const actual = Buffer.from(i >= 0 ? decoded.slice(i + 1) : '');
    const expected = Buffer.from(cfg.adminPassword);
    if (actual.length === expected.length && timingSafeEqual(actual, expected)) return next();
    res.set('WWW-Authenticate', 'Basic realm="Aevrix Admin"');
    next(new AppError(401, 'admin_unauthorized', 'Нужен пароль администратора.'));
  };
}
function imageBytes(image) {
  assert(image && typeof image === 'object' && typeof image.data === 'string' && image.data.length <= 8 * 1024 * 1024);
  assert(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image.data) && image.data.length > 0, 'Некорректное изображение.');
  const data = Buffer.from(image.data, 'base64');
  let mime;
  if (data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mime = 'image/png';
  else if (data[0] === 255 && data[1] === 216 && data[2] === 255) mime = 'image/jpeg';
  else if (data.subarray(0,4).toString() === 'RIFF' && data.subarray(8,12).toString() === 'WEBP') mime = 'image/webp';
  assert(mime && mime === image.mimeType && data.length <= 6 * 1024 * 1024 && data.length >= 12, 'Нужен PNG, JPEG или WebP до 6 МБ.');
  return { data, mimeType: mime };
}
module.exports = { limiter, authMiddleware, required, originGuard, admin, imageBytes };
