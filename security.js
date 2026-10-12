class AppError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const fail = (status, code, message) => { throw new AppError(status, code, message); };
const assert = (condition, message = 'Неверный формат запроса.') => { if (!condition) fail(400, 'invalid_request', message); };
const uuid = value => typeof value === 'string' && /^[\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value);
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
module.exports = { AppError, fail, assert, uuid, asyncRoute };
