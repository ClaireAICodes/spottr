import { useEffect, useState } from 'react'
import { Database, Save } from 'lucide-react'
import type { ExerciseService } from './exercises'
import { ActionButton, Panel } from './primitives'
import { DEFAULT_SETTINGS, type AppSettings, type SettingsService } from './settings'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function SettingsView({
  settingsService,
  exerciseService,
  onSettingsChange,
}: {
  settingsService: SettingsService
  exerciseService: ExerciseService
  onSettingsChange: (settings: AppSettings) => void
}) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [storage, setStorage] = useState<{ bytes: number; count: number; limitBytes: number } | null>(null)
  const [storageStatus, setStorageStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [status, setStatus] = useState<'loading' | 'ready' | 'saving' | 'saved' | 'error'>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let current = true
    settingsService.get().then((loaded) => {
      if (!current) return
      setSettings(loaded)
      setStatus('ready')
    }).catch(() => {
      if (!current) return
      setError('Settings could not be loaded. Your saved data has not been changed.')
      setStatus('error')
    })
    exerciseService.getMediaStorageUsage().then((usage) => {
      if (!current) return
      setStorage(usage)
      setStorageStatus('ready')
    }).catch(() => { if (current) setStorageStatus('error') })
    return () => { current = false }
  }, [exerciseService, settingsService])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (status === 'saving') return
    setStatus('saving')
    setError('')
    try {
      const saved = await settingsService.update(settings)
      setSettings(saved)
      onSettingsChange(saved)
      setStatus('saved')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Settings could not be saved.')
      setStatus('ready')
    }
  }

  return (
    <section id="main-view" role="tabpanel" aria-labelledby="tab-settings" className="settings-view">
      <div className="section-heading">
        <div><p className="eyebrow">Saved on this device</p><h2>Settings</h2><p>Choose how workout feedback and targets appear.</p></div>
      </div>
      {status === 'loading' && <p role="status">Loading settings…</p>}
      {error && <p role="alert" className="form-message error-copy">{error}</p>}
      {status !== 'loading' && status !== 'error' && (
        <form className="settings-form" onSubmit={(event) => void save(event)} onChange={() => { if (status === 'saved') setStatus('ready') }}>
          <Panel className="settings-panel" aria-labelledby="training-preferences-title">
            <h3 id="training-preferences-title">Training preferences</h3>
            <label>Weight unit<select value={settings.weightUnit} onChange={(event) => setSettings({ ...settings, weightUnit: event.target.value as AppSettings['weightUnit'] })}><option value="kg">Kilograms (kg)</option><option value="lb">Pounds (lb)</option></select></label>
            <label className="check-setting"><input type="checkbox" checked={settings.progressiveOverloadCues} onChange={(event) => setSettings({ ...settings, progressiveOverloadCues: event.target.checked })} /> Progressive overload cues</label>
            <label className="check-setting"><input type="checkbox" checked={settings.prCelebrations} onChange={(event) => setSettings({ ...settings, prCelebrations: event.target.checked })} /> PR celebrations</label>
            <label className="check-setting"><input type="checkbox" checked={settings.restTimerEnabled} onChange={(event) => setSettings({ ...settings, restTimerEnabled: event.target.checked })} /> Rest reminders</label>
            <label>Rest duration (seconds)<input type="number" min="15" max="600" step="1" disabled={!settings.restTimerEnabled} value={settings.restSeconds} onChange={(event) => setSettings({ ...settings, restSeconds: Number(event.target.value) })} /></label>
          </Panel>
          <Panel className="settings-panel storage-panel" aria-labelledby="storage-title">
            <Database size={28} aria-hidden="true" />
            <h3 id="storage-title">Media storage</h3>
            {storageStatus === 'loading' && <p role="status">Loading media storage usage…</p>}
            {storageStatus === 'error' && <p role="alert">Media storage usage is unavailable. Your saved media has not been changed.</p>}
            {storageStatus === 'ready' && storage && <><strong>{formatBytes(storage.bytes)} used across {storage.count} {storage.count === 1 ? 'file' : 'files'}</strong><p>{formatBytes(storage.limitBytes)} local media limit. Remove individual files from Exercises when you no longer need them.</p></>}
          </Panel>
          <div className="settings-save">
            <ActionButton type="submit" disabled={status === 'saving'}><Save size={18} aria-hidden="true" /> {status === 'saving' ? 'Saving…' : 'Save settings'}</ActionButton>
            {status === 'saved' && <p role="status">Settings saved.</p>}
          </div>
        </form>
      )}
    </section>
  )
}
