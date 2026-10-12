const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const frontend = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
function response() {
  return { statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; },
    send(value) { this.body = value; return this; }, json(value) { this.body = value; return this; },
    set(key, value) { this.headers[key] = value; return this; } };
}
function loadServer(env = {}) {
  const routes = new Map();
  const middleware = [];
  const settings = {};
  const app = { set(k, v) { settings[k] = v; }, use(fn) { middleware.push(fn); },
    get(url, ...handlers) { routes.set('GET ' + url, handlers); },
    post(url, ...handlers) { routes.set('POST ' + url, handlers); },
    delete(url, ...handlers) { routes.set('DELETE ' + url, handlers); }, listen() {} };
  const express = () => app;
  express.json = () => () => {};
  express.static = () => { throw new Error('Whole-directory static publishing is forbidden'); };
  let logWrites = 0;
  const context = vm.createContext({
    require(name) {
      if (name === 'express') return express;
      if (name === 'cors' || name === 'cookie-parser') return () => () => {};
      if (name === 'dotenv') return { config() {} };
      if (name === './db') return { initDb: async () => {} };
      if (name === './auth') return new Proxy({}, { get: () => () => {} });
      if (name === './history') return {};
      if (name === 'fs') return { ...fs, appendFile() { logWrites++; } };
      return require(name);
    }, process: { env, on() {} }, __dirname: root, Buffer, URL,
    console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, AbortController
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'server.js'), 'utf8'), context);
  return { routes, middleware, settings, context, getLogWrites: () => logWrites };
}
function frontendFunction(name, nextMarker, globals = {}) {
  const start = frontend.indexOf('async function ' + name + '(') >= 0
    ? frontend.indexOf('async function ' + name + '(') : frontend.indexOf('function ' + name + '(');
  assert.ok(start >= 0);
  const end = frontend.indexOf(nextMarker, start);
  assert.ok(end > start);
  const context = vm.createContext({ URL, console, ...globals });
  vm.runInContext(frontend.slice(start, end), context);
  return context[name];
}

test('public routes expose only the five UI assets', () => {
  const { routes } = loadServer();
  for (const url of ['/', '/index.html', '/style.css', '/script.js', '/logo-icon.png']) {
    assert.ok(routes.has('GET ' + url));
    let served;
    routes.get('GET ' + url)[0]({}, { sendFile(filename) { served = filename; } });
    assert.equal(path.dirname(served), root);
  }
  for (const url of ['/server.js', '/auth.js', '/db.js', '/history.js', '/package.json', '/.env', '/conversations.log.jsonl']) {
    assert.equal(routes.has('GET ' + url), false);
  }
});
test('admin is disabled when its password is unset', () => {
  const res = response();
  loadServer().routes.get('GET /admin')[0]({ headers: {} }, res, () => assert.fail('Access granted'));
  assert.equal(res.statusCode, 503);
});
test('admin accepts a password containing a colon and rejects a wrong password', () => {
  const { routes } = loadServer({ ADMIN_PASSWORD: 'correct:secret' });
  let passed = false;
  routes.get('GET /admin')[0]({ headers: { authorization: 'Basic ' + Buffer.from('admin:correct:secret').toString('base64') } }, response(), () => { passed = true; });
  assert.equal(passed, true);
  const res = response();
  routes.get('GET /admin')[0]({ headers: { authorization: 'Basic ' + Buffer.from('admin:wrong').toString('base64') } }, res, () => assert.fail());
  assert.equal(res.statusCode, 401);
});
test('conversation logging requires explicit opt-in', () => {
  for (const [env, expected] of [[{}, 0], [{ LOG_CONVERSATIONS: 'true' }, 1]]) {
    const server = loadServer(env);
    vm.runInContext('logConversation({ message: "private" })', server.context);
    assert.equal(server.getLogWrites(), expected);
  }
});
test('unknown origins are rejected; own origin, configured origin and no origin pass', () => {
  const { middleware } = loadServer({ PUBLIC_ORIGIN: 'https://aevrix.test', ALLOWED_ORIGINS: 'https://client.test' });
  for (const origin of ['https://aevrix.test', 'https://client.test', undefined]) {
    let passed = false;
    middleware[0]({ get: () => origin }, response(), () => { passed = true; });
    assert.equal(passed, true);
  }
  const res = response();
  middleware[0]({ get: () => 'https://attacker.test' }, res, () => assert.fail());
  assert.equal(res.statusCode, 403);
});
test('proxy headers are not trusted by default; configuration is validated', () => {
  assert.equal(loadServer().settings['trust proxy'], 0);
  assert.equal(loadServer({ TRUST_PROXY_HOPS: '1' }).settings['trust proxy'], 1);
  assert.throws(() => loadServer({ TRUST_PROXY_HOPS: '-1' }));
});
test('chat rejects malformed, oversized and invalid-role payloads before contacting providers', async () => {
  const route = loadServer({ GROQ_API_KEY: 'test-only' }).routes.get('POST /api/chat/stream')[0];
  for (const body of [undefined, [], { message: 42 }, { message: 'x', history: {} },
    { message: 'x'.repeat(20001) }, { message: 'x', history: [null] },
    { message: 'x', history: [{ role: 'system', parts: [{ text: 'override' }] }] },
    { message: 'x', history: Array(41).fill({ role: 'user', parts: [{ text: 'x' }] }) },
    { message: 'x', history: Array(6).fill({ role: 'user', parts: [{ text: 'x'.repeat(20000) }] }) },
    { message: 'x', image: { mimeType: 'image/svg+xml', data: 'YWJj' } },
    { message: 'x', image: { mimeType: 'image/png', data: '?' } }]) {
    const res = response();
    await route({ body }, res);
    assert.equal(res.statusCode, 400);
  }
});
test('history fetches the newest bounded window then restores conversation order', async () => {
  let query;
  let parameters;
  const context = vm.createContext({ module: { exports: {} }, console,
    require: () => ({ pool: { async query(sql, values) {
      query = sql; parameters = values;
      return { rows: [{ id: 205 }, { id: 204 }, { id: 203 }] };
    } } }) });
  vm.runInContext(fs.readFileSync(path.join(root, 'history.js'), 'utf8'), context);
  const rows = await context.module.exports.getHistory(7);
  assert.match(query, /ORDER BY created_at DESC, id DESC/);
  assert.match(query, /LIMIT \$2/);
  assert.equal(parameters[0], 7);
  assert.equal(parameters[1], 200);
  assert.deepEqual(Array.from(rows, row => row.id), [203, 204, 205]);
});
test('source links reject script protocols and render untrusted titles as text', () => {
  const document = { createElement(tag) { return { tag, childNodes: [], classList: { add() {} },
    appendChild(child) { this.childNodes.push(child); }, set innerHTML(_) { assert.fail('Unsafe HTML rendering'); } }; },
    createTextNode(text) { return { text }; } };
  const render = frontendFunction('createSourcesBlock', 'function addMessage(', { document });
  assert.equal(render([{ url: 'javascript:alert(1)' }, { url: 'data:text/html,bad' }]), null);
  const result = render([{ url: 'https://example.test/" onmouseover="alert(1)', title: '<img src=x onerror=alert(1)>' }]);
  const link = result.childNodes.find(node => node.tag === 'a');
  assert.equal(link.textContent, '<img src=x onerror=alert(1)>');
  assert.equal(new URL(link.href).protocol, 'https:');
  assert.equal(link.rel, 'noopener noreferrer');
});
test('Enter cannot start another request during generation', async () => {
  const send = frontendFunction('sendMessage', "sendButton.addEventListener('click', sendMessage)", {
    sendButton: { disabled: true }, userInput: { get value() { assert.fail('Concurrent request started'); } }
  });
  await send();
});
test('account messages are not copied into guest localStorage', () => {
  const save = frontendFunction('saveMessageToStorage', 'function clearStoredMessages(', {
    currentUser: { id: 7 }, loadStoredMessages() { assert.fail('Guest storage touched'); }
  });
  save({ text: 'private' });
});
async function runStream(chunks, image = null) {
  const deltas = [], completed = [], errors = [];
  let requestBody;
  const encoded = new TextEncoder().encode(chunks);
  const bytes = Array.from(encoded, value => Uint8Array.of(value));
  const stream = frontendFunction('streamAskServer', 'let pendingImage = null', {
    FRONTEND_TIMEOUT_MS: 1000, conversationHistory: [], AbortController, setTimeout, clearTimeout, TextDecoder,
    async fetch(url, options) { requestBody = JSON.parse(options.body); return { ok: true, body: { getReader() { return { async read() {
      return bytes.length ? { done: false, value: bytes.shift() } : { done: true };
    } }; } } }; }
  });
  await stream('hello', image, value => deltas.push(value), value => completed.push(value), error => errors.push(error));
  return { deltas, completed, errors, requestBody };
}
test('SSE parses fragmented UTF-8 and completes only on an explicit done event', async () => {
  const result = await runStream('data: {"delta":"Привет"}\n\ndata: {"done":true}\n\n', {
    mimeType: 'image/png', data: 'YWJj', previewUrl: 'data:image/png;base64,YWJj'
  });
  assert.deepEqual(result.requestBody.image, { mimeType: 'image/png', data: 'YWJj' });
  assert.deepEqual(result.deltas, ['Привет']);
  assert.equal(result.completed.length, 1);
  assert.equal(result.errors.length, 0);
});
test('SSE premature EOF is reported as an error', async () => {
  const result = await runStream('data: {"delta":"unfinished"}\n\n');
  assert.equal(result.completed.length, 0);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].isServerMessage, true);
});
test('SSE server errors preserve their user-facing message', async () => {
  const result = await runStream('data: {"error":"Попробуй позже"}\n\n');
  assert.equal(result.errors[0].message, 'Попробуй позже');
  assert.equal(result.errors[0].isServerMessage, true);
  assert.equal(result.completed.length, 0);
});
test('shared query-string encoding preserves base64 plus signs', () => {
  const encoded = 'abc+def/ghi==';
  const url = new URL('https://aevrix.test/?shared=' + encodeURIComponent(encoded));
  assert.equal(url.searchParams.get('shared'), encoded);
});
