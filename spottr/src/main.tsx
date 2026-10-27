import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'
import './shell.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

function rejectAfter<T>(promise: PromiseLike<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), timeoutMs)
    void Promise.resolve(promise).then(
      (value) => {
        window.clearTimeout(timeout)
        resolve(value)
      },
      (error: unknown) => {
        window.clearTimeout(timeout)
        reject(error)
      },
    )
  })
}

async function prepareOfflineShell() {
  if (!('serviceWorker' in navigator)) return
  document.documentElement.dataset.offlineState = 'preparing'
  try {
    const registration = await rejectAfter(
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }),
      10_000,
      'Service worker registration timed out',
    )
    const readyRegistration = await rejectAfter(
      navigator.serviceWorker.ready,
      10_000,
      'Service worker activation timed out',
    )
    const worker = readyRegistration.active ?? registration.active
    if (!worker) throw new Error('No active service worker')
    const urls = [
      window.location.href,
      ...performance.getEntriesByType('resource').map((entry) => entry.name),
    ].filter((url) => {
      const resource = new URL(url)
      return resource.origin === window.location.origin && resource.pathname.startsWith(import.meta.env.BASE_URL)
    })
    const cached = await new Promise<boolean>((resolve) => {
      const timeout = window.setTimeout(() => finish(false), 10_000)
      const finish = (result: boolean) => {
        window.clearTimeout(timeout)
        navigator.serviceWorker.removeEventListener('message', onMessage)
        resolve(result)
      }
      const onMessage = (event: MessageEvent) => {
        if (event.data?.type !== 'CACHE_READY' && event.data?.type !== 'CACHE_ERROR') return
        finish(event.data.type === 'CACHE_READY' || event.data.offlineReady === true)
      }
      navigator.serviceWorker.addEventListener('message', onMessage)
      worker.postMessage({ type: 'CACHE_URLS', urls: [...new Set(urls)] })
    })
    if (!cached) throw new Error('App shell caching failed')
    document.documentElement.dataset.offlineReady = 'true'
    document.documentElement.dataset.offlineState = 'ready'
  } catch {
    document.documentElement.dataset.offlineState = 'error'
  }
}

void prepareOfflineShell()
