/* 오프라인용 서비스 워커 — 앱 파일을 기기에 저장해 두고 인터넷 없이도 열리게 함.
   앱 파일을 고친 뒤 배포할 때는 CACHE 버전 숫자를 올려 주세요. */
const CACHE = 'allowance-v24';
const FILES = [
  './', './index.html', './app.js', './plus.js', './kid.js', './account.js', './plus-config.js', './store.js', './sync.js', './firebase-config.js', './privacy.html', './manifest.webmanifest',
  './fonts/Jua-Regular.ttf', './icons/icon-192.png', './icons/icon-512.png',
  './vendor/firebase-app-compat.js', './vendor/firebase-auth-compat.js', './vendor/firebase-firestore-compat.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// 같은 출처 파일: 인터넷 우선, 안 되면 저장본 (새 버전이 바로 반영되도록)
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
