// Backend-сервер на Express.
// Принимает сообщения от чата в браузере, пересылает их в Groq API
// (со встроенным веб-поиском) и стримит ответ обратно по частям.
// Ключи API хранятся только здесь, на сервере, и никогда не попадают в браузер.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');

const { initDb } = require('./db');
const auth = require('./auth');
const history = require('./history');

const app = express();
const PORT = process.env.PORT || 3000;

// Учитываем реальный IP посетителя, даже если запрос идёт через ngrok/прокси/Render
app.set('trust proxy', true);

// Модели с веб-поиском — у них отдельный, более скромный лимит запросов,
// поэтому используем их только когда вопрос реально требует свежих данных.
const SEARCH_MODEL = 'groq/compound';
const SEARCH_FALLBACK_MODEL = 'groq/compound-mini';

// Обычная модель без поиска — гораздо больший лимит, используем для
// повседневного общения (шутки, мнения, объяснения общих понятий и т.д.)
const CHAT_MODEL = 'openai/gpt-oss-20b';

// Специальная модель, которая умеет "смотреть" на изображения (у остальных
// моделей такой возможности нет). ВНИМАНИЕ: у Groq модели для картинок
// меняются особенно часто — если снова появится ошибка "model_not_found",
// значит эту тоже успели снять, и нужно смотреть актуальный список на
// https://console.groq.com/docs/vision
const VISION_MODEL = 'qwen/qwen3.6-27b';

const SEARCH_TIMEOUT_MS = 20000;
const SEARCH_FALLBACK_TIMEOUT_MS = 20000;
const CHAT_TIMEOUT_MS = 20000;
const VISION_TIMEOUT_MS = 25000;

// Простая эвристика: похоже ли сообщение на вопрос, которому нужны
// актуальные/свежие данные (новости, погода, курсы, "сегодня/сейчас" и т.д.)?
const SEARCH_TRIGGERS = [
  'сегодня', 'сейчас', 'последн', 'новост', 'погод', 'курс валют', 'курс доллара',
  'курс евро', 'актуальн', 'в этом году', 'цена на', 'сколько стоит', 'результат матча',
  'счёт матча', 'кто выиграл', 'кто сейчас', 'кто является', 'текущий', 'на данный момент',
  'обновлени', 'вышла ли', 'вышел ли', 'релиз', 'выборы', 'котировк', 'что происходит',
  'найди', 'поищи', 'загугли', 'посмотри в интернете',
  // явные просьбы перепроверить/подтвердить факт — тоже должны запускать поиск,
  // а не полагаться на память модели
  'правда ли', 'это точно', 'точно ли', 'проверь', 'перепроверь', 'не ошибаюсь ли',
  'не путаю ли', 'это факт', 'это миф', 'подтверди', 'уверен ли ты', 'ты уверен',
  'источник', 'откуда информация',
  // акции/крипта/версии ПО — тоже часто требуют свежих данных
  'акции', 'биткоин', 'криптовалют', 'последняя версия', 'новая версия',
  // ещё формулировки про свежесть/статус/время, которые раньше не ловились
  'что нового', 'какая погода', 'какой курс', 'на сегодня', 'на сейчас',
  'сейчас идёт', 'сейчас происходит', 'ещё актуально', 'до сих пор',
  'уже вышел', 'уже вышла', 'уже случилось', 'статистика на',
  // частые сокращения и разговорные варианты — тоже должны запускать поиск
  'щас', 'седня', 'счас'
];

// Приводим текст к более "стандартному" виду перед сравнением:
// - "ё" почти всегда печатают как "е" (это не опечатка, а норма набора текста)
function normalizeRu(text) {
  return text.toLowerCase().replace(/ё/g, 'е');
}

// Расстояние Левенштейна — сколько правок (замена/вставка/удаление одной
// буквы) нужно, чтобы превратить одно слово в другое. Используем для
// поиска триггеров даже при опечатке в сообщении пользователя.
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

// Проверяет, похоже ли слово сообщения на слово-триггер с учётом
// возможной опечатки (используется и для одиночных, и для составных
// триггеров — см. needsSearch).
function fuzzyWordMatches(word, target) {
  if (word === target) return true;
  const maxDistance = target.length > 6 ? 2 : 1;
  if (Math.abs(word.length - target.length) > maxDistance + 2) return false;
  return levenshtein(word, target) <= maxDistance;
}

function needsSearch(message) {
  const text = normalizeRu(message);
  if (/\b20(2[4-9]|3\d)\b/.test(text)) return true;

  // Точное совпадение (самый частый случай — без опечаток)
  if (SEARCH_TRIGGERS.some((trigger) => text.includes(trigger))) return true;

  // Опечатка в любом слове триггера — разбиваем и сообщение, и каждый
  // триггер на отдельные слова: если для каждого слова триггера
  // (например "курс" и "валют" для триггера "курс валют") в сообщении
  // нашлось похожее слово (с учётом опечатки) — считаем, что триггер
  // сработал. Так опечатки ловятся и в однословных ("севодня"), и в
  // составных ("курс валлют", "результад матча") триггерах.
  const words = text.split(/[^а-яa-z0-9]+/).filter((w) => w.length > 2);

  return SEARCH_TRIGGERS.some((trigger) => {
    const triggerWords = trigger.split(' ');
    return triggerWords.every((tw) => words.some((w) => fuzzyWordMatches(w, tw)));
  });
}

/* =====================================================================
   ГЕНЕРАЦИЯ ИЗОБРАЖЕНИЙ — через Pollinations.ai (бесплатно, без API-ключа).
   Если сообщение похоже на просьбу нарисовать/сгенерировать картинку —
   достаём описание, улучшаем его через ИИ (перевод + добавление деталей —
   так модель генерации понимает запрос точнее) и строим прямую ссылку на
   изображение, минуя обычный чат-запрос к Groq/Gemini.
   ===================================================================== */

// Регулярка вместо жёсткого списка фраз — ловит разные формы глагола
// ("нарисуй", "нарисуешь", "нарисуйте", "можешь нарисовать") и разные
// формулировки ("хочу картинку", "нужно изображение" и т.п.), а не только
// точные совпадения из списка.
const IMAGE_GEN_REGEX = new RegExp(
  '(?<![а-яёa-z])(' +
    'нарис[а-яё]*|' +                              // нарисуй/нарисовать/нарисовал/нарисую и т.д.
    'сгенерир[а-яё]*\\s*(?:картинк[а-яё]*|изображени[а-яё]*|фото[а-яё]*|рисун[а-яё]*)?|' +
    'изобрази[а-яё]*|' +
    'визуализир[а-яё]*|' +
    'создай[а-яё]*\\s+(?:картинк[а-яё]*|изображени[а-яё]*|рисун[а-яё]*)|' +
    'сделай[а-яё]*\\s+(?:картинк[а-яё]*|изображени[а-яё]*|рисун[а-яё]*)|' +
    'хочу\\s+(?:увидеть\\s+)?(?:картинк[а-яё]*|изображени[а-яё]*)|' +
    'нужн[а-яё]*\\s+(?:картинк[а-яё]*|изображени[а-яё]*)|' +
    'draw\\s+(?:a|me)|generate\\s+(?:an\\s+)?image|generate\\s+a\\s+picture|create\\s+an\\s+image' +
  ')(?![а-яёa-z])',
  'i'
);

function detectImageGenPrompt(message) {
  const match = message.match(IMAGE_GEN_REGEX);
  if (!match) return null; // сообщение вообще не похоже на просьбу нарисовать

  // Убираем саму фразу-триггер из сообщения — остальное и есть описание,
  // независимо от того, стоит триггер в начале, середине или конце фразы
  let rest = (message.slice(0, match.index) + ' ' + message.slice(match.index + match[0].length)).trim();

  // Убираем частые связки/мусор по краям ("мне", "пожалуйста", "можешь" и
  // т.п.) — повторяем, пока строка перестанет меняться, т.к. таких слов
  // подряд может быть несколько ("мне, пожалуйста" → сначала уйдёт "мне",
  // потом "пожалуйста")
  let prev;
  do {
    prev = rest;
    rest = rest.replace(/^(мне|для меня|пожалуйста|можешь|сможешь|ты можешь)[:\-,]?\s*/i, '').trim();
  } while (rest !== prev);
  rest = rest.replace(/[.!?\s]+$/, '').trim();

  return rest; // '' означает "похоже на просьбу нарисовать, но без описания"
}

// Улучшает описание перед генерацией: переводит на английский и добавляет
// немного художественных деталей — модели генерации изображений (в т.ч.
// та, что стоит за Pollinations) заметно точнее понимают развёрнутый
// промпт на английском, чем короткую фразу на русском.
async function enhanceImagePrompt(rawPrompt) {
  try {
    const messages = [
      {
        role: 'system',
        content:
          'Ты помогаешь модели генерации изображений понять, что нарисовать. ' +
          'Переведи и разверни следующее описание в чёткий, подробный промпт на ' +
          'английском языке (композиция, стиль, освещение, детали) — максимум 50 ' +
          'слов. Не меняй смысл и не добавляй ничего, чего не было в описании или ' +
          'что не следует из него логично. Ответь ТОЛЬКО самим промптом, без ' +
          'кавычек и пояснений.'
      },
      { role: 'user', content: rawPrompt }
    ];
    const result = await callGroq(CHAT_MODEL, messages, 8000, 0.6);
    if (result.ok) {
      const { reply } = extractReplyAndSources(result.data);
      const cleaned = reply?.trim().replace(/^"|"$/g, '');
      if (cleaned && cleaned.length > 3) return cleaned;
    }
  } catch (err) {
    console.error('Не удалось улучшить промпт для генерации картинки:', err);
  }
  return rawPrompt; // если что-то пошло не так — генерируем как есть, не блокируем ответ
}

function buildPollinationsUrl(prompt) {
  const encoded = encodeURIComponent(prompt.slice(0, 600));
  const seed = Math.floor(Math.random() * 1_000_000);
  return `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&seed=${seed}&nologo=true`;
}

/* =====================================================================
   ЛОГИРОВАНИЕ ПЕРЕПИСКИ (для /admin)
   Каждое сообщение и ответ бота дописываются в файл conversations.log.jsonl
   (по одной JSON-записи на строку). Так ты можешь посмотреть, о чём
   спрашивают друзья, когда тестируют бота через твою ссылку.

   ВНИМАНИЕ: на бесплатном Render этот файл, как и всё на диске, стирается
   при каждом деплое/перезапуске — используй его только для быстрого
   просмотра "живых" сообщений, а не как постоянный архив. Постоянная
   история переписки авторизованных пользователей хранится в БД (history.js).
   ===================================================================== */

const LOG_FILE = path.join(__dirname, 'conversations.log.jsonl');

function logConversation(entry) {
  fs.appendFile(LOG_FILE, JSON.stringify(entry) + '\n', (err) => {
    if (err) console.error('Не удалось записать в лог переписки:', err);
  });
}

function readConversationLog(limit = 200) {
  if (!fs.existsSync(LOG_FILE)) return [];
  const lines = fs.readFileSync(LOG_FILE, 'utf-8').trim().split('\n').filter(Boolean);
  const entries = lines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return entries.slice(-limit).reverse(); // новые сверху
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

process.on('uncaughtException', (err) => {
  console.error('⚠️  Необработанная ошибка (сервер продолжает работу):', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('⚠️  Необработанный отказ промиса (сервер продолжает работу):', reason);
});

app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json({ limit: '12mb' }));
app.use(express.static(__dirname));
app.use(auth.authOptional); // req.user доступен во всех роутах ниже (или null, если гость)

/* =====================================================================
   ЗАЩИЩЁННАЯ СТРАНИЦА /admin
   Показывает всю переписку. Если задать ADMIN_PASSWORD в .env — страница
   попросит пароль (HTTP Basic Auth). Если не задать — будет открыта всем,
   у кого есть твоя ссылка, так что задать пароль настоятельно рекомендуется
   перед тем как делиться ссылкой.
   ===================================================================== */

function requireAdminAuth(req, res, next) {
  if (!process.env.ADMIN_PASSWORD) {
    return next(); // пароль не задан — пропускаем (но предупреждали в консоли при старте)
  }

  const authHeader = req.headers.authorization || '';
  const [scheme, encoded] = authHeader.split(' ');

  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    const [, password] = decoded.split(':');
    if (password === process.env.ADMIN_PASSWORD) {
      return next();
    }
  }

  res.set('WWW-Authenticate', 'Basic realm="Aevrix Ai Admin"');
  return res.status(401).send('Требуется пароль администратора.');
}

app.get('/admin', requireAdminAuth, (req, res) => {
  const entries = readConversationLog();

  const rows = entries
    .map((e) => {
      const time = new Date(e.time).toLocaleString('ru-RU');
      const badge = e.usedSearch ? '🔎 поиск' : '💬 чат';
      return `
        <div class="entry">
          <div class="meta">${escapeHtml(time)} · ${escapeHtml(e.ip || '—')} · ${badge} · тон: ${escapeHtml(e.tone || 'neutral')}</div>
          <div class="msg user"><strong>Вопрос:</strong> ${escapeHtml(e.message)}</div>
          <div class="msg bot"><strong>Ответ:</strong> ${escapeHtml(e.reply)}</div>
        </div>`;
    })
    .join('');

  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <title>Aevrix Ai — переписка</title>
      <style>
        body { background:#0A0D16; color:#F4F6FC; font-family: system-ui, sans-serif; padding: 24px; max-width: 800px; margin: 0 auto; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        .count { color: #9BA3BD; font-size: 13px; margin-bottom: 20px; }
        .entry { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; }
        .meta { font-size: 11px; color: #9BA3BD; margin-bottom: 8px; }
        .msg { font-size: 14px; line-height: 1.5; margin-bottom: 4px; white-space: pre-wrap; }
        .msg.user { color: #F4F6FC; }
        .msg.bot { color: #C7CBDA; }
        .empty { color: #9BA3BD; text-align: center; padding: 40px 0; }
      </style>
    </head>
    <body>
      <h1>Переписка с Aevrix Ai</h1>
      <div class="count">${entries.length} сообщени${entries.length === 1 ? 'е' : 'й'} (обнови страницу, чтобы увидеть новые)</div>
      ${entries.length ? rows : '<div class="empty">Пока никто ничего не писал боту.</div>'}
    </body>
    </html>
  `);
});

/* =====================================================================
   АККАУНТЫ
   ===================================================================== */

app.post('/api/auth/register', auth.registerUser);
app.post('/api/auth/login', auth.loginUser);
app.post('/api/auth/logout', auth.logoutUser);
app.get('/api/auth/me', auth.meHandler);

/* =====================================================================
   ИСТОРИЯ ПЕРЕПИСКИ (только для авторизованных — хранится в БД)
   ===================================================================== */

app.get('/api/history', auth.authRequired, async (req, res) => {
  const rows = await history.getHistory(req.user.id);
  res.json({
    messages: rows.map((row) => ({
      sender: row.role === 'user' ? 'user' : 'bot',
      text: row.content,
      sources: row.sources || [],
      timestamp: new Date(row.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    }))
  });
});

app.delete('/api/history', auth.authRequired, async (req, res) => {
  await history.clearHistory(req.user.id);
  res.json({ ok: true });
});

/* =====================================================================
   GROQ — обычный (не потоковый) вызов, используем для картинок и как
   часть резервной логики
   ===================================================================== */

async function callGroq(model, messages, timeoutMs, temperature = 0.5) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({ model, messages, max_completion_tokens: 1024, temperature }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error(`Ошибка Groq API (${model}):`, response.status, errorBody);
      return { ok: false, reason: 'error', status: response.status, detail: errorBody };
    }

    const data = await response.json().catch((e) => {
      console.error('Не удалось разобрать ответ Groq как JSON:', e);
      return null;
    });
    if (!data) return { ok: false, reason: 'error', detail: 'bad json' };

    return { ok: true, data };
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error(`⏱️ Модель ${model} не ответила за ${timeoutMs / 1000}с`);
      return { ok: false, reason: 'timeout' };
    }
    console.error(`Сетевая ошибка при обращении к ${model}:`, err);
    return { ok: false, reason: 'error', detail: String(err) };
  } finally {
    clearTimeout(timeoutId);
  }
}

/* =====================================================================
   GROQ — ПОТОКОВЫЙ (streaming) вызов
   Groq отдаёт ответ порциями в формате Server-Sent Events (как у OpenAI):
   строки "data: {...}\n\n", последняя — "data: [DONE]".
   Мы читаем поток по кусочкам и сразу пересылаем текст клиенту через
   функцию onDelta, чтобы он появлялся на экране постепенно.
   ===================================================================== */

async function streamGroq(model, messages, timeoutMs, onDelta) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let fullText = '';

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({ model, messages, max_completion_tokens: 1024, temperature: 0.5, stream: true }),
      signal: controller.signal
    });

    if (!response.ok || !response.body) {
      const errorBody = await response.text().catch(() => '');
      console.error(`Ошибка Groq API стрим (${model}):`, response.status, errorBody);
      return { ok: false, reason: 'error', status: response.status, detail: errorBody, fullText };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // последняя строка может быть неполной — оставляем в буфере

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]' || dataStr === '') continue;

        try {
          const json = JSON.parse(dataStr);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            onDelta(delta);
          }
        } catch {
          // не-JSON строка (например keep-alive от сервера) — просто пропускаем
        }
      }
    }

    return { ok: true, fullText };
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error(`⏱️ Модель ${model} (стрим) не ответила за ${timeoutMs / 1000}с`);
      return { ok: false, reason: 'timeout', fullText };
    }
    console.error(`Сетевая ошибка при обращении к ${model} (стрим):`, err);
    return { ok: false, reason: 'error', detail: String(err), fullText };
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractReplyAndSources(data) {
  const message = data.choices?.[0]?.message;
  const replyText = message?.content || 'Не получилось сформулировать ответ, попробуй переспросить.';

  const sources = [];
  try {
    const executedTools = message?.executed_tools || [];
    for (const tool of executedTools) {
      const results = tool.search_results || [];
      for (const r of results) {
        if (r.url) sources.push({ title: r.title || r.url, url: r.url });
      }
    }
  } catch (e) {
    console.error('Не удалось извлечь источники:', e);
  }

  return { reply: replyText, sources };
}

/* =====================================================================
   GEMINI — АНАЛИЗ ИЗОБРАЖЕНИЙ (основной вариант)
   У Groq модели для картинок нестабильны и часто снимаются с доступа,
   поэтому для фото используем Gemini — он давно и стабильно умеет
   анализировать изображения бесплатно. Если ключ не задан или Gemini
   не ответил — используем Groq-модель с картинками как запасной вариант.
   ===================================================================== */

const GEMINI_MODEL = 'gemini-3.7-flash';
const GEMINI_TIMEOUT_MS = 25000;

async function callGeminiVision(userMessage, image, history, systemPrompt) {
  if (!process.env.GEMINI_API_KEY) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    // history уже приходит от фронтенда в формате Gemini ({role, parts:[{text}]})
    const contents = [
      ...history,
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: image.mimeType, data: image.data } },
          { text: userMessage || 'Опиши, что изображено на этой картинке.' }
        ]
      }
    ];

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { maxOutputTokens: 1024 }
        }),
        signal: controller.signal
      }
    );

    if (!response.ok) {
      console.error('Ошибка Gemini API (анализ фото):', response.status, await response.text().catch(() => ''));
      return null;
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const replyText = candidate
      ? (candidate.content.parts || []).filter((p) => p.text).map((p) => p.text).join('\n\n')
      : null;

    return replyText || null;
  } catch (err) {
    console.error('Ошибка обращения к Gemini:', err);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/* =====================================================================
   TAVILY — РЕЗЕРВНЫЙ ПОИСК
   Используется только если Groq полностью недоступен (лимит, ошибка,
   тайм-аут). Tavily сам умеет собрать короткий готовый ответ
   (include_answer) — так что для резервного варианта не нужен ещё один
   ключ LLM, просто показываем то, что нашёл Tavily.
   ===================================================================== */

const TAVILY_TIMEOUT_MS = 15000;

async function callTavily(query) {
  if (!process.env.TAVILY_API_KEY) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TAVILY_TIMEOUT_MS);

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.TAVILY_API_KEY}`
      },
      body: JSON.stringify({
        query,
        include_answer: true,
        max_results: 4
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      console.error('Ошибка Tavily API:', response.status, await response.text().catch(() => ''));
      return null;
    }

    const data = await response.json();

    const sources = (data.results || [])
      .filter((r) => r.url)
      .map((r) => ({ title: r.title || r.url, url: r.url }));

    let reply = data.answer && data.answer.trim();
    if (!reply) {
      // Если Tavily не дал готовый ответ — соберём краткую выжимку сами
      reply = (data.results || [])
        .slice(0, 3)
        .map((r) => `• ${r.title}: ${(r.content || '').slice(0, 200)}`)
        .join('\n\n');
    }
    if (!reply) return null;

    return {
      reply: `⚠️ Groq сейчас недоступен, вот что удалось найти через резервный поиск:\n\n${reply}`,
      sources
    };
  } catch (err) {
    console.error('Ошибка обращения к Tavily:', err);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/* =====================================================================
   BRAVE SEARCH — ВТОРОЙ РЕЗЕРВНЫЙ ПОИСК
   Используется, если и Groq, и Tavily недоступны. Нужен BRAVE_API_KEY
   (bezplatный тариф на brave.com/search/api).
   ===================================================================== */

const BRAVE_TIMEOUT_MS = 15000;

async function callBraveSearch(query) {
  if (!process.env.BRAVE_API_KEY) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BRAVE_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
      {
        headers: { Accept: 'application/json', 'X-Subscription-Token': process.env.BRAVE_API_KEY },
        signal: controller.signal
      }
    );

    if (!response.ok) {
      console.error('Ошибка Brave Search API:', response.status, await response.text().catch(() => ''));
      return null;
    }

    const data = await response.json();
    const results = data.web?.results || [];
    const sources = results.filter((r) => r.url).map((r) => ({ title: r.title || r.url, url: r.url }));

    const reply = results
      .slice(0, 3)
      .map((r) => `• ${r.title}: ${(r.description || '').replace(/<[^>]+>/g, '').slice(0, 200)}`)
      .join('\n\n');
    if (!reply) return null;

    return {
      reply: `⚠️ Groq сейчас недоступен, вот что удалось найти через резервный поиск:\n\n${reply}`,
      sources
    };
  } catch (err) {
    console.error('Ошибка обращения к Brave Search:', err);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/* =====================================================================
   ТОЧНЫЕ ДАННЫЕ ВМЕСТО ОБЩЕГО ПОИСКА — погода / курс валют / новости
   Для этих трёх тем есть специализированные бесплатные API — они точнее
   и быстрее, чем просить compound-модель искать это в интернете.
   ===================================================================== */

async function getWeatherFacts(city) {
  if (!city) return null;
  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ru`
    );
    const geo = await geoRes.json();
    const place = geo.results?.[0];
    if (!place) return null;

    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
        `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code`
    );
    const weather = await weatherRes.json();
    const c = weather.current;
    if (!c) return null;

    return (
      `Погода в городе ${place.name}${place.country ? ', ' + place.country : ''} на данный момент: ` +
      `температура ${c.temperature_2m}°C (ощущается как ${c.apparent_temperature}°C), ` +
      `влажность ${c.relative_humidity_2m}%, ветер ${c.wind_speed_10m} км/ч, код погодных условий ` +
      `${c.weather_code} (классификация WMO). Данные актуальны на ${c.time} (UTC).`
    );
  } catch (err) {
    console.error('Ошибка получения погоды:', err);
    return null;
  }
}

async function getCurrencyFacts(from, to) {
  if (!from) return null;
  const toCode = (to || 'USD').toUpperCase();
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${from.toUpperCase()}`);
    const data = await res.json();
    if (data.result !== 'success') return null;
    const rate = data.rates?.[toCode];
    if (!rate) return null;
    return (
      `Курс на данный момент: 1 ${from.toUpperCase()} = ${rate} ${toCode}. ` +
      `Данные обновлены: ${data.time_last_update_utc}.`
    );
  } catch (err) {
    console.error('Ошибка получения курса валют:', err);
    return null;
  }
}

async function getNewsFacts(topic) {
  if (!topic) return null;

  if (process.env.NEWSDATA_API_KEY) {
    try {
      const res = await fetch(
        `https://newsdata.io/api/1/news?apikey=${process.env.NEWSDATA_API_KEY}` +
          `&q=${encodeURIComponent(topic)}&language=ru,en&size=5`
      );
      const data = await res.json();
      if (data.status === 'success' && data.results?.length) {
        return data.results
          .slice(0, 5)
          .map((a) => `• ${a.title} (${a.source_id}, ${a.pubDate})`)
          .join('\n');
      }
    } catch (err) {
      console.error('Ошибка NewsData.io:', err);
    }
  }

  if (process.env.GNEWS_API_KEY) {
    try {
      const res = await fetch(
        `https://gnews.io/api/v4/search?q=${encodeURIComponent(topic)}&lang=ru&max=5&apikey=${process.env.GNEWS_API_KEY}`
      );
      const data = await res.json();
      if (data.articles?.length) {
        return data.articles
          .slice(0, 5)
          .map((a) => `• ${a.title} (${a.source?.name}, ${a.publishedAt})`)
          .join('\n');
      }
    } catch (err) {
      console.error('Ошибка GNews:', err);
    }
  }

  return null;
}

/* =====================================================================
   КЛАССИФИКАЦИЯ НАМЕРЕНИЯ СООБЩЕНИЯ (вместо чистого regex-детекта)
   Лёгкий отдельный запрос к быстрой модели: определяет, нужны ли внешние
   данные и какие именно — погода/курс валют/новости/общий поиск — плюс
   нормализованные параметры (город, валютная пара, тема). Ловит
   перефразировки и сокращения, которые regex-триггеры (needsSearch)
   пропускают. При ошибке/тайм-ауте — откат на needsSearch.
   ===================================================================== */

const INTENT_TIMEOUT_MS = 6000;

async function classifyIntent(message) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), INTENT_TIMEOUT_MS);

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        temperature: 0,
        max_completion_tokens: 200,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Определи намерение сообщения пользователя и верни ТОЛЬКО JSON без ' +
              'пояснений в формате: {"module":"weather|currency|news|search|none",' +
              '"city":"город или null","from":"код валюты-исходник или null",' +
              '"to":"код валюты-цель или null","query":"нормализованная тема запроса ' +
              'для поиска/новостей или null"}. weather — если спрашивают про погоду ' +
              'где-либо. currency — если спрашивают курс/конвертацию одной валюты в ' +
              'другую (коды ISO типа USD/EUR/KZT/RUB, по умолчанию to="USD", если ' +
              'вторая валюта не названа). news — если спрашивают именно новости/что ' +
              'нового по теме. search — любой другой вопрос, где нужны точные ' +
              'актуальные/свежие данные, факты, которые могут устареть, или явная ' +
              'просьба поискать/проверить/перепроверить. none — обычное общение, ' +
              'мнение, объяснение, не требующее свежих данных. Понимай опечатки, ' +
              'сокращения и разговорные формулировки как обычный человек.'
          },
          { role: 'user', content: message }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) return null;
    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.module) return null;
    return parsed;
  } catch (err) {
    console.error('Ошибка классификации намерения:', err);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/* =====================================================================
   РЕПОРТЫ В TELEGRAM — "поддержка": ошибки бота, предложения, другое.
   Нужны TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в .env (бот создаётся через
   @BotFather, id чата/группы — через @userinfobot или @RawDataBot).
   ===================================================================== */

const REPORT_CATEGORY_LABELS = { bug: '🐞 Ошибка бота', idea: '💡 Предложение', other: '📩 Другое' };

async function sendTelegramMessage(text) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
    if (!res.ok) {
      console.error('Ошибка Telegram API:', res.status, await res.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (err) {
    console.error('Ошибка отправки в Telegram:', err);
    return false;
  }
}

function escapeHtmlForTelegram(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

app.post('/api/report', async (req, res) => {
  const { category, comment, reportedMessage, context } = req.body || {};
  const trimmedComment = (comment || '').trim();

  if (!trimmedComment) {
    return res.status(400).json({ error: 'Пустой комментарий' });
  }

  const label = REPORT_CATEGORY_LABELS[category] || REPORT_CATEGORY_LABELS.other;
  const who = req.user ? `пользователь #${req.user.id}${req.user.email ? ' (' + req.user.email + ')' : ''}` : 'гость';

  const contextText = Array.isArray(context) && context.length
    ? context
        .slice(-6)
        .map((m) => `${m.role === 'bot' ? 'Бот' : 'Юзер'}: ${escapeHtmlForTelegram((m.text || '').slice(0, 300))}`)
        .join('\n')
    : null;

  let text = `${label}\nОт: ${who}\n\n<b>Комментарий:</b>\n${escapeHtmlForTelegram(trimmedComment)}`;
  if (reportedMessage) {
    text += `\n\n<b>Ответ бота, на который жалуются:</b>\n${escapeHtmlForTelegram(String(reportedMessage).slice(0, 500))}`;
  }
  if (contextText) {
    text += `\n\n<b>Контекст диалога:</b>\n${contextText}`;
  }

  const sent = await sendTelegramMessage(text);

  if (!sent) {
    console.log('📩 Репорт (Telegram недоступен, лог ниже):\n', text);
  }

  // Отвечаем "ок" даже если Telegram не настроен/недоступен — жалоба всё
  // равно попадёт в лог сервера, юзер не должен видеть ошибку из-за этого.
  res.json({ ok: true });
});

/* =====================================================================
   ЕДИНАЯ ТОЧКА ЧАТА (стриминг по SSE)

   Протокол простой: сервер отправляет строки вида "data: {...}\n\n".
   - { delta: "текст" }        — очередной кусочек текста, добавить к сообщению
   - { done: true, sources, usedSearch } — ответ завершён
   - { error: "..." }          — что-то пошло не так, поток обрывается

   Если ответ пришёл целиком (картинки, резервный поиск Tavily) — просто
   отправляем его одним "delta", чтобы фронтенду не нужно было различать
   два разных протокола.
   ===================================================================== */

app.post('/api/chat/stream', async (req, res) => {
  const userMessage = (req.body.message || '').trim();
  const clientHistory = Array.isArray(req.body.history) ? req.body.history : [];
  const image = req.body.image;
  const tone = req.body.tone || 'neutral';

  if (!userMessage && !image) {
    return res.status(400).json({ error: 'Пустое сообщение' });
  }

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: 'На сервере не настроен GROQ_API_KEY. Проверь файл .env' });
  }

  // С этого момента отвечаем в формате SSE — заголовки уходят сразу,
  // а после этого ошибки нужно слать уже как SSE-событие, а не res.status(...).
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no' // отключает буферизацию у некоторых прокси (nginx и т.п.)
  });

  const send = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

  const historyMessages = clientHistory.map((turn) => ({
    role: turn.role === 'model' ? 'assistant' : 'user',
    content: turn.parts?.[0]?.text || ''
  }));

  // Стиль общения больше не выбирается в настройках — пользователь задаёт
  // его сам, прямо обращаясь к боту в переписке ("общайся проще", "давай на
  // ты", "пошути", "отвечай короче" и т.п.), и бот подстраивается под это
  // до конца разговора (или пока не попросят иначе).
  const systemMessage = {
    role: 'system',
    content:
      'Ты чат-бот из учебного проекта. По умолчанию общайся тепло, дружелюбно ' +
      'и просто, на "ты", без излишней официальности. Если пользователь в ' +
      'разговоре прямо попросит общаться иначе — более формально, с юмором, ' +
      'короче, подробнее, на "Вы" и т.п. — подстройся под этот стиль до конца ' +
      'разговора, если не попросят обратно. ' +
      'Всегда отвечай на том же языке, на котором написано последнее сообщение ' +
      'пользователя, даже если до этого разговор шёл на другом языке. ' +
      'Помни контекст всего разговора. По умолчанию отвечай настолько коротко, ' +
      'насколько это возможно без потери смысла — не добавляй вступления, ' +
      'лишние оговорки и разделы, которые не просили. Разворачивай ответ ' +
      'подробно только если пользователь явно просит подробности, инструкцию ' +
      'по шагам или если вопрос по своей природе требует полного разбора. Если ' +
      'вопрос очень широкий (например, "расскажи всё про..."), не пытайся ' +
      'охватить всё — кратко ответь по самой сути. Если уместна таблица, ' +
      'делай её компактной: короткие формулировки в ячейках, не больше 3-4 ' +
      'столбцов, без длинных предложений внутри ячеек — иначе таблица плохо ' +
      'читается на телефоне. ' +
      'В сообщениях пользователя могут быть любые опечатки (пропущенные, ' +
      'переставленные или заменённые буквы, слитное написание, отсутствие ' +
      'знаков препинания) и любые сокращения/сленг — это нормально для ' +
      'обычной переписки, не акцентируй на этом внимание и не исправляй ' +
      'пользователя. Примеры частых сокращений, которые нужно понимать: ' +
      '"спс"/"пжлст"/"плз" (спасибо/пожалуйста), "щас"/"счас"/"седня" ' +
      '(сейчас/сегодня), "норм"/"ок"/"оч" (нормально/хорошо/очень), "мб" ' +
      '(может быть), "кмк" (как мне кажется), "го" (давай), "инфа" ' +
      '(информация), "прив"/"дарова" (приветствие), "скок" (сколько), ' +
      '"чё"/"шо" (что) — но это не полный список, по такому же принципу ' +
      'разбирай и любые другие похожие сокращения. Всегда старайся понять ' +
      'наиболее вероятный смысл сообщения по контексту всего разговора и ' +
      'отвечай по существу сразу, а не переспрашивай. Уточняющий вопрос ' +
      'задавай только если сообщение действительно можно понять несколькими ' +
      'совершенно разными способами — и даже тогда сначала попробуй дать ' +
      'полезный ответ на самый вероятный вариант, а уточнение добавь ' +
      'отдельной короткой фразой в конце.'
  };

  async function persistAndFinish(reply, sources, usedSearch, imageUrl) {
    if (req.user) {
      await history.saveMessage(req.user.id, 'user', userMessage || '[изображение]', [], tone);
      await history.saveMessage(req.user.id, 'bot', reply, sources, tone);
    }
    send({ done: true, sources: sources || [], usedSearch: Boolean(usedSearch), imageUrl: imageUrl || null });
    res.end();
  }

  try {
    // ===== Если прикреплена картинка — не стримим, разбор фото не потоковый =====
    if (image) {
      const geminiReply = await callGeminiVision(userMessage, image, clientHistory, systemMessage.content);

      let reply, usedVision;
      if (geminiReply) {
        reply = geminiReply;
        usedVision = 'gemini';
      } else {
        console.log('↪️  Gemini недоступен для фото, пробую Groq как запасной вариант...');
        const visionMessages = [
          systemMessage,
          ...historyMessages,
          {
            role: 'user',
            content: [
              { type: 'text', text: userMessage || 'Опиши, что изображено на этой картинке.' },
              { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.data}` } }
            ]
          }
        ];
        const visionResult = await callGroq(VISION_MODEL, visionMessages, VISION_TIMEOUT_MS);

        if (visionResult.ok) {
          ({ reply } = extractReplyAndSources(visionResult.data));
          usedVision = 'groq';
        } else {
          reply =
            'Не получилось проанализировать изображение 🙈 Похоже, модели для ' +
            'картинок сейчас недоступны. Попробуй ещё раз чуть позже или опиши, ' +
            'что на фото, словами — и я отвечу как обычно.';
          usedVision = null;
        }
      }

      send({ delta: reply });
      logConversation({
        time: new Date().toISOString(),
        ip: req.ip,
        tone,
        usedSearch: false,
        usedVision,
        message: userMessage || '[изображение]',
        reply
      });
      return persistAndFinish(reply, [], false);
    }

    // ===== Просьба нарисовать/сгенерировать картинку — сразу через Pollinations,
    // без обращения к обычному чату (быстрее, бесплатно, без API-ключа) =====
    const imagePrompt = detectImageGenPrompt(userMessage);
    if (imagePrompt !== null) {
      if (imagePrompt === '') {
        // Похоже на просьбу нарисовать, но без описания — переспрашиваем,
        // а не гадаем и не генерируем что попало
        const clarify = 'Что именно нарисовать? Опиши, пожалуйста, подробнее — сюжет, стиль, детали 🎨';
        send({ delta: clarify });
        return persistAndFinish(clarify, [], false);
      }

      const enhancedPrompt = await enhanceImagePrompt(imagePrompt);
      const generatedImageUrl = buildPollinationsUrl(enhancedPrompt);
      const caption = `Вот что получилось по запросу «${imagePrompt}» 🎨`;
      send({ delta: caption });
      logConversation({
        time: new Date().toISOString(),
        ip: req.ip,
        tone,
        usedSearch: false,
        usedImageGen: true,
        message: userMessage,
        reply: caption
      });
      return persistAndFinish(caption, [], false, generatedImageUrl);
    }

    let intent = await classifyIntent(userMessage);
    if (!intent) {
      // Классификатор недоступен/не ответил вовремя — откатываемся на
      // старый regex-детект, чтобы поиск в любом случае не сломался.
      intent = { module: needsSearch(userMessage) ? 'search' : 'none' };
    }

    // Погода/курс валют/новости — берём точные данные из специализированного
    // API напрямую, без обращения к общей поисковой модели.
    if (intent.module === 'weather' || intent.module === 'currency' || intent.module === 'news') {
      let facts = null;
      if (intent.module === 'weather') facts = await getWeatherFacts(intent.city);
      else if (intent.module === 'currency') facts = await getCurrencyFacts(intent.from, intent.to);
      else if (intent.module === 'news') facts = await getNewsFacts(intent.query || intent.city);

      if (facts) {
        const factsSystemMessage = {
          role: 'system',
          content:
            systemMessage.content +
            ' Вот точные актуальные данные, полученные напрямую из специализированного ' +
            'источника — используй их для ответа, не сомневайся в них и не придумывай ' +
            'ничего сверх них, просто изложи своими словами в подходящем тоне:\n\n' + facts
        };
        const factsMessages = [factsSystemMessage, ...historyMessages, { role: 'user', content: userMessage }];

        let streamed = false;
        const factsResult = await streamGroq(CHAT_MODEL, factsMessages, CHAT_TIMEOUT_MS, (delta) => {
          streamed = true;
          send({ delta });
        });

        if (factsResult.ok) {
          logConversation({
            time: new Date().toISOString(), ip: req.ip, tone, usedSearch: true, usedModule: intent.module, message: userMessage, reply: factsResult.fullText
          });
          return persistAndFinish(factsResult.fullText, [], true);
        }
        if (streamed) {
          // Стрим успел начаться, но оборвался — дальше уже не откатиться,
          // просто завершаем как есть.
          return persistAndFinish(factsResult.fullText || '', [], true);
        }
        // Стрим не начался вовсе — падаем в обычный поисковый флоу ниже.
      }
      // Фактов не нашли (например, город/валюта не распознаны) — считаем
      // это обычным поисковым запросом.
      intent.module = 'search';
    }

    const requiresSearch = intent.module === 'search';

    // Для поисковых ответов добавляем отдельную инструкцию про перепроверку
    // фактов — модель реально ищет в интернете (через встроенный инструмент
    // поиска), и важно, чтобы она не хватала первый попавшийся результат,
    // а сверяла информацию, помечала дату/актуальность данных и честно
    // говорила, если источники расходятся или что-то не удалось подтвердить.
    const searchSystemMessage = {
      role: 'system',
      content:
        systemMessage.content +
        ' Для этого ответа у тебя есть доступ к поиску в интернете — обязательно ' +
        'воспользуйся им, не отвечай по памяти. Проверяй информацию по нескольким ' +
        'найденным источникам, а не по одному первому попавшемуся. Если источники ' +
        'расходятся в фактах — честно скажи об этом и укажи разные варианты, а не ' +
        'выбирай один наугад. Указывай, на какой момент времени актуальны данные ' +
        '(если это уместно, например курсы валют, новости, версии ПО). Если ' +
        'уверенности в информации нет — так и скажи, не выдумывай факты. ' +
        'Предпочитай самые свежие из найденных источников более старым, если ' +
        'они противоречат друг другу.'
    };

    const messages = [
      requiresSearch ? searchSystemMessage : systemMessage,
      ...historyMessages,
      { role: 'user', content: userMessage }
    ];
    const minimalMessages = [requiresSearch ? searchSystemMessage : systemMessage, { role: 'user', content: userMessage }];

    function isTooLarge(result) {
      return result.reason === 'error' && (result.status === 413 || /too_large|too large/i.test(result.detail || ''));
    }

    let result;

    if (requiresSearch) {
      // Поисковые модели Groq пока используем без стриминга — источники
      // (executed_tools) приходят только в финальном не-потоковом ответе.
      result = await callGroq(SEARCH_MODEL, messages, SEARCH_TIMEOUT_MS, 0.3);
      if (!result.ok && result.reason === 'timeout') {
        console.log('↪️  Переключаюсь на облегчённую поисковую модель из-за тайм-аута...');
        result = await callGroq(SEARCH_FALLBACK_MODEL, messages, SEARCH_FALLBACK_TIMEOUT_MS, 0.3);
      }
      if (!result.ok && isTooLarge(result)) {
        console.log('↪️  Запрос слишком большой — пробую без истории разговора...');
        result = await callGroq(SEARCH_FALLBACK_MODEL, minimalMessages, SEARCH_FALLBACK_TIMEOUT_MS, 0.3);
      }

      if (result.ok) {
        const { reply, sources } = extractReplyAndSources(result.data);
        send({ delta: reply });
        logConversation({
          time: new Date().toISOString(), ip: req.ip, tone, usedSearch: true, usedFallback: false, message: userMessage, reply
        });
        return persistAndFinish(reply, sources, true);
      }
    } else {
      // Обычная модель — стримим по-настоящему, слово за словом.
      let streamed = false;
      result = await streamGroq(CHAT_MODEL, messages, CHAT_TIMEOUT_MS, (delta) => {
        streamed = true;
        send({ delta });
      });

      if (!result.ok && isTooLarge(result) && !streamed) {
        console.log('↪️  Запрос слишком большой — пробую без истории разговора...');
        result = await streamGroq(CHAT_MODEL, minimalMessages, CHAT_TIMEOUT_MS, (delta) => {
          streamed = true;
          send({ delta });
        });
      } else if (!result.ok && !streamed) {
        console.log('↪️  Обычная модель не ответила, пробую поисковую как запасной вариант...');
        const searchMessages = [searchSystemMessage, ...historyMessages, { role: 'user', content: userMessage }];
        result = await callGroq(SEARCH_MODEL, searchMessages, SEARCH_TIMEOUT_MS, 0.3);
        if (result.ok) {
          const { reply, sources } = extractReplyAndSources(result.data);
          send({ delta: reply });
          logConversation({
            time: new Date().toISOString(), ip: req.ip, tone, usedSearch: false, usedFallback: true, message: userMessage, reply
          });
          return persistAndFinish(reply, sources, false);
        }
      }

      if (result.ok) {
        logConversation({
          time: new Date().toISOString(), ip: req.ip, tone, usedSearch: false, usedFallback: false, message: userMessage, reply: result.fullText
        });
        return persistAndFinish(result.fullText, [], false);
      }
    }

    // Ничего не сработало — пробуем резервный поиск через Tavily
    console.log('↪️  Groq недоступен, пробую резервный поиск через Tavily...');
    const tavilyResult = await callTavily(userMessage);

    if (tavilyResult) {
      send({ delta: tavilyResult.reply });
      logConversation({
        time: new Date().toISOString(), ip: req.ip, tone, usedSearch: requiresSearch, usedFallback: true, message: userMessage, reply: tavilyResult.reply
      });
      return persistAndFinish(tavilyResult.reply, tavilyResult.sources, requiresSearch);
    }

    console.log('↪️  Tavily тоже недоступен, пробую Brave Search...');
    const braveResult = await callBraveSearch(userMessage);

    if (braveResult) {
      send({ delta: braveResult.reply });
      logConversation({
        time: new Date().toISOString(), ip: req.ip, tone, usedSearch: requiresSearch, usedFallback: true, message: userMessage, reply: braveResult.reply
      });
      return persistAndFinish(braveResult.reply, braveResult.sources, requiresSearch);
    }

    const errorMessage =
      result.reason === 'timeout'
        ? 'Вопрос оказался слишком объёмным, и ответ не пришёл вовремя ⏱️ Попробуй сформулировать короче.'
        : 'Groq API сейчас недоступен, попробуй ещё раз через минуту.';
    send({ error: errorMessage });
    res.end();
  } catch (err) {
    console.error('Ошибка сервера (стрим):', err);
    try {
      send({ error: 'Внутренняя ошибка сервера' });
    } catch {
      // res мог уже закрыться
    }
    res.end();
  }
});

app.listen(PORT, async () => {
  console.log(`✅ Сервер запущен: http://localhost:${PORT}`);
  console.log('Открой этот адрес в браузере, чтобы пользоваться чатом.');
  console.log(`📋 Переписку всех пользователей можно посмотреть на http://localhost:${PORT}/admin`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log('⚠️  ADMIN_PASSWORD не задан в .env — страница /admin открыта БЕЗ пароля всем, у кого есть ссылка на сервер.');
  }
  try {
    await initDb();
  } catch (err) {
    console.error('⚠️  Не удалось подключиться к базе данных / создать таблицы:', err);
  }
});
