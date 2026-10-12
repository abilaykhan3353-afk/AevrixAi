const fs = require('node:fs');
function config(env = process.env) {
  const number = (key, fallback, min, max) => {
    const n = Number(env[key] || fallback);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Invalid configuration: ${key}`);
    return n;
  };
  const production = env.NODE_ENV === 'production';
  if (env.DATABASE_URL && (!env.JWT_SECRET || Buffer.byteLength(env.JWT_SECRET) < 32)) throw new Error('Set JWT_SECRET to at least 32 bytes before enabling accounts.');
  if (production && !env.PUBLIC_ORIGIN) throw new Error('PUBLIC_ORIGIN is required in production.');
  const origin = env.PUBLIC_ORIGIN ? new URL(env.PUBLIC_ORIGIN).origin : null;
  if (production && !origin.startsWith('https://')) throw new Error('Production PUBLIC_ORIGIN must use HTTPS.');
  return { production, origin, port: number('PORT', 3000, 1, 65535),
    proxyHops: number('TRUST_PROXY_HOPS', 0, 0, 5),
    origins: new Set((env.ALLOWED_ORIGINS || '').split(',').filter(Boolean).map(s => new URL(s.trim()).origin)),
    jwtSecret: env.JWT_SECRET, adminPassword: env.ADMIN_PASSWORD,
    databaseUrl: env.DATABASE_URL, ssl: env.PG_SSL_MODE !== 'disable',
    ca: env.PG_CA_FILE ? fs.readFileSync(env.PG_CA_FILE, 'utf8') : undefined,
    deadlineMs: number('REQUEST_DEADLINE_MS', 60000, 1000, 120000),
    contextTokens: number('CONTEXT_TOKEN_BUDGET', 14000, 2000, 60000),
    outputTokens: number('MAX_OUTPUT_TOKENS', 4096, 256, 16000),
    ratePerMinute: number('CHAT_REQUESTS_PER_MINUTE', 12, 1, 100),
    maxActive: number('MAX_ACTIVE_GENERATIONS', 8, 1, 32),
    dailyRequests: number('MAX_DAILY_GENERATIONS', 500, 1, 100000),
    retentionDays: number('DATA_RETENTION_DAYS', 0, 0, 3650),
    groqKey: env.GROQ_API_KEY, chatModel: env.CHAT_MODEL || 'openai/gpt-oss-20b',
    fallbackModel: env.CHAT_FALLBACK_MODEL || '', visionModel: env.VISION_MODEL || 'qwen/qwen3.8-27b',
    geminiKey: env.GEMINI_API_KEY, geminiModel: env.GEMINI_MODEL || 'gemini-3.8-flash',
    tavilyKey: env.TAVILY_API_KEY, braveKey: env.BRAVE_API_KEY,
    pollinationsKey: env.POLLINATIONS_API_KEY, imageModel: env.IMAGE_MODEL || 'flux',
    telegramToken: env.TELEGRAM_BOT_TOKEN, telegramChat: env.TELEGRAM_CHAT_ID, webhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
    newsdataKey: env.NEWSDATA_API_KEY, gnewsKey: env.GNEWS_API_KEY };
}
module.exports = { config };
