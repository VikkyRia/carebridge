const fs = require('fs');
const vm = require('vm');

const path = 'c:/Users/pc/Downloads/files (6)/org.js';
const code = fs.readFileSync(path, 'utf8');

const listeners = {};
const app = { innerHTML: '' };

const document = {
  getElementById(id) {
    return id === 'app' ? app : null;
  },
  querySelectorAll() {
    return [];
  },
};

const localStorage = {
  store: {},
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  },
  setItem(key, value) {
    this.store[key] = String(value);
  },
  removeItem(key) {
    delete this.store[key];
  },
};

const window = {
  location: { hash: '#/org/auth' },
  ORG: null,
  addEventListener(type, cb) {
    listeners[type] = cb;
  },
  dispatchEvent(event) {
    return listeners[event.type] ? listeners[event.type]() : undefined;
  },
  scrollTo() {},
};

const context = {
  console,
  window,
  document,
  localStorage,
  fetch: async () => ({
    ok: false,
    status: 404,
    headers: { get() { return ''; } },
    json: async () => ({}),
    text: async () => '',
  }),
  alert: () => {},
  setTimeout,
  clearTimeout,
  Promise,
  URLSearchParams,
};

vm.createContext(context);
try {
  vm.runInNewContext(code, context);
} catch (error) {
  console.error('vm parse failed:', error.message);
  console.error('stack:', error.stack);
  process.exitCode = 1;
}

(async () => {
  await window.dispatchEvent({ type: 'DOMContentLoaded' });
  console.log('ORG loaded:', Boolean(window.ORG));
  console.log('app innerHTML length:', app.innerHTML.length);
})().catch((error) => {
  console.error('smoke test failed:', error);
  process.exitCode = 1;
});
