import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, LocateFixed, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import type { FormEvent } from 'react'
import type { Gym, GymLocation, GymService } from './gyms'
import { ActionButton, Panel, StatusPill } from './primitives'

type GymManagerProps = {
  service: GymService
  onClose: () => void
  onSelectionChange: () => void
}

type EditorState = { gym: Gym | null; name: string; address: string; location?: GymLocation }

export function GymManager({ service, onClose, onSelectionChange }: GymManagerProps) {
  const [gyms, setGyms] = useState<Gym[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Gym | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [operationError, setOperationError] = useState('')
  const [dialogError, setDialogError] = useState('')
  const [locationMessage, setLocationMessage] = useState('')
  const [isLocating, setIsLocating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isMutating, setIsMutating] = useState(false)
  const locationRequest = useRef(0)
  const deleteInFlight = useRef(false)
  const mutationInFlight = useRef(false)
  const loadRequest = useRef(0)
  const focusAfterDelete = useRef(false)
  const backButton = useRef<HTMLButtonElement>(null)
  const keepButton = useRef<HTMLButtonElement>(null)
  const deleteButton = useRef<HTMLButtonElement>(null)
  const deleteReturnFocus = useRef<HTMLButtonElement | null>(null)

  async function load() {
    const requestId = ++loadRequest.current
    try {
      setStatus('loading')
      const [items, selected] = await Promise.all([service.list(), service.getSelected()])
      if (requestId !== loadRequest.current) return
      setGyms(items)
      setSelectedId(selected?.id ?? null)
      setError('')
      setStatus('ready')
    } catch {
      if (requestId !== loadRequest.current) return
      setError('Your gyms could not be loaded. Your existing data has not been changed.')
      setStatus('error')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  function openEditor(gym: Gym | null) {
    locationRequest.current += 1
    setIsLocating(false)
    setEditor({
      gym,
      name: gym?.name ?? '',
      address: gym?.address ?? '',
      location: gym?.location,
    })
    setError('')
    setOperationError('')
    setLocationMessage('')
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!editor || mutationInFlight.current) return
    mutationInFlight.current = true
    setIsMutating(true)
    setIsSaving(true)
    try {
      const draft = { name: editor.name, address: editor.address, location: editor.location }
      if (editor.gym) await service.update(editor.gym.id, draft)
      else await service.create(draft)
      locationRequest.current += 1
      setEditor(null)
      await load()
      onSelectionChange()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The gym could not be saved.')
    } finally {
      mutationInFlight.current = false
      setIsSaving(false)
      setIsMutating(false)
    }
  }

  async function selectGym(id: string) {
    if (mutationInFlight.current) return
    mutationInFlight.current = true
    setIsMutating(true)
    try {
      setOperationError('')
      await service.select(id)
      await load()
      onSelectionChange()
    } catch {
      setOperationError('That gym could not be selected. Try again.')
    } finally {
      mutationInFlight.current = false
      setIsMutating(false)
    }
  }

  async function deleteGym() {
    if (!deleteTarget || mutationInFlight.current) return
    mutationInFlight.current = true
    deleteInFlight.current = true
    setIsMutating(true)
    setIsDeleting(true)
    setDialogError('')
    try {
      await service.remove(deleteTarget.id)
      setDeleteTarget(null)
      await load()
      onSelectionChange()
      focusAfterDelete.current = true
    } catch {
      setDialogError('That gym could not be deleted. Your data is unchanged.')
    } finally {
      deleteInFlight.current = false
      mutationInFlight.current = false
      setIsDeleting(false)
      setIsMutating(false)
    }
  }

  function captureLocation() {
    if (!editor) return
    if (!navigator.geolocation) {
      setLocationMessage('Location is unavailable. Enter an address manually instead.')
      return
    }
    setIsLocating(true)
    setLocationMessage('')
    const requestId = ++locationRequest.current
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (requestId !== locationRequest.current) return
        setEditor((current) => current ? {
          ...current,
          location: { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy },
        } : current)
        setLocationMessage('Current location added. You can still enter a readable address.')
        setIsLocating(false)
      },
      () => {
        if (requestId !== locationRequest.current) return
        setLocationMessage('Location permission was not granted. Enter an address manually instead.')
        setIsLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  }

  function closeEditor() {
    locationRequest.current += 1
    setIsLocating(false)
    setEditor(null)
  }

  function closeDeleteDialog() {
    if (deleteInFlight.current) return
    setDeleteTarget(null)
    setDialogError('')
    queueMicrotask(() => deleteReturnFocus.current?.focus())
  }

  function handleDialogKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (!deleteInFlight.current) closeDeleteDialog()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = [keepButton.current, deleteButton.current].filter(Boolean) as HTMLButtonElement[]
    if (focusable.length === 0) return
    const currentIndex = focusable.indexOf(document.activeElement as HTMLButtonElement)
    const nextIndex = event.shiftKey
      ? (currentIndex - 1 + focusable.length) % focusable.length
      : (currentIndex + 1) % focusable.length
    event.preventDefault()
    focusable[nextIndex].focus()
  }

  useEffect(() => {
    if (deleteTarget) keepButton.current?.focus()
  }, [deleteTarget])

  useEffect(() => {
    if (!deleteTarget && !isMutating && focusAfterDelete.current) {
      focusAfterDelete.current = false
      backButton.current?.focus()
    }
  }, [deleteTarget, isMutating])

  return (
    <section id="main-view" role="tabpanel" aria-labelledby="tab-home" className="gym-manager">
      <div className="gym-manager-content" inert={deleteTarget ? true : undefined} aria-hidden={deleteTarget ? true : undefined}>
      <div className="section-heading">
        <button ref={backButton} type="button" className="text-button" onClick={onClose} disabled={isMutating}><ArrowLeft size={18} aria-hidden="true" /> Back to Home</button>
        <div>
          <p className="eyebrow">Training places</p>
          <h2>Your gyms</h2>
          <p>Choose where you are training so future workouts open in the right context.</p>
        </div>
        <ActionButton type="button" onClick={() => openEditor(null)} disabled={isMutating}><Plus size={18} aria-hidden="true" /> Add gym</ActionButton>
      </div>

      {operationError && <p className="form-message error-copy" role="alert">{operationError}</p>}

      {status === 'loading' && <p role="status" className="state-message">Loading your gyms…</p>}
      {status === 'error' && (
        <div className="state-message error-state" role="alert">
          <p>{error}</p>
          <button type="button" className="text-button" onClick={() => void load()}>Try again</button>
        </div>
      )}
      {status === 'ready' && gyms.length === 0 && !editor && (
        <Panel className="gym-empty">
          <MapPin size={30} aria-hidden="true" />
          <h3>No gyms yet</h3>
          <p>Add your regular training place. An address is optional and can always be entered manually.</p>
          <ActionButton type="button" onClick={() => openEditor(null)}>Add your first gym</ActionButton>
        </Panel>
      )}

      {status === 'ready' && gyms.length > 0 && (
        <div className="gym-list" aria-label="Saved gyms">
          {gyms.map((gym) => {
            const selected = gym.id === selectedId
            return (
              <article key={gym.id} className={`gym-card${selected ? ' selected' : ''}`} aria-label={gym.name}>
                <div className="gym-card-title">
                  <div>
                    {selected && <StatusPill>Current gym</StatusPill>}
                    <h3>{gym.name}</h3>
                    <p>{gym.address || 'No address added'}</p>
                    {gym.location && <small><LocateFixed size={14} aria-hidden="true" /> Location saved</small>}
                  </div>
                  {selected && <Check size={24} aria-label="Selected" />}
                </div>
                <div className="gym-actions">
                  <button type="button" disabled={selected || isMutating} onClick={() => void selectGym(gym.id)}>{selected ? 'Selected' : 'Select'}</button>
                  <button type="button" disabled={isMutating} onClick={() => openEditor(gym)}><Pencil size={16} aria-hidden="true" /> Edit</button>
                  <button type="button" disabled={isMutating} className="danger-button" aria-label={`Delete ${gym.name}`} onClick={(event) => { deleteReturnFocus.current = event.currentTarget; setDeleteTarget(gym) }}><Trash2 size={16} aria-hidden="true" /> Delete</button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {editor && (
        <Panel className="gym-editor" aria-labelledby="gym-editor-title">
          <h3 id="gym-editor-title">{editor.gym ? `Edit ${editor.gym.name}` : 'Add a gym'}</h3>
          <form onSubmit={(event) => void save(event)}>
            <label>Gym name<input value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} autoFocus required disabled={isSaving} /></label>
            <label>Address (optional)<textarea value={editor.address} onChange={(event) => setEditor({ ...editor, address: event.target.value })} rows={2} disabled={isSaving} /></label>
            <button className="location-button" type="button" onClick={captureLocation} disabled={isLocating || isSaving}>
              <LocateFixed size={18} aria-hidden="true" /> {isLocating ? 'Finding location…' : editor.location ? 'Update current location' : 'Use current location'}
            </button>
            {locationMessage && <p className="form-message" role="alert">{locationMessage}</p>}
            {error && <p className="form-message error-copy" role="alert">{error}</p>}
            <div className="form-actions">
              <button type="button" className="text-button" onClick={closeEditor} disabled={isSaving}>Cancel</button>
              <ActionButton type="submit" disabled={isSaving || isLocating}>{isSaving ? 'Saving…' : editor.gym ? 'Save changes' : 'Save gym'}</ActionButton>
            </div>
          </form>
        </Panel>
      )}
      </div>

      {deleteTarget && (
        <div className="dialog-backdrop">
          <div role="dialog" aria-modal="true" aria-labelledby="delete-gym-title" className="confirm-dialog" onKeyDown={handleDialogKeyDown}>
            <h3 id="delete-gym-title">Delete {deleteTarget.name}?</h3>
            <p>This removes the gym from this device. This action cannot be undone.</p>
            {dialogError && <p className="form-message error-copy" role="alert">{dialogError}</p>}
            <div className="form-actions">
              <button ref={keepButton} type="button" className="text-button" onClick={closeDeleteDialog} disabled={isDeleting}>Keep gym</button>
              <button ref={deleteButton} type="button" className="danger-confirm" onClick={() => void deleteGym()} disabled={isDeleting}>{isDeleting ? 'Deleting…' : 'Delete gym'}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
