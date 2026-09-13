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
const suggestedPrompts = document.getElementById('suggestedPrompts');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const themeToggle = document.getElementById('themeToggle');
const themeIcon = themeToggle.querySelector('.theme-icon');

const searchBtn = document.getElementById('searchBtn');
const searchBar = document.getElementById('searchBar');
const searchInput = document.getElementById('searchInput');
const searchCount = document.getElementById('searchCount');

const clearBtn = document.getElementById('clearBtn');

const bookmarksBtn = document.getElementById('bookmarksBtn');
const bookmarksOverlay = document.getElementById('bookmarksOverlay');
const bookmarksList = document.getElementById('bookmarksList');
const bookmarksEmptyHint = document.getElementById('bookmarksEmptyHint');
const closeBookmarksBtn = document.getElementById('closeBookmarksBtn');

const shareBtn = document.getElementById('shareBtn');
const shareOverlay = document.getElementById('shareOverlay');
const shareLinkInput = document.getElementById('shareLinkInput');
const copyShareLinkBtn = document.getElementById('copyShareLinkBtn');
const closeShareBtn = document.getElementById('closeShareBtn');

const sharedBanner = document.getElementById('sharedBanner');
const exitSharedBtn = document.getElementById('exitSharedBtn');

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
  botName: localStorage.getItem('chatbot-name') || 'Aevrix Ai'
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
const ICON_REGENERATE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11A8 8 0 1 0 18.5 16"/><path d="M20 5v6h-6"/></svg>';
const ICON_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1z"/></svg>';

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

// Открытие/закрытие модальных окон (настройки, закладки, шаринг, аккаунт) с
// анимацией вместо мгновенного [hidden]. Двойной requestAnimationFrame нужен,
// чтобы браузер успел отрисовать закрытое состояние ДО добавления класса
// .open — иначе transition не запустится (стили применятся сразу).
function openModal(overlay) {
  overlay.hidden = false;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => overlay.classList.add('open'));
  });
}

function closeModal(overlay) {
  overlay.classList.remove('open');
  const finish = () => { overlay.hidden = true; };
  overlay.addEventListener('transitionend', finish, { once: true });
  setTimeout(finish, 400); // подстраховка, если transitionend не сработает
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
   ЗАКЛАДКИ — отметить важный ответ, чтобы не потерять его в длинной
   истории. Хранится локально в браузере (не привязано к аккаунту).
   ===================================================================== */

const BOOKMARKS_KEY = 'chatbot-bookmarks';

function loadBookmarks() {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveBookmarks(list) {
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(list));
}

function togglePin(messageDiv, sender, timestampText, pinBtn) {
  const text = messageDiv.dataset.rawText || '';
  if (!text) return;

  const bookmarks = loadBookmarks();
  const existingIndex = bookmarks.findIndex((b) => b.text === text && b.timestamp === timestampText);

  if (existingIndex >= 0) {
    bookmarks.splice(existingIndex, 1);
    pinBtn.classList.remove('pinned');
    showToast('Убрано из закладок');
  } else {
    bookmarks.push({ text, sender, timestamp: timestampText, addedAt: Date.now() });
    pinBtn.classList.add('pinned');
    showToast('Добавлено в закладки');
  }
  saveBookmarks(bookmarks);
}

function renderBookmarksList() {
  const bookmarks = loadBookmarks();
  bookmarksList.innerHTML = '';
  bookmarksEmptyHint.hidden = bookmarks.length > 0;

  bookmarks
    .slice()
    .reverse()
    .forEach((b) => {
      const item = document.createElement('div');
      item.classList.add('bookmark-item');

      const meta = document.createElement('span');
      meta.classList.add('bookmark-meta');
      meta.textContent = `${b.sender === 'user' ? 'Ты' : settings.botName} · ${b.timestamp || ''}`;
      item.appendChild(meta);

      const textEl = document.createElement('div');
      textEl.textContent = b.text;
      item.appendChild(textEl);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.classList.add('bookmark-remove');
      removeBtn.innerHTML = '&times;';
      removeBtn.title = 'Убрать из закладок';
      removeBtn.addEventListener('click', () => {
        const updated = loadBookmarks().filter((x) => !(x.text === b.text && x.timestamp === b.timestamp));
        saveBookmarks(updated);
        renderBookmarksList();
      });
      item.appendChild(removeBtn);

      bookmarksList.appendChild(item);
    });
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
    if (chatPanelEl) chatPanelEl.classList.add('chat-active');
    addMessage(`Привет! Я ${settings.botName} 🌟 Чем могу помочь?`, 'bot');
  }
}

function showHero() {
  chatMessages.hidden = true;
  chatMessages.innerHTML = '';
  heroSection.hidden = false;
  if (chatPanelEl) chatPanelEl.classList.remove('chat-active');
  conversationHistory = [];
}

/* ===== Отрисовка сообщений ===== */

function renderBubbleContent(bubble, text, sender) {
  if (sender === 'bot' && window.marked && window.DOMPurify) {
    const rawHtml = marked.parse(text);
    bubble.innerHTML = DOMPurify.sanitize(rawHtml);
    enhanceCodeBlocks(bubble);
  } else {
    bubble.textContent = text;
  }
}

// Подсветка синтаксиса (highlight.js) и кнопка "копировать" для блоков кода
// в ответах бота. Вызывается после каждой отрисовки markdown.
function enhanceCodeBlocks(bubble) {
  const blocks = bubble.querySelectorAll('pre code');
  blocks.forEach((codeEl) => {
    if (window.hljs) {
      try { hljs.highlightElement(codeEl); } catch { /* неизвестный язык — оставляем как есть */ }
    }
    const pre = codeEl.parentElement;
    if (!pre || pre.querySelector('.code-copy-btn')) return; // кнопка уже добавлена
    pre.classList.add('code-block-wrapper');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'code-copy-btn';
    btn.textContent = 'Копировать';
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(codeEl.textContent || '').then(() => {
        btn.textContent = 'Скопировано!';
        setTimeout(() => { btn.textContent = 'Копировать'; }, 1500);
      });
    });
    pre.appendChild(btn);
  });
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

  // Нижняя строка сообщения: время (всегда видно) + панель действий
  // (появляется при наведении) — вместо старых кнопок поверх пузыря,
  // которого в этом дизайне больше нет.
  const footer = document.createElement('div');
  footer.classList.add('message-footer');

  const timestamp = document.createElement('span');
  timestamp.classList.add('timestamp');
  timestamp.textContent = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  footer.appendChild(timestamp);

  const actions = document.createElement('div');
  actions.classList.add('message-actions');

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.classList.add('copy-btn');
  copyBtn.innerHTML = ICON_COPY;
  copyBtn.title = 'Скопировать';
  copyBtn.addEventListener('click', () => {
    // Читаем dataset.rawText в момент клика (а не text из замыкания) —
    // для стримингового сообщения текст дописывается позже, уже после
    // того как этот блок выполнился.
    navigator.clipboard.writeText(messageDiv.dataset.rawText || '').then(() => showToast('Скопировано в буфер обмена'));
  });
  actions.appendChild(copyBtn);

  if (sender === 'bot' && 'speechSynthesis' in window) {
    const speakBtn = document.createElement('button');
    speakBtn.type = 'button';
    speakBtn.classList.add('speak-btn');
    speakBtn.innerHTML = ICON_SPEAKER;
    speakBtn.title = 'Озвучить';
    speakBtn.addEventListener('click', () => speakText(messageDiv.dataset.rawText || ''));
    actions.appendChild(speakBtn);
  }

  const pinBtn = document.createElement('button');
  pinBtn.type = 'button';
  pinBtn.classList.add('pin-btn');
  pinBtn.innerHTML = ICON_PIN;
  pinBtn.title = 'Добавить в закладки';
  pinBtn.addEventListener('click', () => togglePin(messageDiv, sender, timestamp.textContent, pinBtn));
  actions.appendChild(pinBtn);

  footer.appendChild(actions);
  body.appendChild(footer);

  messageDiv.appendChild(body);

  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  if (save) {
    saveMessageToStorage({ sender, text, sources, timestamp: timestamp.textContent });
  }

  return messageDiv;
}

/* =====================================================================
   ВОЛНА-СИГНАЛ — визуальное состояние Aevrix вместо точек "печатает...".
   idle — готов, thinking — обрабатывает запрос, speaking — стримит ответ.
   ===================================================================== */

const waveCanvas = document.getElementById('waveCanvas');
const waveCtx = waveCanvas ? waveCanvas.getContext('2d') : null;
const chatPanelEl = document.querySelector('.chat-panel');
const statusTextEl = document.querySelector('.status');

let waveMode = 'idle';
let waveT = 0;
let waveDpr = window.devicePixelRatio || 1;
let waveW = 0;
let waveH = 0;

function resizeWaveCanvas() {
  if (!waveCanvas) return;
  const rect = waveCanvas.getBoundingClientRect();
  waveW = rect.width;
  waveH = rect.height;
  waveCanvas.width = waveW * waveDpr;
  waveCanvas.height = waveH * waveDpr;
  waveCtx.setTransform(waveDpr, 0, 0, waveDpr, 0, 0);
}

window.addEventListener('resize', resizeWaveCanvas);

// CSS-переход меняет ВИЗУАЛЬНУЮ высоту .wave-wrap (130px → 56px при начале
// разговора), но канвас сам по себе не знает об этом — пересчитываем его
// внутренний размер, когда переход закончится, иначе волна будет выглядеть
// сжатой/растянутой вместо аккуратной подгонки под новую высоту.
document.getElementById('waveWrap')?.addEventListener('transitionend', (e) => {
  if (e.propertyName === 'height') resizeWaveCanvas();
});

function drawWave() {
  if (!waveCtx || waveW === 0) {
    requestAnimationFrame(drawWave);
    return;
  }
  waveCtx.clearRect(0, 0, waveW, waveH);
  const midY = waveH / 2;
  const points = 120;

  waveCtx.beginPath();
  for (let i = 0; i <= points; i++) {
    const x = (i / points) * waveW;
    let y = midY;

    if (waveMode === 'idle') {
      y += Math.sin(i * 0.25 + waveT * 0.03) * (waveH * 0.09);
    } else if (waveMode === 'thinking') {
      y += Math.sin(i * 0.5 + waveT * 0.15) * (waveH * 0.18)
         + Math.sin(i * 1.3 + waveT * 0.22) * (waveH * 0.08)
         + (Math.random() - 0.5) * (waveH * 0.05);
    } else if (waveMode === 'speaking') {
      y += Math.sin(i * 0.3 + waveT * 0.05) * (waveH * 0.14)
         + Math.sin(i * 0.9 - waveT * 0.04) * (waveH * 0.05);
    } else if (waveMode === 'easter') {
      // Пасхалка: волна закручивается в спираль на пару секунд
      y += Math.sin(i * 0.7 + waveT * 0.3) * (waveH * 0.22) * Math.sin(waveT * 0.05);
    }

    if (i === 0) waveCtx.moveTo(x, y);
    else waveCtx.lineTo(x, y);
  }

  waveCtx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--brand-a').trim() || '#39FF88';
  waveCtx.lineWidth = 1.6;
  waveCtx.shadowColor = waveCtx.strokeStyle;
  waveCtx.shadowBlur = waveMode === 'thinking' || waveMode === 'easter' ? 10 : 5;
  waveCtx.globalAlpha = waveMode === 'idle' ? 0.7 : 0.9;
  waveCtx.stroke();
  waveCtx.globalAlpha = 1;

  waveT += 1;
  requestAnimationFrame(drawWave);
}

function setWaveMode(mode) {
  waveMode = mode;
  if (!statusTextEl) return;
  if (mode === 'thinking') statusTextEl.textContent = 'думает';
  else if (mode === 'speaking') statusTextEl.textContent = 'отвечает';
  else if (mode === 'easter') statusTextEl.textContent = 'частота настроена 📡';
  else statusTextEl.textContent = 'готов помочь';
}

resizeWaveCanvas();
drawWave();

/* ===== Восстановление переписки при открытии страницы ===== */

function restoreConversation() {
  const stored = loadStoredMessages();
  if (stored.length === 0) return;

  heroSection.hidden = true;
  chatMessages.hidden = false;
  if (chatPanelEl) chatPanelEl.classList.add('chat-active');

  let lastBotDiv = null;
  let lastUserText = '';
  stored.forEach((msg) => {
    const div = addMessage(msg.text, msg.sender, { sources: msg.sources || [], save: false });
    pushToHistory(msg.sender === 'user' ? 'user' : 'model', msg.text);
    if (msg.sender === 'user') lastUserText = msg.text;
    else lastBotDiv = div;
  });

  // Даём перегенерировать последний ответ бота даже после перезагрузки страницы
  if (lastBotDiv) attachRegenerateButton(lastBotDiv, lastUserText, null);
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
    if (chatPanelEl) chatPanelEl.classList.add('chat-active');

    let lastBotDiv = null;
    let lastUserText = '';
    stored.forEach((msg) => {
      const div = addMessage(msg.text, msg.sender, { sources: msg.sources || [], save: false });
      pushToHistory(msg.sender === 'user' ? 'user' : 'model', msg.text);
      if (msg.sender === 'user') lastUserText = msg.text;
      else lastBotDiv = div;
    });

    // Даём перегенерировать последний ответ бота даже после перезагрузки страницы
    if (lastBotDiv) attachRegenerateButton(lastBotDiv, lastUserText, null);
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

  openModal(authOverlay);
}

function closeAuthModal() {
  closeModal(authOverlay);
}

accountBtn.addEventListener('click', openAuthModal);
closeAuthBtn.addEventListener('click', closeAuthModal);
closeAccountBtn.addEventListener('click', closeAuthModal);

authOverlay.addEventListener('click', (e) => {
  if (e.target === authOverlay) closeAuthModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && authOverlay.classList.contains('open')) closeAuthModal();
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

// Если открыта публичная read-only ссылка (?shared=...) — показываем
// только её и не трогаем аккаунт/личную историю пользователя.
if (!tryRenderSharedConversation()) {
  checkAuthAndRestoreHistory();
}

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
        image: image || null
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

// Убираем последнюю запись из localStorage — используется при перегенерации
// ответа, чтобы не задваивать старый (неверный/неудачный) ответ бота в истории.
function removeLastStoredMessage() {
  const stored = loadStoredMessages();
  if (stored.length > 0) {
    stored.pop();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  }
}

/**
 * Запрашивает ответ бота и отрисовывает его в чат.
 * Используется и при обычной отправке сообщения, и при перегенерации.
 *
 * @param {string} text — текст вопроса пользователя
 * @param {object|null} imageToSend — прикреплённое изображение (или null)
 * @param {object} options
 * @param {boolean} options.isRegenerate — true, если это перегенерация
 *   существующего ответа (тогда не добавляем повторно "user"-запись в историю
 *   разговора — она там уже есть с прошлой попытки)
 */
async function requestBotReply(text, imageToSend, { isRegenerate = false } = {}) {
  // Кнопка "перегенерировать" должна быть только у самого последнего ответа —
  // убираем её у всех предыдущих, чтобы не путать пользователя нерабочими кнопками.
  chatMessages.querySelectorAll('.regenerate-btn').forEach((btn) => btn.remove());

  setWaveMode('thinking');

  let botMessageDiv = null;
  let bubble = null;
  let accumulated = ''; // весь текст, полученный от сервера на данный момент
  let revealed = 0;     // сколько символов уже показано пользователю (эффект печати)
  let revealTimer = null;
  let streamEnded = false; // сервер прислал "done" — но текст мог ещё не досчитаться

  function ensureBubble() {
    if (!botMessageDiv) {
      setWaveMode('speaking');
      botMessageDiv = addMessage('', 'bot', { save: false });
      bubble = botMessageDiv.querySelector('.bubble');
    }
  }

  // Показывает текст посимвольно с постоянной скоростью, НЕЗАВИСИМО от того,
  // как неровно Groq присылает куски (иногда по 1 символу, иногда пачкой сразу
  // за 10-15 штук) — иначе печать выглядит рваной, а не плавной. Если текста
  // накопилось много (сервер уже закончил, а мы всё ещё "печатаем") — скорость
  // адаптивно увеличивается, чтобы не заставлять пользователя ждать.
  function startTicker() {
    if (revealTimer) return;
    revealTimer = setInterval(() => {
      if (revealed < accumulated.length) {
        const remaining = accumulated.length - revealed;
        const step = remaining > 50 ? Math.ceil(remaining / 10) : 1;
        revealed = Math.min(accumulated.length, revealed + step);
        bubble.innerHTML = escapeHtml(accumulated.slice(0, revealed)).replace(/\n/g, '<br>') +
          '<span class="typing-cursor"></span>';
        chatMessages.scrollTop = chatMessages.scrollHeight;
      } else if (streamEnded) {
        clearInterval(revealTimer);
        revealTimer = null;
        finalizeMessage();
      }
    }, 18);
  }

  function finalizeMessage() {
    const sources = finalizeMessage.sources || [];
    const imageUrl = finalizeMessage.imageUrl || null;

    botMessageDiv.dataset.rawText = accumulated;
    renderBubbleContent(bubble, accumulated, 'bot'); // убирает курсор, включает markdown/подсветку

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

    if (imageUrl) {
      const genImg = document.createElement('img');
      genImg.src = imageUrl;
      genImg.alt = text;
      genImg.classList.add('message-image', 'generated-image');
      genImg.loading = 'lazy';
      bubble.insertAdjacentElement('afterend', genImg);
    }

    const timestampEl = botMessageDiv.querySelector('.timestamp');
    saveMessageToStorage({ sender: 'bot', text: accumulated, sources, timestamp: timestampEl?.textContent });

    attachRegenerateButton(botMessageDiv, text, imageToSend);

    if (!isRegenerate) pushToHistory('user', text || 'Изображение');
    pushToHistory('model', accumulated);

    sendButton.disabled = false;
    userInput.focus();
  }

  await streamAskServer(
    text,
    imageToSend,
    (delta) => {
      ensureBubble();
      accumulated += delta;
      startTicker();
    },
    (payload) => {
      setWaveMode('idle');
      finalizeMessage.sources = payload.sources || [];
      finalizeMessage.imageUrl = payload.imageUrl || null;
      streamEnded = true;

      if (!botMessageDiv) {
        // Ничего не стримилось (пустой ответ) — подстрахуемся
        ensureBubble();
        accumulated = accumulated || 'Не получилось получить ответ.';
        revealed = accumulated.length;
      }

      // Если "печать" уже нагнала весь текст — завершаем сразу, иначе тикер
      // сам вызовет finalizeMessage(), когда закончит показывать текст.
      if (revealed >= accumulated.length && !revealTimer) {
        finalizeMessage();
      }
    },
    (err) => {
      console.error(err);
      setWaveMode('idle');
      if (revealTimer) { clearInterval(revealTimer); revealTimer = null; }
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

// Добавляет кнопку "перегенерировать" к сообщению бота — только пока это
// сообщение остаётся последним в чате (иначе перегенерация могла бы сбить
// порядок истории разговора).
function attachRegenerateButton(messageDiv, userText, userImage) {
  if (!messageDiv || messageDiv.querySelector('.regenerate-btn')) return;
  const actions = messageDiv.querySelector('.message-actions');
  if (!actions) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.classList.add('regenerate-btn');
  btn.innerHTML = ICON_REGENERATE;
  btn.title = 'Перегенерировать ответ';
  btn.addEventListener('click', () => regenerateResponse(messageDiv, userText, userImage));
  actions.appendChild(btn);
}

async function regenerateResponse(messageDiv, userText, userImage) {
  // Разрешаем перегенерацию, только пока это последнее сообщение в чате —
  // иначе непонятно, что должно произойти с сообщениями после него.
  if (messageDiv !== chatMessages.lastElementChild) {
    showToast('Можно перегенерировать только последний ответ');
    return;
  }
  if (sendButton.disabled) return; // уже идёт другой запрос

  sendButton.disabled = true;

  // Убираем старый (неудачный/не тот) ответ — из чата, из истории для ИИ
  // и из сохранённой переписки.
  messageDiv.remove();
  if (conversationHistory.length > 0 && conversationHistory[conversationHistory.length - 1].role === 'model') {
    conversationHistory.pop();
  }
  if (!currentUser) removeLastStoredMessage();

  await requestBotReply(userText, userImage, { isRegenerate: true });
}

/* =====================================================================
   СЛЭШ-КОМАНДЫ — быстрые шорткаты для частых форматов ответа.
   /код, /перевод, /кратко (+ англ. алиасы /code /translate /summarize)
   ===================================================================== */

function parseSlashCommand(rawText) {
  const match = rawText.match(/^\/(\S+)\s*([\s\S]*)$/);
  if (!match) return { displayText: rawText, apiText: rawText };

  const command = match[1].toLowerCase();
  const rest = match[2].trim();

  const wrap = (instruction) => ({
    displayText: rawText,
    apiText: rest ? `${instruction}: ${rest}` : instruction
  });

  if (['код', 'code'].includes(command)) {
    return wrap('Ответь только кодом с кратким пояснением после блока кода, без длинного вступления, на запрос');
  }
  if (['перевод', 'translate'].includes(command)) {
    return wrap(
      'Переведи следующий текст (если он на русском — переведи на английский, если на любом другом языке — переведи на русский), выведи только перевод'
    );
  }
  if (['кратко', 'summarize', 'summary'].includes(command)) {
    return wrap('Сделай краткое содержание в 3-5 предложениях следующего текста');
  }

  return { displayText: rawText, apiText: rawText };
}

async function sendMessage() {
  const rawText = userInput.value.trim();
  if (rawText === '' && !pendingImage) return;

  // Пасхалка: секретная команда, ничего не отправляет на сервер
  if (rawText.toLowerCase() === '/частота') {
    userInput.value = '';
    setWaveMode('easter');
    showToast('📡 Частота настроена...');
    setTimeout(() => setWaveMode('idle'), 2200);
    return;
  }

  startConversation();

  const imageToSend = pendingImage;
  const { displayText, apiText } = imageToSend ? { displayText: rawText, apiText: rawText } : parseSlashCommand(rawText);

  addMessage(displayText || '📷 Изображение', 'user', { imageUrl: imageToSend ? imageToSend.previewUrl : null });
  userInput.value = '';
  clearPendingImage();
  sendButton.disabled = true;

  // Локальную "болталку" проверяем только если нет прикреплённого изображения
  // и это не слэш-команда (иначе "/код привет" сработает как обычное "привет")
  const localReply = imageToSend || apiText !== displayText ? null : getLocalReply(displayText);

  if (localReply) {
    pushToHistory('user', displayText);
    setWaveMode('thinking');
    setTimeout(() => {
      setWaveMode('idle');
      addMessage(localReply, 'bot');
      pushToHistory('model', localReply);
      sendButton.disabled = false;
      userInput.focus();
    }, 350);
    return;
  }

  await requestBotReply(apiText, imageToSend);
}

sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

/* ===== Подсказки на экране приветствия ===== */
// Клик подставляет текст в поле ввода (не отправляет сразу) — так пользователь
// может дополнить мысль перед отправкой, особенно для подсказок вроде
// "Напиши код на JavaScript для..." или "Что нового в мире про...".
if (suggestedPrompts) {
  suggestedPrompts.addEventListener('click', (e) => {
    const btn = e.target.closest('.suggested-prompt-btn');
    if (!btn) return;
    userInput.value = btn.dataset.prompt || '';
    userInput.focus();
    // Курсор в конец текста, чтобы удобно было дописывать
    const len = userInput.value.length;
    userInput.setSelectionRange(len, len);
  });
}

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
  openModal(settingsOverlay);
});

closeSettingsBtn.addEventListener('click', () => {
  const newName = botNameInput.value.trim() || 'Aevrix Ai';
  settings.botName = newName;
  localStorage.setItem('chatbot-name', settings.botName);

  applySettingsToUI();
  closeModal(settingsOverlay);
});

resetChatBtn.addEventListener('click', () => {
  if (confirm('Очистить всю историю переписки?')) {
    fullyResetChat();
    closeModal(settingsOverlay);
    showToast('История чата очищена');
  }
});

settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) closeModal(settingsOverlay);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && settingsOverlay.classList.contains('open')) closeModal(settingsOverlay);
});

/* ===== Закладки ===== */

bookmarksBtn.addEventListener('click', () => {
  renderBookmarksList();
  openModal(bookmarksOverlay);
});

closeBookmarksBtn.addEventListener('click', () => {
  closeModal(bookmarksOverlay);
});

bookmarksOverlay.addEventListener('click', (e) => {
  if (e.target === bookmarksOverlay) closeModal(bookmarksOverlay);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && bookmarksOverlay.classList.contains('open')) closeModal(bookmarksOverlay);
});

/* =====================================================================
   ПОДЕЛИТЬСЯ РАЗГОВОРОМ — целиком на клиенте, без сервера: весь текущий
   разговор (conversationHistory) кодируется в base64 и кладётся в URL как
   ?shared=... . По этой ссылке разговор открывается в режиме "только
   чтение" — без входа в аккаунт, без возможности писать новые сообщения.
   Плюс: ничего не нужно хранить на сервере. Минус: длинный разговор даёт
   длинную ссылку.
   ===================================================================== */

function encodeSharedConversation(history) {
  const json = JSON.stringify(history);
  // encodeURIComponent + unescape — надёжный способ закодировать в base64
  // произвольный юникод-текст (кириллицу и т.п.), не только ASCII.
  return btoa(unescape(encodeURIComponent(json)));
}

function decodeSharedConversation(encoded) {
  const json = decodeURIComponent(escape(atob(encoded)));
  return JSON.parse(json);
}

shareBtn.addEventListener('click', () => {
  if (conversationHistory.length === 0) {
    showToast('Сначала напиши что-нибудь боту — потом можно будет поделиться');
    return;
  }
  const encoded = encodeSharedConversation(conversationHistory);
  const url = `${location.origin}${location.pathname}?shared=${encoded}`;
  shareLinkInput.value = url;
  openModal(shareOverlay);
});

closeShareBtn.addEventListener('click', () => {
  closeModal(shareOverlay);
});

shareOverlay.addEventListener('click', (e) => {
  if (e.target === shareOverlay) closeModal(shareOverlay);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && shareOverlay.classList.contains('open')) closeModal(shareOverlay);
});

copyShareLinkBtn.addEventListener('click', () => {
  shareLinkInput.select();
  navigator.clipboard.writeText(shareLinkInput.value).then(() => showToast('Ссылка скопирована'));
});

exitSharedBtn.addEventListener('click', () => {
  location.href = location.origin + location.pathname;
});

// При загрузке страницы: если в URL есть ?shared=... — показываем
// разговор в режиме "только чтение" вместо обычного чата.
function tryRenderSharedConversation() {
  const params = new URLSearchParams(location.search);
  const encoded = params.get('shared');
  if (!encoded) return false;

  try {
    const history = decodeSharedConversation(encoded);
    if (!Array.isArray(history) || history.length === 0) return false;

    sharedBanner.hidden = false;
    heroSection.hidden = true;
    chatMessages.hidden = false;
    if (chatPanelEl) chatPanelEl.classList.add('chat-active');
    document.querySelector('.chat-input-area')?.setAttribute('hidden', '');
    document.querySelector('.rail')?.setAttribute('hidden', '');
    document.querySelector('.header-actions')?.setAttribute('hidden', '');

    history.forEach((msg) => {
      const text = msg?.parts?.[0]?.text || '';
      if (!text) return;
      addMessage(text, msg.role === 'user' ? 'user' : 'bot', { save: false });
    });
    return true;
  } catch (err) {
    console.error('Не удалось разобрать публичную ссылку:', err);
    return false;
  }
}
