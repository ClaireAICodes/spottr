const APP_BASE = new URL('./', self.location.href)
const INDEX_URL = new URL('index.html', APP_BASE).href
const CACHE_PREFIX = `spottr-shell-${APP_BASE.pathname}-`
const RELEASE_ID = '__SPOTTR_RELEASE__'
const CACHE_NAME = `${CACHE_PREFIX}${RELEASE_ID}`
const inScope = (value) => {
  try {
    const url = new URL(value, APP_BASE)
    return url.origin === APP_BASE.origin && url.pathname.startsWith(APP_BASE.pathname)
  } catch { return false }
}
const shellUrls = (html) => [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map(match => new URL(match[1], APP_BASE).href).filter(inScope)

self.addEventListener('install', event => event.waitUntil(cacheAppShell().catch(async error => {
  await caches.delete(CACHE_NAME)
  throw error
})))
async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME)
  const response = await fetch(INDEX_URL, { cache: 'reload' })
  if (!response.ok) throw new Error('Could not cache the app shell')
  const html = await response.clone().text()
  await cache.addAll([...new Set(shellUrls(html))])
  await cache.put(APP_BASE.href, response.clone())
  await cache.put(INDEX_URL, response)
}
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(names => Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name))))
    .then(() => self.clients.claim()))
})
async function reportCacheError(source, failedUrls, urls) {
  const cache = await caches.open(CACHE_NAME)
  const index = await cache.match(INDEX_URL)
  let offlineReady = false
  if (index?.ok) {
    const responses = await Promise.all([...new Set([...shellUrls(await index.text()), ...urls])]
      .map(url => cache.match(url, { ignoreVary: true })))
    offlineReady = responses.every(response => response?.ok)
  }
  // A failed refresh does not invalidate an already complete shell.
  source?.postMessage({ type: 'CACHE_ERROR', failedUrls, ...(offlineReady ? { offlineReady: true } : {}) })
}
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') {
    event.source?.postMessage({ type: 'UPDATE_ACTIVATING' })
    event.waitUntil(self.skipWaiting())
    return
  }
  if (event.data?.type !== 'CACHE_URLS' || !Array.isArray(event.data.urls)) return
  const urls = [...new Set(event.data.urls.filter(url => typeof url === 'string'))]
  if (!urls.every(inScope)) {
    event.source?.postMessage({ type: 'CACHE_ERROR', failedUrls: urls.filter(url => !inScope(url)) })
    return
  }
  event.waitUntil(Promise.allSettled(urls.map(async url => {
    const response = await fetch(url, { cache: 'reload' })
    if (!response.ok) throw new Error(`Could not cache ${url}`)
    return response
  })).then(async results => {
    const failedUrls = urls.filter((_, index) => results[index].status === 'rejected')
    if (failedUrls.length) {
      await reportCacheError(event.source, failedUrls, urls)
      return
    }
    const cache = await caches.open(CACHE_NAME)
    const previousResponses = await Promise.all(urls.map(url => cache.match(url)))
    let writtenCount = 0
    try {
      for (const [index, result] of results.entries()) {
        await cache.put(urls[index], previousResponses[index] ?? result.value)
        writtenCount += 1
      }
    } catch {
      await Promise.all(urls.slice(0, writtenCount).map((url, index) => {
        const previous = previousResponses[index]
        return previous ? cache.put(url, previous) : cache.delete(url)
      }))
      await reportCacheError(event.source, [urls[writtenCount]], urls)
      return
    }
    event.source?.postMessage({ type: 'CACHE_READY' })
  }).catch(() => event.source?.postMessage({ type: 'CACHE_ERROR', failedUrls: urls })))
})
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !inScope(event.request.url)) return
  event.respondWith(caches.open(CACHE_NAME).then(async cache => {
    if (event.request.mode === 'navigate') {
      // Keep this generation coherent until the user safely activates its replacement.
      const shell = await cache.match(INDEX_URL)
      if (shell) return shell
      try {
        const response = await fetch(event.request)
        return response
      } catch { return (await cache.match(INDEX_URL)) ?? Response.error() }
    }
    const cached = await cache.match(event.request, { ignoreVary: true })
    if (cached) return cached
    try {
      const response = await fetch(event.request)
      if (response.ok) event.waitUntil(cache.put(event.request, response.clone()))
      return response
    } catch { return (await cache.match(event.request, { ignoreVary: true })) ?? Response.error() }
  }))
})
