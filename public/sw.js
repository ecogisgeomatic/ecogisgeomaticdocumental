// Service worker v2: permite abrir la página SIN internet (después de haberla abierto una vez con internet).
// Guarda la carcasa de la página. Los datos y archivos de Supabase nunca se guardan aquí.
const V = 'geoteca-v2'
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(['/', '/icon-192.png', '/manifest.webmanifest'])).then(() => self.skipWaiting())) })
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())) })
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url)
  if (r.method !== 'GET' || u.origin !== self.location.origin) return
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r).then(res => { const cp = res.clone(); caches.open(V).then(c => c.put('/', cp)); return res }).catch(() => caches.match('/')))
    return
  }
  e.respondWith(caches.match(r).then(hit => {
    const red = fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)) } return res }).catch(() => hit)
    return hit || red
  }))
})
