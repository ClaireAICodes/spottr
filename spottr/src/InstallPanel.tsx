import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { ActionButton, Panel } from './primitives'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export interface InstallPromptState {
  canInstall: boolean
  status: 'idle' | 'accepted' | 'dismissed' | 'installed' | 'error'
  install: () => Promise<void>
}

type InstallPlatform = 'ios' | 'android' | 'desktop'

function detectInstallPlatform(): InstallPlatform {
  const userAgent = navigator.userAgent.toLowerCase()
  const isTouchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  if (/iphone|ipad|ipod/.test(userAgent) || isTouchMac) return 'ios'
  if (userAgent.includes('android')) return 'android'
  return 'desktop'
}

const manualInstallGuidance: Record<InstallPlatform, string> = {
  ios: 'On iPhone or iPad, open Share, then choose Add to Home Screen.',
  android: 'On Android, open your browser menu, then choose Install app or Add to Home screen.',
  desktop: 'On a computer, use the install icon in the address bar or choose Install Spottr from your browser menu.',
}

function useOfflineReady() {
  const [offlineReady, setOfflineReady] = useState(
    () => document.documentElement.dataset.offlineReady === 'true',
  )

  useEffect(() => {
    const root = document.documentElement
    const update = () => setOfflineReady(root.dataset.offlineReady === 'true')
    const observer = new MutationObserver(update)
    observer.observe(root, { attributes: true, attributeFilter: ['data-offline-ready'] })
    update()
    return () => observer.disconnect()
  }, [])

  return offlineReady
}

export function useInstallPrompt(): InstallPromptState {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [status, setStatus] = useState<InstallPromptState['status']>(() => {
    const iosNavigator = navigator as Navigator & { standalone?: boolean }
    return window.matchMedia?.('(display-mode: standalone)').matches || iosNavigator.standalone
      ? 'installed'
      : 'idle'
  })

  useEffect(() => {
    const capturePrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
      setStatus('idle')
    }
    const markInstalled = () => {
      setInstallPrompt(null)
      setStatus('installed')
    }

    window.addEventListener('beforeinstallprompt', capturePrompt)
    window.addEventListener('appinstalled', markInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', capturePrompt)
      window.removeEventListener('appinstalled', markInstalled)
    }
  }, [])

  async function install() {
    if (!installPrompt) return
    const prompt = installPrompt
    setInstallPrompt(null)
    try {
      await prompt.prompt()
      const choice = await prompt.userChoice
      setStatus(choice.outcome)
    } catch {
      setStatus('error')
    }
  }

  return { canInstall: Boolean(installPrompt), status, install }
}

export function InstallPanel({ installPrompt }: { installPrompt: InstallPromptState }) {
  const { canInstall, status, install } = installPrompt
  const installPlatform = detectInstallPlatform()
  const offlineReady = useOfflineReady()

  return (
    <Panel className="settings-panel storage-panel" aria-labelledby="install-title">
      <Download size={28} aria-hidden="true" />
      <h3 id="install-title">Install Spottr</h3>
      {status === 'installed' ? (
        <p role="status">Spottr is installed on this device.</p>
      ) : canInstall ? (
        <>
          <p>Add Spottr to this device for a focused, app-like window and quick access from your home screen.</p>
          <ActionButton type="button" onClick={() => void install()}>
            <Download size={18} aria-hidden="true" /> Install Spottr
          </ActionButton>
        </>
      ) : (
        <p>{manualInstallGuidance[installPlatform]}</p>
      )}
      <p className="offline-guidance">
        {offlineReady
          ? 'Offline ready: you can resume, log, and review saved workouts without a connection.'
          : 'Load Spottr online once before relying on it for an offline workout.'}
      </p>
      {status === 'accepted' && <p role="status">Spottr installation started.</p>}
      {status === 'dismissed' && <p role="status">Installation was dismissed. You can try again from your browser menu.</p>}
      {status === 'error' && <p role="alert">Installation could not be started. Try again from your browser menu.</p>}
    </Panel>
  )
}
