// 서비스 워커: 앱 파일을 캐시해서 설치/빠른 실행 지원. Supabase 통신은 가로채지 않음.
// 앱 파일을 바꾸면 VERSION 을 꼭 올려주세요 (안 올리면 폰에 반영되지 않아요).
const VERSION = 'quest-coin-v3';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css', 'icons/icon.svg', 'icons/icon-192.png',
  'js/app.js','js/config.js','js/core.js','js/prefs.js','js/state.js','js/data/api.js','js/data/remote.js','js/data/local.js','js/logic/dates.js','js/logic/coins.js','js/logic/missions.js','js/logic/quests.js','js/ui/components.js','js/ui/sheet.js','js/ui/fx.js','js/ui/gate.js','js/ui/kid.js','js/ui/parent.js',
];
const CACHEABLE_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !CACHEABLE_HOSTS.includes(url.hostname)) return;
  // 캐시 먼저 보여주고, 뒤에서 최신 파일로 갱신
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: sameOrigin });
      const network = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
