// Сервис-воркер: при размещении на сайте (http/https) сохраняет приложение
// в кэше браузера, чтобы после первого открытия оно работало без интернета.
const CACHE = 'tekstskan-v1';
const FILES = [
  './', './index.html', './manifest.webmanifest',
  './assets/app.css', './assets/app.js', './assets/ocr.js', './assets/corrector.js', './assets/export.js',
  './assets/vendor/tesseract.min.js', './assets/vendor/tess-worker.js', './assets/vendor/tess-core-simd.js',
  './assets/vendor/tess-core-basic.js', './assets/vendor/jspdf.umd.min.js', './assets/vendor/pdf-font.js',
  './assets/lang/rus.js', './assets/lang/eng.js', './assets/dict/ru.js', './assets/dict/en.js',
  './assets/icons/icon.svg', './assets/icons/icon-192.png', './assets/icons/icon-512.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
