// Service worker: precache the app shell, then serve same-origin GETs cache-first and refresh in the
// background (stale-while-revalidate). After one visit the app works in airplane mode.
const CACHE = "movois-v18";
const SHELL = [
  "./", "index.html", "styles.css", "app.js", "manifest.webmanifest", "icon.svg", "config.json",
  "engine/i18n.js", "engine/extractor.js", "engine/rules.js", "engine/store.js", "engine/pin.js",
  "engine/outbox.js", "engine/followup.js", "engine/asrmode.js", "engine/asr-worker.js", "engine/schema.json",
  "profiles/fr-dje.json", "locales/en.json", "locales/fr.json", "locales/dje.json",
  "samples/samples.json", "lexicon/fr.json", "engine/classifier.js", "models/symptom_clf.json",
  ...[1, 4, 13, 20].map(i => `samples/sample-${String(i).padStart(2, "0")}.mp3`),
  ...["intro", "mon", "tue", "wed", "thu", "fri", "sat", "sun", "clinic", "refill"].map(c => `audio/dje/${c}.mp3`),
];

// Only our own old app-shell caches ("htn-v15", "movois-v16"...). Kept on one line: tests/unit/sw.test.mjs reads it.
const isOldAppCache = k => k !== CACHE && /^(htn|movois)-v\d+$/.test(k);

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    // Delete only OUR old app-shell caches. Never touch other caches, e.g. the browser's cache of the
    // 79 MB on-device speech model: wiping it on every update would break offline dictation.
    .then(keys => Promise.all(keys.filter(isOldAppCache).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // e.g. the localhost speech service
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(e.request, { ignoreSearch: true });
    const network = fetch(e.request).then(r => {
      if (r.status === 200) cache.put(e.request, r.clone()); // also caches audio clips and samples once played
      return r;
    }).catch(() => cached || Response.error());
    return cached || network;
  }));
});
