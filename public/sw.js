// Service worker mínimo: permite instalar la página y abrirla aunque falle la red.
// No guarda datos de Supabase ni archivos: solo la carcasa de la página.
const V = 'geoteca-v1'
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(['/', '/icon-192.png'])).then(() => self.skipWaiting())) })
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())) })
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return
  if (e.request.mode === 'navigate') e.respondWith(fetch(e.request).catch(() => caches.match('/')))
})
