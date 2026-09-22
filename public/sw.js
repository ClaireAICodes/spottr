const CACHE_PREFIX = 'spottr-shell-'
const CACHE_NAME = `${CACHE_PREFIX}v1`
const APP_SHELL = ['/', '/index.html']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CACHE_URLS' || !Array.isArray(event.data.urls)) return
  const urls = event.data.urls.filter((url) => typeof url === 'string')
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(urls.map(async (url) => {
        const response = await fetch(url, { cache: 'reload' })
        if (response.ok) await cache.put(url, response)
      })))
      .then(() => event.source?.postMessage({ type: 'CACHE_READY' })),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      if (event.request.mode === 'navigate') {
        try {
          const response = await fetch(event.request)
          if (response.ok) event.waitUntil(cache.put(event.request, response.clone()))
          return response
        } catch {
          return (await cache.match('/index.html')) ?? Response.error()
        }
      }
      const cached = await cache.match(event.request, { ignoreVary: true })
      if (cached) return cached
      try {
        const response = await fetch(event.request)
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          event.waitUntil(cache.put(event.request, response.clone()))
        }
        return response
      } catch {
        const cached = await cache.match(event.request, { ignoreVary: true })
        if (cached) return cached
        return Response.error()
      }
    }),
  )
})
