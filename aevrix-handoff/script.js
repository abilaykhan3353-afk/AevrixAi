/* =====================================================================
   ТОЧНАЯ ВЫСОТА ЭКРАНА НА ТЕЛЕФОНАХ
   100vh на мобильных браузерах не учитывает появление клавиатуры или
   адресной строки. Здесь мы сами вычисляем реальную высоту через
   visualViewport (если браузер его поддерживает) и кладём в CSS-переменную —
   так интерфейс всегда подстраивается под реально видимую область экрана.
   ===================================================================== */

function updateAppHeight() {
  const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty('--app-height', `${height}px`);
}

updateAppHeight();
window.addEventListener('resize', updateAppHeight);
window.addEventListener('orientationchange', updateAppHeight);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', updateAppHeight);
}

/* ===== Элементы страницы ===== */
const chatMessages = document.getElementById('chatMessages');
const heroSection = document.getElementById('heroSection');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const themeToggle = document.getElementById('themeToggle');
const themeIcon = themeToggle.querySelector('.theme-icon');

const searchBtn = document.getElementById('searchBtn');
const searchBar = document.getElementById('searchBar');
const searchInput = document.getElementById('searchInput');
const searchCount = document.getElementById('searchCount');

const clearBtn = document.getElementById('clearBtn');

const emojiBtn = document.getElementById('emojiBtn');
const emojiPopover = document.getElementById('emojiPopover');
const attachBtn = document.getElementById('attachBtn');
const imageFileInput = document.getElementById('imageFileInput');
const imagePreview = document.getElementById('imagePreview');
const imagePreviewThumb = document.getElementById('imagePreviewThumb');
const removeImageBtn = document.getElementById('removeImageBtn');

const micBtn = document.getElementById('micBtn');

const settingsBtn = document.getElementById('settingsBtn');
const settingsOverlay = document.getElementById('settingsOverlay');
const botNameInput = document.getElementById('botNameInput');
const showTimestampsCheckbox = document.getElementById('showTimestamps');
const showVoiceOutputCheckbox = document.getElementById('showVoiceOutput');
const toneSelect = document.getElementById('toneSelect');
const resetChatBtn = document.getElementById('resetChatBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');

const botNameEl = document.getElementById('botName');
const heroNameEl = document.getElementById('heroName');

const toast = document.getElementById('toast');

const accountBtn = document.getElementById('accountBtn');
const authOverlay = document.getElementById('authOverlay');
const authModalGuest = document.getElementById('authModalGuest');
const authModalUser = document.getElementById('authModalUser');
const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginError = document.getElementById('loginError');
const registerError = document.getElementById('registerError');
const closeAuthBtn = document.getElementById('closeAuthBtn');
const accountUsernameText = document.getElementById('accountUsernameText');
const logoutBtn = document.getElementById('logoutBtn');
const closeAccountBtn = document.getElementById('closeAccountBtn');

/* ===== Настройки (сохраняются в браузере) ===== */

let settings = {
  botName: localStorage.getItem('chatbot-name') || 'Aevrix Ai',
  showTimestamps: localStorage.getItem('chatbot-timestamps') !== 'off',
  voiceOutput: localStorage.getItem('chatbot-voice') === 'on',
  tone: localStorage.getItem('chatbot-tone') || 'neutral'
};

// Если имя бота заканчивается на "Ai" — красиво выделяем это градиентом
function renderBrandedName(el, name) {
  if (/ai$/i.test(name) && name.length > 2) {
    const base = name.slice(0, -2);
    const suffix = name.slice(-2);
    el.textContent = '';
    el.appendChild(document.createTextNode(base));
    const span = document.createElement('span');
    span.className = 'brand-ai';
    span.textContent = suffix;
    el.appendChild(span);
  } else {
    el.textContent = name;
  }
}

function applySettingsToUI() {
  renderBrandedName(botNameEl, settings.botName);
  renderBrandedName(heroNameEl, settings.botName);
  chatMessages.classList.toggle('hide-timestamps', !settings.showTimestamps);
}

applySettingsToUI();

/* ===== Тема (светлая/тёмная) ===== */

function getInitialTheme() {
  const saved = localStorage.getItem('chatbot-theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const ICON_MOON = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/></svg>';
const ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4.5"/><line x1="12" y1="19.5" x2="12" y2="22"/><line x1="2" y1="12" x2="4.5" y2="12"/><line x1="19.5" y1="12" x2="22" y2="12"/><line x1="4.9" y1="4.9" x2="6.6" y2="6.6"/><line x1="17.4" y1="17.4" x2="19.1" y2="19.1"/><line x1="4.9" y1="19.1" x2="6.6" y2="17.4"/><line x1="17.4" y1="6.6" x2="19.1" y2="4.9"/></svg>';
const ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="12" height="12" rx="2"/><path d="M9 16v2a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2V11a2 2 0 0 0-2-2h-2"/></svg>';
const ICON_SPEAKER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 9a4 4 0 0 1 0 6"/><path d="M19 7a7.5 7.5 0 0 1 0 10"/></svg>';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeIcon.innerHTML = theme === 'dark' ? ICON_SUN : ICON_MOON;
  localStorage.setItem('chatbot-theme', theme);
}

applyTheme(getInitialTheme());

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

/* ===== Вспомогательные функции ===== */

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function pickRandom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add('visible'));
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => { toast.hidden = true; }, 250);
  }, 2200);
}

// Убираем markdown-символы для озвучки — так голос звучит естественнее
function stripMarkdown(text) {
  return text
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/[*_#>`~-]/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/* =====================================================================
   ПАМЯТЬ О РАЗГОВОРЕ
   Храним историю в формате, который понимает Gemini: [{role, parts:[{text}]}]
   Отправляем её вместе с каждым новым сообщением, чтобы бот помнил контекст.
   ===================================================================== */

let conversationHistory = [];
const MAX_HISTORY_TURNS = 10; // ограничиваем количество сообщений в памяти
const MAX_HISTORY_MESSAGE_LENGTH = 600; // и длину каждого — иначе запрос к Groq станет слишком большим

function pushToHistory(role, text) {
  const trimmed = text.length > MAX_HISTORY_MESSAGE_LENGTH
    ? text.slice(0, MAX_HISTORY_MESSAGE_LENGTH) + '…'
    : text;
  conversationHistory.push({ role, parts: [{ text: trimmed }] });
  if (conversationHistory.length > MAX_HISTORY_TURNS) {
    conversationHistory = conversationHistory.slice(-MAX_HISTORY_TURNS);
  }
}

/* =====================================================================
   СОХРАНЕНИЕ ПЕРЕПИСКИ МЕЖДУ СЕССИЯМИ (localStorage)
   Изображения не сохраняем (чтобы не переполнить хранилище браузера) —
   только текст, отправитель, время и источники.
   ===================================================================== */

const STORAGE_KEY = 'chatbot-messages';
const MAX_STORED_MESSAGES = 60;

function loadStoredMessages() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveMessageToStorage(entry) {
  const stored = loadStoredMessages();
  stored.push(entry);
  const trimmed = stored.slice(-MAX_STORED_MESSAGES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

function clearStoredMessages() {
  localStorage.removeItem(STORAGE_KEY);
}

/* =====================================================================
   БОЛЬШАЯ БАЗА "БОЛТАЛКИ" — мгновенные ответы без обращения к Gemini
   ===================================================================== */

const localReplies = [
  { keywords: ['доброе утро'], replies: ['Доброе утро! Пусть день будет продуктивным ☀️', 'Утро доброе! Как спалось?', 'Доброе утро! Уже пьёшь кофе?'] },
  { keywords: ['добрый день'], replies: ['Добрый день! Чем могу быть полезен?', 'Привет! Хорошего дня 🙂', 'Добрый день! Как проходит твой день?'] },
  { keywords: ['добрый вечер'], replies: ['Добрый вечер! Как прошёл день?', 'Вечер добрый! Рад тебя видеть.', 'Привет! Как настроение к вечеру?'] },
  { keywords: ['доброй ночи', 'спокойной ночи'], replies: ['Спокойной ночи! Сладких снов 🌙', 'Доброй ночи! До завтра.', 'Спокойной ночи! Пусть завтра будет отличным.'] },
  { keywords: ['привет', 'здравствуй', 'хай', 'здорово', 'приветствую', 'йо'], replies: ['Привет! Рад тебя видеть 👋', 'Здравствуй! Как я могу помочь?', 'Хай! Чем займёмся сегодня?', 'Приветствую! Готов пообщаться 🙂', 'Привет-привет! Что нового?'] },
  { keywords: ['как дела', 'как ты', 'как жизнь', 'как настроение'], replies: ['У меня всё отлично, я же просто код 😄 А у тебя как дела?', 'Всё хорошо, работаю без перерывов! А ты как?', 'Прекрасно, спасибо, что спросил! Как у тебя дела?', 'Бодро и в сети! А у тебя как настроение?'] },
  { keywords: ['как тебя зовут', 'твоё имя', 'кто ты', 'ты кто', 'представься'], replies: [`Я ${settings.botName}, учебный чат-бот на HTML, CSS и JavaScript с подключённым ИИ.`, `Меня зовут ${settings.botName}, я живу прямо в этой странице 🙂`, `Я ${settings.botName}! Пока я простой, но постоянно учусь новому.`] },
  { keywords: ['сколько тебе лет', 'твой возраст'], replies: ['У меня нет возраста, я появляюсь заново при каждой перезагрузке страницы 😄', 'Возраст не считается в годах, скорее в перезапусках сервера 🙂'] },
  { keywords: ['кто тебя создал', 'кто твой создатель', 'кто тебя сделал', 'кто автор', 'кто тебя написал'], replies: ['Меня написал программист, изучающий вайб-кодинг — прямо как ты сейчас!', 'Меня создали с нуля на HTML, CSS и JavaScript, шаг за шагом.'] },
  { keywords: ['пока', 'до свидания', 'увидимся', 'прощай', 'бб', 'до встречи'], replies: ['До встречи! Хорошего дня 👋', 'Пока-пока! Возвращайся, если что 🙂', 'До скорого! Было приятно пообщаться.'] },
  { keywords: ['спасибо', 'благодарю', 'спс', 'сенкс'], replies: ['Пожалуйста! Обращайся, если что-то ещё нужно 🙂', 'Не за что! Всегда рад помочь.', 'Рад был помочь! 😊'] },
  { keywords: ['извини', 'прости', 'сорян', 'виноват'], replies: ['Всё в порядке, не переживай! 🙂', 'Ничего страшного, забыли.', 'Не стоит извиняться, всё хорошо!'] },
  { keywords: ['что ты умеешь', 'помощь', 'помоги мне', 'что ты можешь'], replies: ['Я могу поболтать на простые темы мгновенно, помню наш разговор, понимаю голос и фото, а для сложных вопросов — ищу информацию через ИИ.', 'Болтаю сам, а с серьёзным помогает Gemini с доступом в интернет. Ещё умею слушать голосом и смотреть на фото!'] },
  { keywords: ['сколько времени', 'который час', 'какое время'], replies: [`Сейчас примерно ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`] },
  { keywords: ['какое сегодня число', 'какая сегодня дата', 'какой сегодня день'], replies: [`Сегодня ${new Date().toLocaleDateString('ru-RU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`] },
  { keywords: ['расскажи анекдот', 'пошути', 'шутка', 'анекдот', 'рассмеши'], replies: [
      'Программист заходит в бар и заказывает 1 пиво, 0 пива, 99 пива, -1 пиво... Бармен: "У тебя ошибка на входе." 😄',
      'Почему программисты путают Хэллоуин и Рождество? Потому что OCT 31 == DEC 25.',
      'Как называется программист без кофе? Просто "грам"! ☕',
      'Заходит функция в бар, а бармен говорит: "У нас таких не обслуживают". Функция: "Почему?" Бармен: "У тебя побочный эффект".',
      '— Сколько программистов нужно, чтобы вкрутить лампочку? — Ни одного, это аппаратная проблема.'
    ] },
  { keywords: ['ты живой', 'ты человек', 'ты робот', 'ты бот', 'ты настоящий'], replies: ['Я программа на JavaScript, так что живым меня не назвать, но стараюсь быть дружелюбным 🙂', 'Я самый настоящий код — но с характером!'] },
  { keywords: ['я тебя люблю', 'ты мне нравишься', 'обожаю тебя'], replies: ['Это очень приятно слышать! 💜 Хоть я и просто код, твои слова меня "радуют".', 'Спасибо! Ты тоже мне нравишься как собеседник 😊'] },
  { keywords: ['ты глупый', 'ты тупой', 'ты плохой бот'], replies: ['Прости, что не оправдал ожиданий! Я ещё простой бот и учусь на ходу 🙂', 'Приму к сведению и постараюсь стать умнее!'] },
  { keywords: ['молодец', 'ты классный', 'ты хороший', 'умный бот', 'ты крутой'], replies: ['Спасибо большое! Мне приятно это слышать 😊', 'Ты тоже классный, раз со мной общаешься! 🙌'] },
  { keywords: ['красивый дизайн', 'красивый чат', 'нравится дизайн', 'классный интерфейс'], replies: ['Спасибо! Мой дизайн делали с вниманием к деталям специально для тебя 🙂', 'Приятно слышать! Стекло и градиенты — моя любимая тема.'] },
  { keywords: ['что делать', 'скучно', 'мне скучно'], replies: ['Можешь попробовать написать код, послушать музыку или почитать книгу — а можем просто поболтать здесь 🙂', 'Скука — это повод начать новый проект! Например, улучшить меня 😄'] },
  { keywords: ['где ты находишься', 'где ты живёшь'], replies: ['Я живу прямо в этом браузере, в файле script.js 🙂'] },
  { keywords: ['да'], replies: ['Понял тебя!', 'Хорошо!', 'Отлично, продолжаем 🙂'] },
  { keywords: ['нет'], replies: ['Ладно, понял.', 'Хорошо, как скажешь.', 'Окей, нет так нет 🙂'] },
  { keywords: ['1+1', 'сколько будет 1+1'], replies: ['1+1 будет 2! Проверено 😄'] },
  { keywords: ['2+2', 'сколько будет 2+2'], replies: ['2+2 будет 4! 🧮'] },
  { keywords: ['что такое вайб-кодинг', 'вайб кодинг'], replies: ['Вайб-кодинг — это когда ты быстро создаёшь рабочий проект вместе с ИИ, не зацикливаясь на идеале с первой попытки, а потом улучшаешь шаг за шагом.'] },
  { keywords: ['как у тебя настроение', 'что нового', 'чем занимаешься'], replies: ['Жду твоих сообщений и готов помочь в любой момент! А у тебя что нового?', 'Работаю без остановки, жду интересных вопросов 🙂'] },
  { keywords: ['любимый цвет'], replies: ['Мой любимый цвет — переливающийся градиент фиолетового и бирюзового, как мой аватар 😄'] },
  { keywords: ['любимая еда'], replies: ['Я питаюсь электричеством и хорошим кодом, но если бы мог есть — выбрал бы пиццу 🍕'] },
  { keywords: ['ты тут', 'слышишь меня', 'ты на месте'], replies: ['Да, я здесь! Слушаю тебя 🙂', 'На месте и готов помочь!'] },
  { keywords: ['расскажи о себе'], replies: [`Я ${settings.botName} — учебный чат-бот на HTML/CSS/JS с backend на Node.js. Помню наш разговор, понимаю голос и фото, а для сложных вопросов подключаю Gemini с поиском в интернете.`] },
  { keywords: ['хорошего дня'], replies: ['И тебе хорошего дня! 🌟', 'Спасибо, взаимно!'] },
  { keywords: ['взаимно'], replies: ['😊 Приятно это слышать!'] }
];

// Экранируем спецсимволы regex — в ключевых словах встречаются "+" (1+1, 2+2)
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Проверяем совпадение как ЦЕЛОГО слова/фразы, а не любого вхождения подстроки —
// иначе короткие ключевые слова вроде "да"/"нет" ложно срабатывают внутри других
// слов (например "да" внутри "погода").
function matchesWholeWord(text, keyword) {
  const escaped = escapeRegex(keyword);
  const pattern = new RegExp(`(^|[^а-яёa-z0-9])${escaped}($|[^а-яёa-z0-9])`, 'i');
  return pattern.test(text);
}

// Локальная "болталка" должна отвечать только на короткие реплики
// (собственно "привет", "как дела" и т.п.) — если сообщение длиннее,
// значит это, скорее всего, уже настоящий вопрос (даже если он
// начинается с приветствия), и его нужно отправить настоящему ИИ.
const MAX_LOCAL_REPLY_LENGTH = 25;

function getLocalReply(userText) {
  const trimmed = userText.trim();
  if (trimmed.length > MAX_LOCAL_REPLY_LENGTH) return null;

  const text = trimmed.toLowerCase();
  let bestMatch = null;
  let bestLength = 0;

  for (const item of localReplies) {
    for (const keyword of item.keywords) {
      if (matchesWholeWord(text, keyword) && keyword.length > bestLength) {
        bestMatch = item;
        bestLength = keyword.length;
      }
    }
  }

  return bestMatch ? pickRandom(bestMatch.replies) : null;
}

/* ===== Переход от экрана приветствия к переписке ===== */

function startConversation() {
  if (!heroSection.hidden) {
    heroSection.hidden = true;
    chatMessages.hidden = false;
    addMessage(`Привет! Я ${settings.botName} 🌟 Чем могу помочь?`, 'bot');
  }
}

function showHero() {
  chatMessages.hidden = true;
  chatMessages.innerHTML = '';
  heroSection.hidden = false;
  conversationHistory = [];
}

/* ===== Отрисовка сообщений ===== */

function renderBubbleContent(bubble, text, sender) {
  if (sender === 'bot' && window.marked && window.DOMPurify) {
    const rawHtml = marked.parse(text);
    bubble.innerHTML = DOMPurify.sanitize(rawHtml);
  } else {
    bubble.textContent = text;
  }
}

function addMessage(text, sender, { sources = [], imageUrl = null, save = true } = {}) {
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message', sender === 'user' ? 'user-message' : 'bot-message');
  messageDiv.dataset.rawText = text;

  const body = document.createElement('div');
  body.classList.add('message-body');

  if (imageUrl) {
    const img = document.createElement('img');
    img.src = imageUrl;
    img.classList.add('message-image');
    body.appendChild(img);
  }

  const bubble = document.createElement('div');
  bubble.classList.add('bubble');
  if (text) renderBubbleContent(bubble, text, sender);
  body.appendChild(bubble);

  if (sources.length > 0) {
    const sourcesBlock = document.createElement('div');
    sourcesBlock.classList.add('sources');
    sourcesBlock.innerHTML =
      '🔎 Источники: ' +
      sources
        .slice(0, 3)
        .map((s) => `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.title)}</a>`)
        .join(', ');
    body.appendChild(sourcesBlock);
  }

  const timestamp = document.createElement('span');
  timestamp.classList.add('timestamp');
  timestamp.textContent = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  body.appendChild(timestamp);

  const copyBtn = document.createElement('button');
  copyBtn.classList.add('copy-btn');
  copyBtn.innerHTML = ICON_COPY;
  copyBtn.title = 'Скопировать';
  copyBtn.addEventListener('click', () => {
    // Читаем dataset.rawText в момент клика (а не text из замыкания) —
    // для стримингового сообщения текст дописывается позже, уже после
    // того как этот блок выполнился.
    navigator.clipboard.writeText(messageDiv.dataset.rawText || '').then(() => showToast('Скопировано в буфер обмена'));
  });
  messageDiv.appendChild(body);
  messageDiv.appendChild(copyBtn);

  if (sender === 'bot' && 'speechSynthesis' in window) {
    const speakBtn = document.createElement('button');
    speakBtn.classList.add('speak-btn');
    speakBtn.innerHTML = ICON_SPEAKER;
    speakBtn.title = 'Озвучить';
    speakBtn.addEventListener('click', () => speakText(messageDiv.dataset.rawText || ''));
    messageDiv.appendChild(speakBtn);
  }

  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  if (save) {
    saveMessageToStorage({ sender, text, sources, timestamp: timestamp.textContent });
  }

  return messageDiv;
}

function showTypingIndicator() {
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message', 'bot-message');
  messageDiv.id = 'typingIndicator';

  const bubble = document.createElement('div');
  bubble.classList.add('bubble', 'typing-bubble');
  bubble.innerHTML = '<span></span><span></span><span></span>';

  messageDiv.appendChild(bubble);
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTypingIndicator() {
  const el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

/* ===== Восстановление переписки при открытии страницы ===== */

function restoreConversation() {
  const stored = loadStoredMessages();
  if (stored.length === 0) return;

  heroSection.hidden = true;
  chatMessages.hidden = false;

  stored.forEach((msg) => {
    addMessage(msg.text, msg.sender, { sources: msg.sources || [], save: false });
    pushToHistory(msg.sender === 'user' ? 'user' : 'model', msg.text);
  });
}

/* =====================================================================
   АККАУНТ
   Если пользователь вошёл — история хранится и подгружается с сервера
   (из БД), а не из localStorage. Если не вошёл — всё работает как раньше.
   ===================================================================== */

let currentUser = null;

async function restoreConversationFromServer() {
  try {
    const response = await fetch('/api/history', { credentials: 'same-origin' });
    if (!response.ok) return false;
    const data = await response.json();
    const stored = data.messages || [];
    if (stored.length === 0) return true; // авторизован, но истории пока нет — это ок

    heroSection.hidden = true;
    chatMessages.hidden = false;

    stored.forEach((msg) => {
      addMessage(msg.text, msg.sender, { sources: msg.sources || [], save: false });
      pushToHistory(msg.sender === 'user' ? 'user' : 'model', msg.text);
    });
    return true;
  } catch (err) {
    console.error('Не удалось загрузить историю с сервера:', err);
    return false;
  }
}

async function checkAuthAndRestoreHistory() {
  try {
    const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
    const data = await response.json();
    currentUser = data.user || null;
  } catch (err) {
    console.error('Не удалось проверить авторизацию:', err);
    currentUser = null;
  }

  updateAccountButton();

  if (currentUser) {
    await restoreConversationFromServer();
  } else {
    restoreConversation();
  }
}

function updateAccountButton() {
  accountBtn.classList.toggle('logged-in', Boolean(currentUser));
  accountBtn.title = currentUser ? `Аккаунт: ${currentUser.username}` : 'Аккаунт';
}

function showAuthError(el, message) {
  el.textContent = message;
  el.hidden = false;
}

function hideAuthErrors() {
  loginError.hidden = true;
  registerError.hidden = true;
}

function openAuthModal() {
  hideAuthErrors();
  loginForm.reset();
  registerForm.reset();

  if (currentUser) {
    authModalGuest.hidden = true;
    authModalUser.hidden = false;
    accountUsernameText.textContent = currentUser.username;
  } else {
    authModalUser.hidden = true;
    authModalGuest.hidden = false;
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginForm.hidden = false;
    registerForm.hidden = true;
  }

  authOverlay.hidden = false;
}

function closeAuthModal() {
  authOverlay.hidden = true;
}

accountBtn.addEventListener('click', openAuthModal);
closeAuthBtn.addEventListener('click', closeAuthModal);
closeAccountBtn.addEventListener('click', closeAuthModal);

authOverlay.addEventListener('click', (e) => {
  if (e.target === authOverlay) closeAuthModal();
});

tabLogin.addEventListener('click', () => {
  tabLogin.classList.add('active');
  tabRegister.classList.remove('active');
  loginForm.hidden = false;
  registerForm.hidden = true;
  hideAuthErrors();
});

tabRegister.addEventListener('click', () => {
  tabRegister.classList.add('active');
  tabLogin.classList.remove('active');
  registerForm.hidden = false;
  loginForm.hidden = true;
  hideAuthErrors();
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAuthErrors();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    if (!response.ok) {
      showAuthError(loginError, data.error || 'Не удалось войти.');
      return;
    }

    currentUser = data.user;
    updateAccountButton();
    closeAuthModal();
    showToast(`Привет, ${currentUser.username}!`);

    // Подтягиваем историю с сервера вместо той, что была в localStorage
    showHero();
    await restoreConversationFromServer();
  } catch (err) {
    console.error(err);
    showAuthError(loginError, 'Не получилось связаться с сервером.');
  }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAuthErrors();
  const username = document.getElementById('registerUsername').value.trim();
  const password = document.getElementById('registerPassword').value;

  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    if (!response.ok) {
      showAuthError(registerError, data.error || 'Не удалось зарегистрироваться.');
      return;
    }

    currentUser = data.user;
    updateAccountButton();
    closeAuthModal();
    showToast(`Аккаунт создан! Привет, ${currentUser.username} 🎉`);
  } catch (err) {
    console.error(err);
    showAuthError(registerError, 'Не получилось связаться с сервером.');
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } catch (err) {
    console.error(err);
  }
  currentUser = null;
  updateAccountButton();
  closeAuthModal();
  showHero();
  clearStoredMessages();
  showToast('Вышел из аккаунта');
});

checkAuthAndRestoreHistory();

/* ===== Запасной ответ, если сервер/API недоступны ===== */

const offlineDefault =
  'Не получилось связаться с сервером 🔌 Проверь, что backend запущен ' +
  '(команда node server.js) и что в файле .env указан правильный ключ API.';

/* ===== Обращение к серверу (Groq) ===== */

const FRONTEND_TIMEOUT_MS = 50000; // с запасом больше суммарного тайм-аута на сервере (~40с)

/* =====================================================================
   ПОТОКОВЫЙ ЗАПРОС К СЕРВЕРУ (Server-Sent Events)
   Сервер шлёт строки "data: {...}\n\n". Возможные поля:
   - delta: очередной кусочек текста ответа
   - done: true (+ sources, usedSearch) — ответ закончен
   - error: текст ошибки
   ===================================================================== */

async function streamAskServer(userText, image, onDelta, onDone, onError) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FRONTEND_TIMEOUT_MS);

  try {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        message: userText,
        history: conversationHistory,
        image: image || null,
        tone: settings.tone
      }),
      signal: controller.signal
    });

    if (!response.ok || !response.body) {
      const errorBody = await response.json().catch(() => null);
      const err = new Error(errorBody?.error || 'Сервер ответил ошибкой');
      err.isServerMessage = Boolean(errorBody?.error);
      throw err;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop(); // последний кусок может быть неполным

      for (const chunk of chunks) {
        const line = chunk.trim();
        if (!line.startsWith('data:')) continue;

        let payload;
        try {
          payload = JSON.parse(line.slice(5).trim());
        } catch {
          continue;
        }

        if (payload.error) {
          onError(new Error(payload.error));
          return;
        }
        if (payload.delta) onDelta(payload.delta);
        if (payload.done) {
          onDone(payload);
          return;
        }
      }
    }

    onDone({}); // сервер закрыл соединение без явного "done" — на всякий случай
  } catch (err) {
    if (err.name === 'AbortError') err.isTimeout = true;
    onError(err);
  } finally {
    clearTimeout(timeoutId);
  }
}

let pendingImage = null; // { mimeType, data (base64 без префикса), previewUrl }

async function sendMessage() {
  const text = userInput.value.trim();
  if (text === '' && !pendingImage) return;

  startConversation();

  const imageToSend = pendingImage;
  addMessage(text || '📷 Изображение', 'user', { imageUrl: imageToSend ? imageToSend.previewUrl : null });
  userInput.value = '';
  clearPendingImage();
  sendButton.disabled = true;

  // Локальную "болталку" проверяем только если нет прикреплённого изображения
  const localReply = imageToSend ? null : getLocalReply(text);

  if (localReply) {
    pushToHistory('user', text);
    showTypingIndicator();
    setTimeout(() => {
      removeTypingIndicator();
      addMessage(localReply, 'bot');
      pushToHistory('model', localReply);
      sendButton.disabled = false;
      userInput.focus();
    }, 350);
    return;
  }

  showTypingIndicator();

  let botMessageDiv = null;
  let bubble = null;
  let accumulated = '';

  await streamAskServer(
    text,
    imageToSend,
    (delta) => {
      if (!botMessageDiv) {
        removeTypingIndicator();
        botMessageDiv = addMessage('', 'bot', { save: false });
        bubble = botMessageDiv.querySelector('.bubble');
      }
      accumulated += delta;
      // Во время стрима показываем обычный текст (без разбора markdown) —
      // парсить markdown на каждый кусочек дорого и вызывает "мигание" разметки.
      bubble.textContent = accumulated;
      chatMessages.scrollTop = chatMessages.scrollHeight;
    },
    (payload) => {
      removeTypingIndicator();
      const sources = payload.sources || [];

      if (!botMessageDiv) {
        // Ничего не стримилось (ответ пришёл сразу одним куском, например
        // сообщение об ошибке) — такое приходит через delta, но на всякий
        // случай подстрахуемся.
        botMessageDiv = addMessage(accumulated || 'Не получилось получить ответ.', 'bot', { sources });
      } else {
        // Финальная отрисовка с полноценным markdown + добавление источников
        botMessageDiv.dataset.rawText = accumulated;
        renderBubbleContent(bubble, accumulated, 'bot');

        if (sources.length > 0) {
          const sourcesBlock = document.createElement('div');
          sourcesBlock.classList.add('sources');
          sourcesBlock.innerHTML =
            '🔎 Источники: ' +
            sources
              .slice(0, 3)
              .map((s) => `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.title)}</a>`)
              .join(', ');
          bubble.insertAdjacentElement('afterend', sourcesBlock);
        }

        const timestampEl = botMessageDiv.querySelector('.timestamp');
        saveMessageToStorage({ sender: 'bot', text: accumulated, sources, timestamp: timestampEl?.textContent });
      }

      pushToHistory('user', text || 'Изображение');
      pushToHistory('model', accumulated);

      if (settings.voiceOutput) speakText(accumulated);
      sendButton.disabled = false;
      userInput.focus();
    },
    (err) => {
      console.error(err);
      removeTypingIndicator();
      if (botMessageDiv) botMessageDiv.remove(); // убираем недописанный пузырь

      if (err.isTimeout) {
        addMessage(
          'Вопрос оказался слишком объёмным, и ответ не пришёл вовремя ⏱️ Попробуй сформулировать короче или раздели на несколько вопросов.',
          'bot'
        );
      } else if (err.isServerMessage) {
        addMessage(err.message, 'bot');
      } else {
        addMessage(offlineDefault, 'bot');
      }
      sendButton.disabled = false;
      userInput.focus();
    }
  );
}

sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

/* ===== Загрузка и анализ изображений ===== */

attachBtn.addEventListener('click', () => imageFileInput.click());

imageFileInput.addEventListener('change', () => {
  const file = imageFileInput.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Можно прикреплять только изображения');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    const base64 = dataUrl.split(',')[1];
    pendingImage = { mimeType: file.type, data: base64, previewUrl: dataUrl };
    imagePreviewThumb.src = dataUrl;
    imagePreview.hidden = false;
  };
  reader.readAsDataURL(file);
  imageFileInput.value = '';
});

function clearPendingImage() {
  pendingImage = null;
  imagePreview.hidden = true;
  imagePreviewThumb.src = '';
}

removeImageBtn.addEventListener('click', clearPendingImage);

/* ===== Голосовой ввод (распознавание речи) ===== */

const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognitionClass) {
  recognition = new SpeechRecognitionClass();
  recognition.lang = 'ru-RU';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.addEventListener('result', (event) => {
    const transcript = event.results[0][0].transcript;
    userInput.value = transcript;
  });

  recognition.addEventListener('end', () => micBtn.classList.remove('listening'));
  recognition.addEventListener('error', () => {
    micBtn.classList.remove('listening');
    showToast('Не удалось распознать речь');
  });
} else {
  micBtn.title = 'Голосовой ввод не поддерживается этим браузером';
}

micBtn.addEventListener('click', () => {
  if (!recognition) {
    showToast('Голосовой ввод не поддерживается этим браузером 🙁');
    return;
  }
  if (micBtn.classList.contains('listening')) {
    recognition.stop();
    micBtn.classList.remove('listening');
  } else {
    recognition.start();
    micBtn.classList.add('listening');
  }
});

/* ===== Озвучка ответов бота (синтез речи) ===== */

function speakText(text) {
  if (!('speechSynthesis' in window)) {
    showToast('Озвучка не поддерживается этим браузером 🙁');
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(stripMarkdown(text));
  utterance.lang = 'ru-RU';
  window.speechSynthesis.speak(utterance);
}

/* ===== Поиск по переписке ===== */

searchBtn.addEventListener('click', () => {
  if (heroSection.hidden === false) return;
  searchBar.hidden = !searchBar.hidden;
  if (!searchBar.hidden) searchInput.focus();
  else clearSearch();
});

function clearSearch() {
  searchInput.value = '';
  searchCount.textContent = '';
  document.querySelectorAll('.message').forEach((msg) => {
    msg.classList.remove('hidden-by-search');
  });
}

searchInput.addEventListener('input', () => {
  const query = searchInput.value.trim().toLowerCase();
  const messages = document.querySelectorAll('.message');
  let matches = 0;

  messages.forEach((msg) => {
    const raw = (msg.dataset.rawText || '').toLowerCase();
    if (query === '' || raw.includes(query)) {
      if (query !== '') matches++;
      msg.classList.remove('hidden-by-search');
    } else {
      msg.classList.add('hidden-by-search');
    }
  });

  searchCount.textContent = query === '' ? '' : `${matches} совп.`;
});

/* ===== Очистка чата ===== */

function fullyResetChat() {
  searchBar.hidden = true;
  showHero();
  clearStoredMessages();
  clearPendingImage();

  if (currentUser) {
    fetch('/api/history', { method: 'DELETE', credentials: 'same-origin' }).catch((err) => {
      console.error('Не удалось очистить историю на сервере:', err);
    });
  }
}

clearBtn.addEventListener('click', () => {
  if (heroSection.hidden === false) return;
  if (confirm('Очистить всю историю переписки?')) {
    fullyResetChat();
    showToast('История чата очищена');
  }
});

/* ===== Эмодзи-панель ===== */

const emojiList = ['😊', '😂', '👍', '🎉', '❤️', '🔥', '🤔', '😮', '👋', '🙏', '✨', '💡'];

emojiList.forEach((emoji) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = emoji;
  btn.addEventListener('click', () => {
    userInput.value += emoji;
    userInput.focus();
  });
  emojiPopover.appendChild(btn);
});

emojiBtn.addEventListener('click', (e) => {
  e.stopPropagation(); // иначе клик "всплывает" и document-обработчик тут же закрывает панель
  emojiPopover.hidden = !emojiPopover.hidden;
});

document.addEventListener('click', (e) => {
  if (!emojiPopover.hidden && !emojiPopover.contains(e.target)) {
    emojiPopover.hidden = true;
  }
});

/* ===== Настройки ===== */

settingsBtn.addEventListener('click', () => {
  botNameInput.value = settings.botName;
  showTimestampsCheckbox.checked = settings.showTimestamps;
  showVoiceOutputCheckbox.checked = settings.voiceOutput;
  toneSelect.value = settings.tone;
  settingsOverlay.hidden = false;
});

closeSettingsBtn.addEventListener('click', () => {
  const newName = botNameInput.value.trim() || 'Aevrix Ai';
  settings.botName = newName;
  settings.showTimestamps = showTimestampsCheckbox.checked;
  settings.voiceOutput = showVoiceOutputCheckbox.checked;
  settings.tone = toneSelect.value;

  localStorage.setItem('chatbot-name', settings.botName);
  localStorage.setItem('chatbot-timestamps', settings.showTimestamps ? 'on' : 'off');
  localStorage.setItem('chatbot-voice', settings.voiceOutput ? 'on' : 'off');
  localStorage.setItem('chatbot-tone', settings.tone);

  applySettingsToUI();
  settingsOverlay.hidden = true;
});

resetChatBtn.addEventListener('click', () => {
  if (confirm('Очистить всю историю переписки?')) {
    fullyResetChat();
    settingsOverlay.hidden = true;
    showToast('История чата очищена');
  }
});

settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) settingsOverlay.hidden = true;
});
