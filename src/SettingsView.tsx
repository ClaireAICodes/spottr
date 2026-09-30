import { useEffect, useState } from 'react'
import { Database, Download, Save, Upload } from 'lucide-react'
import { createSpottrBackup, downloadSpottrBackup, MAX_BACKUP_FILE_BYTES, parseSpottrBackup, restoreSpottrBackup, serializeSpottrBackup, type SpottrBackup } from './backup'
import type { ExerciseService } from './exercises'
import type { GymService } from './gyms'
import { ActionButton, Panel } from './primitives'
import type { SessionService } from './sessions'
import { DEFAULT_SETTINGS, type AppSettings, type SettingsService } from './settings'
import type { WorkoutService } from './workouts'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function SettingsView({
  settingsService,
  exerciseService,
  gymService,
  workoutService,
  sessionService,
  onSettingsChange,
  onBackupRestored,
  onBackupRestoreStateChange,
}: {
  settingsService: SettingsService
  exerciseService: ExerciseService
  gymService: GymService
  workoutService: WorkoutService
  sessionService: SessionService
  onSettingsChange: (settings: AppSettings) => void
  onBackupRestored: (settings: AppSettings) => void
  onBackupRestoreStateChange: (restoring: boolean) => void
}) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [storage, setStorage] = useState<{ bytes: number; count: number; limitBytes: number } | null>(null)
  const [storageStatus, setStorageStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [status, setStatus] = useState<'loading' | 'ready' | 'saving' | 'saved' | 'error'>('loading')
  const [backupStatus, setBackupStatus] = useState<'idle' | 'exporting' | 'downloaded' | 'error'>('idle')
  const [importStatus, setImportStatus] = useState<'idle' | 'validating' | 'valid' | 'restoring' | 'restored' | 'error'>('idle')
  const [validatedBackup, setValidatedBackup] = useState<SpottrBackup | null>(null)
  const [error, setError] = useState('')
  const [backupError, setBackupError] = useState('')
  const [importError, setImportError] = useState('')

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

  async function exportBackup() {
    if (backupStatus === 'exporting') return
    setBackupStatus('exporting')
    setBackupError('')
    try {
      const backup = await createSpottrBackup({
        gymService,
        exerciseService,
        workoutService,
        sessionService,
        settingsService,
      })
      downloadSpottrBackup(serializeSpottrBackup(backup))
      setBackupStatus('downloaded')
    } catch (caught) {
      setBackupError(caught instanceof Error ? caught.message : 'Your backup could not be created.')
      setBackupStatus('error')
    }
  }

  async function validateImport(file: File) {
    setImportStatus('validating')
    setImportError('')
    setValidatedBackup(null)
    try {
      if (file.size > MAX_BACKUP_FILE_BYTES) {
        throw new Error('This backup file is too large. Your saved data has not been changed.')
      }
      const serialized = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error ?? new Error('The backup file could not be read.'))
        reader.readAsText(file)
      })
      setValidatedBackup(parseSpottrBackup(serialized))
      setImportStatus('valid')
    } catch (caught) {
      setImportError(caught instanceof Error ? caught.message : 'This file is not a valid Spottr backup. Your saved data has not been changed.')
      setImportStatus('error')
    }
  }

  async function restoreBackup() {
    if (!validatedBackup || importStatus === 'restoring' || status === 'saving') return
    setImportStatus('restoring')
    setImportError('')
    onBackupRestoreStateChange(true)
    try {
      await restoreSpottrBackup(validatedBackup, { gymService, exerciseService, workoutService, sessionService, settingsService })
      setSettings(validatedBackup.settings)
      setStatus('ready')
      onSettingsChange(validatedBackup.settings)
      onBackupRestored(validatedBackup.settings)
      exerciseService.getMediaStorageUsage().then((usage) => {
        setStorage(usage)
        setStorageStatus('ready')
      }).catch(() => setStorageStatus('error'))
      setValidatedBackup(null)
      setImportStatus('restored')
    } catch (caught) {
      const rollbackFailed = caught instanceof AggregateError
        && caught.message.includes('could not be fully preserved')
      setImportError(rollbackFailed
        ? 'The backup could not be restored, and some saved data may have changed. Keep this tab open and retry from your backup.'
        : 'The backup could not be restored. Your previous saved data has been preserved.')
      setImportStatus('error')
    } finally {
      onBackupRestoreStateChange(false)
    }
  }

  return (
    <section id="main-view" role="tabpanel" aria-labelledby="tab-settings" aria-busy={importStatus === 'restoring'} className="settings-view">
      <div className="section-heading">
        <div><p className="eyebrow">Saved on this device</p><h2>Settings</h2><p>Choose how workout feedback and targets appear.</p></div>
      </div>
      {status === 'loading' && <p role="status">Loading settings…</p>}
      {error && <p role="alert" className="form-message error-copy">{error}</p>}
      {status !== 'loading' && status !== 'error' && (
        <form className="settings-form" onSubmit={(event) => void save(event)} onChange={() => { if (status === 'saved') setStatus('ready') }}>
          <Panel className="settings-panel" aria-labelledby="training-preferences-title">
            <h3 id="training-preferences-title">Training preferences</h3>
            <label>Weight unit<select disabled={importStatus === 'restoring'} value={settings.weightUnit} onChange={(event) => setSettings({ ...settings, weightUnit: event.target.value as AppSettings['weightUnit'] })}><option value="kg">Kilograms (kg)</option><option value="lb">Pounds (lb)</option></select></label>
            <label className="check-setting"><input type="checkbox" disabled={importStatus === 'restoring'} checked={settings.progressiveOverloadCues} onChange={(event) => setSettings({ ...settings, progressiveOverloadCues: event.target.checked })} /> Progressive overload cues</label>
            <label className="check-setting"><input type="checkbox" disabled={importStatus === 'restoring'} checked={settings.prCelebrations} onChange={(event) => setSettings({ ...settings, prCelebrations: event.target.checked })} /> PR celebrations</label>
            <label className="check-setting"><input type="checkbox" disabled={importStatus === 'restoring'} checked={settings.restTimerEnabled} onChange={(event) => setSettings({ ...settings, restTimerEnabled: event.target.checked })} /> Rest reminders</label>
            <label>Rest duration (seconds)<input type="number" min="15" max="600" step="1" disabled={!settings.restTimerEnabled || importStatus === 'restoring'} value={settings.restSeconds} onChange={(event) => setSettings({ ...settings, restSeconds: Number(event.target.value) })} /></label>
          </Panel>
          <Panel className="settings-panel storage-panel" aria-labelledby="storage-title">
            <Database size={28} aria-hidden="true" />
            <h3 id="storage-title">Media storage</h3>
            {storageStatus === 'loading' && <p role="status">Loading media storage usage…</p>}
            {storageStatus === 'error' && <p role="alert">Media storage usage is unavailable. Your saved media has not been changed.</p>}
            {storageStatus === 'ready' && storage && <><strong>{formatBytes(storage.bytes)} used across {storage.count} {storage.count === 1 ? 'file' : 'files'}</strong><p>{formatBytes(storage.limitBytes)} local media limit. Remove individual files from Exercises when you no longer need them.</p></>}
          </Panel>
          <Panel className="settings-panel storage-panel" aria-labelledby="backup-title">
            <Download size={28} aria-hidden="true" />
            <h3 id="backup-title">Complete backup</h3>
            <p>Download a versioned JSON backup of your gyms, exercises, media, workouts, sessions, and settings.</p>
            <ActionButton type="button" disabled={backupStatus === 'exporting' || importStatus === 'restoring'} onClick={() => void exportBackup()}>
              <Download size={18} aria-hidden="true" /> {backupStatus === 'exporting' ? 'Preparing backup…' : 'Download backup'}
            </ActionButton>
            {backupStatus === 'downloaded' && <p role="status">Backup downloaded.</p>}
            {backupError && <p role="alert" className="form-message error-copy">{backupError}</p>}
            <label>
              Choose backup file
              <input
                type="file"
                accept="application/json,.json"
                disabled={importStatus === 'validating' || importStatus === 'restoring'}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void validateImport(file)
                  event.target.value = ''
                }}
              />
            </label>
            <p>Spottr checks the complete file before any restore can change your saved data.</p>
            {importStatus === 'validating' && <p role="status"><Upload size={18} aria-hidden="true" /> Checking backup…</p>}
            {importStatus === 'valid' && <><p role="status">Backup is compatible and ready to restore. Restoring replaces all data currently saved in Spottr.</p><ActionButton type="button" disabled={status === 'saving'} onClick={() => void restoreBackup()}><Upload size={18} aria-hidden="true" /> Restore backup</ActionButton></>}
            {importStatus === 'restoring' && <p role="status">Restoring backup…</p>}
            {importStatus === 'restored' && <p role="status">Backup restored. Your previous Spottr data was replaced.</p>}
            {importError && <p role="alert" className="form-message error-copy">{importError}</p>}
          </Panel>
          <div className="settings-save">
            <ActionButton type="submit" disabled={status === 'saving' || importStatus === 'restoring'}><Save size={18} aria-hidden="true" /> {status === 'saving' ? 'Saving…' : 'Save settings'}</ActionButton>
            {status === 'saved' && <p role="status">Settings saved.</p>}
          </div>
        </form>
      )}
    </section>
  )
}
