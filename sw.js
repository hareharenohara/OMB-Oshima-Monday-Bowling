// キャッシュのバージョン。index.html等を更新して公開する際は、
// このバージョン文字列を必ず変更してください（古いキャッシュを破棄し、
// ユーザー側に更新を届けるための仕組みです）。
const CACHE_VERSION = 'omb-cache-v1';

// アプリの外殻（起動に最低限必要なファイル）のみキャッシュ対象とする。
// Supabaseへの通信やその他の外部APIはキャッシュしない（常に最新のデータを取得する）。
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png'
];

// インストール時にアプリの外殻をキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// 古いバージョンのキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// フェッチ戦略:
// - 同一オリジンのアプリ外殻ファイル: ネットワーク優先、失敗時はキャッシュにフォールバック
//   （これにより通常時は常に最新のindex.htmlが使われ、更新がすぐ反映される。
//    オフライン時のみキャッシュ版を表示する）
// - Supabase等クロスオリジンのAPI通信: SWは一切介入せずブラウザに任せる
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // GET以外（POST等のAPI操作）は素通し
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 別オリジン（Supabase等）へのリクエストはキャッシュ対象外
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        // 取得成功時はキャッシュを更新しておく
        const resClone = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(req, resClone));
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});
