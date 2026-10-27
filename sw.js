// Keeps Daybook opening instantly and working offline.
// Bump VERSION whenever you upload changed files so devices pick them up.
const VERSION = "daybook-v11";
const SHELL = ["./", "./index.html", "./app.js", "./firebase-config.js", "./seed.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Never cache live data or sign-in traffic.
  if (/googleapis\.com$/.test(url.hostname) && !/^fonts\./.test(url.hostname)) return;
  if (/(identitytoolkit|securetoken|firestore)/.test(url.hostname)) return;
  if (url.origin === location.origin) {
    // App files: always check GitHub for a newer copy (skips the browser's 10-minute cache) and fall back to the saved copy offline.
    e.respondWith(fetch(req, { cache: "no-cache" }).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("./index.html"))));
    return;
  }
  if (/(gstatic\.com|fonts\.googleapis\.com)$/.test(url.hostname)) {
    // Firebase library and fonts: cache first.
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; })));
  }
});

// ---------- Push notifications from the Daybook server ----------
self.addEventListener("push", e => {
  let p = {}; try { p = e.data ? e.data.json() : {}; } catch (err) { p = { data: { body: e.data && e.data.text() } }; }
  const d = p.data || p.notification || p;
  const title = d.title || "Daybook";
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || "", icon: "icon-192.png", badge: "icon-192.png",
    tag: d.tag || undefined, renotify: !!d.tag, data: { url: d.url || "./#today" }
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./#today", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) { if ("focus" in c) { if ("navigate" in c) c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
