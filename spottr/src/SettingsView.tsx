import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Database, Download, Save, Upload } from 'lucide-react'
import { downloadSpottrBackup, MAX_BACKUP_FILE_BYTES, parseSpottrBackup, serializeSpottrBackup, type SpottrBackup } from './backup'
import type { Dataset } from './datasetCoordinator'
import { preflightBackupMedia } from './backupMediaPreflight'
import type { ExerciseService } from './exercises'

import { InstallPanel, type InstallPromptState } from './InstallPanel'
import { ActionButton, Panel, revealNumericInput } from './primitives'

import { DEFAULT_SETTINGS, type AppSettings, type SettingsService } from './settings'


function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function SettingsView({
  settingsService,
  exerciseService,
  backupOperations,
  onSettingsChange,
  onBackupRestored,
  onBackupRestoreStateChange,
  installPrompt,
}: {
  settingsService: SettingsService
  exerciseService: ExerciseService
  backupOperations: Pick<Dataset, 'exportBackup' | 'restoreBackup'>
  onSettingsChange: (settings: AppSettings) => void
  onBackupRestored: (settings: AppSettings) => void
  onBackupRestoreStateChange: (restoring: boolean) => void
  installPrompt: InstallPromptState
}) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [storage, setStorage] = useState<{ bytes: number; count: number; limitBytes: number } | null>(null)
  const [storageStatus, setStorageStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [status, setStatus] = useState<'loading' | 'ready' | 'saving' | 'saved' | 'error'>('loading')
  const [backupStatus, setBackupStatus] = useState<'idle' | 'exporting' | 'downloaded' | 'error'>('idle')
  const [importStatus, setImportStatus] = useState<'idle' | 'validating' | 'valid' | 'restoring' | 'restored' | 'error'>('idle')
  const [validatedBackup, setValidatedBackup] = useState<SpottrBackup | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [error, setError] = useState('')
  const [backupError, setBackupError] = useState('')
  const [importError, setImportError] = useState('')
  const saveButton = useRef<HTMLButtonElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  function cancelImport() {
    importOperation.current?.abort()
    setConfirmReplace(false)
    setValidatedBackup(null)
    setImportStatus('idle')
    setImportError('')
    fileInput.current?.focus()
  }
  const importOperation = useRef<AbortController | null>(null)
  useEffect(() => () => { importOperation.current?.abort() }, [backupOperations, exerciseService, settingsService])
  const saveOperation = useRef<{ current: boolean; keyboard: boolean; settled: boolean } | null>(null)

  useEffect(() => {
    const relinquish = () => { if (saveOperation.current) saveOperation.current.keyboard = false }
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Tab' || event.key === 'Escape') relinquish() }
    const focusin = (event: FocusEvent) => { if (event.target !== saveButton.current) relinquish() }
    document.addEventListener('keydown', keydown, true)
    document.addEventListener('pointerdown', relinquish, true)
    document.addEventListener('focusin', focusin, true)
    window.addEventListener('blur', relinquish)
    return () => {
      if (saveOperation.current) saveOperation.current.current = false
      document.removeEventListener('keydown', keydown, true)
      document.removeEventListener('pointerdown', relinquish, true)
      document.removeEventListener('focusin', focusin, true)
      window.removeEventListener('blur', relinquish)
    }
  }, [settingsService, exerciseService])

  // Restore only after React has re-enabled the initiating contextual trigger.
  useLayoutEffect(() => {
    const operation = saveOperation.current
    if (!operation?.settled) return
    saveOperation.current = null
    if (operation.current && operation.keyboard && !saveButton.current?.disabled) saveButton.current?.focus()
  }, [status, error])

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
    if (status === 'saving' || saveOperation.current?.current) return
    const operation = { current: true, keyboard: document.activeElement === saveButton.current && !!saveButton.current?.matches(':focus-visible'), settled: false }
    saveOperation.current = operation
    setStatus('saving')
    setError('')
    try {
      const saved = await settingsService.update(settings)
      if (!operation.current) return
      operation.settled = true
      setSettings(saved)
      onSettingsChange(saved)
      setStatus('saved')
    } catch (caught) {
      if (!operation.current) return
      operation.settled = true
      setError(caught instanceof Error ? caught.message : 'Settings could not be saved.')
      setStatus('ready')
    }
  }

  async function exportBackup() {
    if (backupStatus === 'exporting') return
    setBackupStatus('exporting')
    setBackupError('')
    try {
      const backup = await backupOperations.exportBackup()
      downloadSpottrBackup(serializeSpottrBackup(backup))
      setBackupStatus('downloaded')
    } catch (caught) {
      setBackupError(caught instanceof Error ? caught.message : 'Your backup could not be created.')
      setBackupStatus('error')
    }
  }

  async function validateImport(file: File) {
    importOperation.current?.abort()
    const operation = new AbortController()
    importOperation.current = operation
    setConfirmReplace(false)
    setImportStatus('validating')
    setImportError('')
    setValidatedBackup(null)
    try {
      if (file.size > MAX_BACKUP_FILE_BYTES) {
        throw new Error('This backup file is too large. Your saved data has not been changed.')
      }
      const serialized = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        const abort = () => { reader.abort(); reject(operation.signal.reason) }
        const cleanup = () => operation.signal.removeEventListener('abort', abort)
        operation.signal.addEventListener('abort', abort, { once: true })
        reader.onload = () => { cleanup(); resolve(String(reader.result)) }
        reader.onerror = () => { cleanup(); reject(reader.error ?? new Error('The backup file could not be read.')) }
        reader.onabort = cleanup
        reader.readAsText(file)
      })
      operation.signal.throwIfAborted()
      const incoming = await preflightBackupMedia(parseSpottrBackup(serialized), operation.signal)
      if (operation.signal.aborted) return
      setValidatedBackup(incoming)
      setImportStatus('valid')
    } catch (caught) {
      if (operation.signal.aborted) return
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
      await backupOperations.restoreBackup(validatedBackup)
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
    <section id="main-view" role="tabpanel" aria-labelledby="tab-settings" aria-busy={importStatus === 'restoring'} className="settings-view" onFocusCapture={revealNumericInput} onInputCapture={revealNumericInput} onKeyDown={(event) => {
      if (event.key === 'Escape' && (importStatus === 'valid' || importStatus === 'validating')) {
        event.preventDefault()
        cancelImport()
      }
    }}>
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
            <p>Rest reminders start an elapsed timer after logging a set. Duration is a suggestion, not a limit; use Stop rest to end it. Turning reminders off prevents new automatic timers without ending a running rest.</p>
          </Panel>
          <Panel className="settings-panel storage-panel" aria-labelledby="storage-title">
            <Database size={28} aria-hidden="true" />
            <h3 id="storage-title">Media storage</h3>
            {storageStatus === 'loading' && <p role="status">Loading media storage usage…</p>}
            {storageStatus === 'error' && <p role="alert">Media storage usage is unavailable. Your saved media has not been changed.</p>}
            {storageStatus === 'ready' && storage && <><strong>{formatBytes(storage.bytes)} used across {storage.count} {storage.count === 1 ? 'file' : 'files'}</strong><p>{formatBytes(storage.limitBytes)} local media limit. Remove individual files from Exercises when you no longer need them.</p></>}
          </Panel>
          <InstallPanel installPrompt={installPrompt} />
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
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                disabled={importStatus === 'restoring'}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void validateImport(file)
                  event.target.value = ''
                }}
              />
            </label>
            <p>Spottr checks the complete file before any restore can change your saved data.</p>
            {importStatus === 'validating' && <><p role="status"><Upload size={18} aria-hidden="true" /> Checking backup…</p><ActionButton type="button" onClick={cancelImport}>Cancel checking backup</ActionButton></>}
            {importStatus === 'valid' && !confirmReplace && <><p role="status">Backup is compatible and ready to restore. Restoring replaces all data currently saved in Spottr.</p><ActionButton type="button" disabled={status === 'saving'} onClick={() => setConfirmReplace(true)}><Upload size={18} aria-hidden="true" /> Restore backup</ActionButton></>}
            {importStatus === 'valid' && confirmReplace && <fieldset><legend>Replace saved Spottr data?</legend><p>This replaces all gyms, exercises, media, workouts, active and completed sessions, and settings on this device. Current data will be lost. Download a backup first if you want to keep it.</p><ActionButton type="button" autoFocus disabled={status === 'saving'} onClick={() => void restoreBackup()}>Replace all saved data</ActionButton><ActionButton type="button" onClick={cancelImport}>Cancel</ActionButton></fieldset>}
            {importStatus === 'restoring' && <p role="status">Restoring backup…</p>}
            {importStatus === 'restored' && <p role="status">Backup restored. Your previous Spottr data was replaced.</p>}
            {importError && <p role="alert" className="form-message error-copy">{importError}</p>}
          </Panel>
          <div className="settings-save">
            <ActionButton ref={saveButton} type="submit" disabled={status === 'saving' || importStatus === 'restoring'}><Save size={18} aria-hidden="true" /> {status === 'saving' ? 'Saving…' : 'Save settings'}</ActionButton>
            {status === 'saved' && <p role="status">Settings saved.</p>}
          </div>
        </form>
      )}
    </section>
  )
}
