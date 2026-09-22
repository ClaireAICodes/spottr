import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

async function prepareOfflineShell() {
  if (!('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.register('/sw.js')
  const readyRegistration = await navigator.serviceWorker.ready
  const worker = readyRegistration.active ?? registration.active
  if (!worker) return
  const urls = [
    window.location.href,
    ...performance.getEntriesByType('resource').map((entry) => entry.name),
  ].filter((url) => new URL(url).origin === window.location.origin)
  await new Promise<void>((resolve) => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'CACHE_READY') return
      navigator.serviceWorker.removeEventListener('message', onMessage)
      resolve()
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    worker.postMessage({ type: 'CACHE_URLS', urls: [...new Set(urls)] })
  })
  document.documentElement.dataset.offlineReady = 'true'
}

void prepareOfflineShell()
