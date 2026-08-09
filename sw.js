/* Сверка данных 1С — service worker
   Стратегия:
   - index.html и навигация: network-first → обновления доезжают сразу,
     кэш используется только офлайн (никакого «залипания» на старой версии)
   - иконки, манифест, шрифты Google: cache-first с докачкой */

const CACHE = 'sverka-v50';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon-32.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // API Anthropic никогда не кэшируем и не трогаем
  if (url.hostname === 'api.anthropic.com') return;

  // навигация / index — сеть в приоритете
  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    e.respondWith(
      fetch(req)
        .then(r => {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return r;
        })
        .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  // остальное — кэш в приоритете, докачиваем в фоне
  const cacheable = url.origin === location.origin
    || url.hostname === 'fonts.googleapis.com'
    || url.hostname === 'fonts.gstatic.com';

  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok && cacheable) {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return r;
    }))
  );
});
