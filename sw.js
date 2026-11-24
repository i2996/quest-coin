// 서비스 워커: 앱 파일을 캐시해서 설치/빠른 실행 지원. Supabase 통신은 가로채지 않음.
// 앱 파일을 바꾸면 VERSION 을 꼭 올려주세요 (안 올리면 폰에 반영되지 않아요).
const VERSION = 'quest-coin-v11';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css', 'icons/icon.svg', 'icons/icon-192.png',
  'js/app.js','js/config.js','js/core.js','js/prefs.js','js/state.js','js/data/api.js','js/data/remote.js','js/data/push.js','js/ui/notify.js','js/ui/photos.js','js/data/local.js','js/logic/dates.js','js/logic/coins.js','js/logic/missions.js','js/logic/quests.js','js/ui/components.js','js/ui/sheet.js','js/ui/fx.js','js/ui/gate.js','js/ui/kid.js','js/ui/parent.js',
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
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== 'qc-push-log').map((k) => caches.delete(k))))
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

// ---- 폰 알림 (웹 푸시) ----
const PUSH_LOG = 'qc-push-log'; // 이 폰이 서버 알림을 받은 기록 (앱의 '점검'에서 확인)

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || '퀘스트 코인';
  const icon = new URL('icons/icon-192.png', self.registration.scope).href;
  const basic = { body: data.body || '', icon, tag: data.tag, data: { url: self.registration.scope } };
  event.waitUntil((async () => {
    let error = null;
    try {
      // '우리 가족' 앱과 똑같은 옵션만 씀 (삼성 인터넷에서 진동·재알림 같은 추가 옵션을 쓰면 알림이 안 뜨는 경우가 있었음)
      await self.registration.showNotification(title, { ...basic, badge: icon });
    } catch (e) {
      // 그래도 안 되면 배지 없이 다시
      error = String((e && e.message) || e);
      try {
        await self.registration.showNotification(title, basic);
      } catch (e2) {
        error += ' / ' + String((e2 && e2.message) || e2);
      }
    }
    const rec = { at: Date.now(), title, error, version: VERSION };
    try {
      const c = await caches.open(PUSH_LOG);
      await c.put('last', new Response(JSON.stringify(rec)));
    } catch { /* 기록 실패는 무시 */ }
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    list.forEach((c) => c.postMessage({ type: 'qc-push', ...rec }));
  })());
});

// 앱이 이 알림 처리기의 버전을 물어보면 대답 ('점검'에서 옛 버전인지 확인)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'qc-version' && event.ports[0]) event.ports[0].postMessage({ version: VERSION });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus(); // 열려 있는 앱이 있으면 그 창으로 (돌아오면 자동으로 새로 불러옴)
      return self.clients.openWindow(url);
    })
  );
});
