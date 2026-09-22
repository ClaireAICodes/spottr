import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Dumbbell, ImagePlus, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import type { ChangeEvent, FormEvent } from 'react'
import type { Exercise, ExerciseMedia, ExerciseService } from './exercises'
import { ActionButton, Panel } from './primitives'

type EditorState = {
  exercise: Exercise | null
  name: string
  muscleGroup: string
  equipment: string
  notes: string
}

export function ExerciseLibrary({ service }: { service: ExerciseService }) {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [query, setQuery] = useState('')
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [mediaBusyId, setMediaBusyId] = useState<string | null>(null)
  const [mediaAnnouncement, setMediaAnnouncement] = useState('')
  const loadRequest = useRef(0)
  const saveInFlight = useRef(false)
  const queryRef = useRef(query)
  const mediaPickerRefs = useRef(new Map<string, HTMLInputElement>())

  async function load(searchQuery = queryRef.current) {
    const requestId = ++loadRequest.current
    setStatus('loading')
    try {
      const items = await service.search(searchQuery)
      if (requestId !== loadRequest.current) return
      setExercises(items)
      setError('')
      setStatus('ready')
    } catch {
      if (requestId !== loadRequest.current) return
      setError('Your exercise library could not be loaded. Your existing data has not been changed.')
      setStatus('error')
    }
  }

  useEffect(() => {
    void load(query)
    return () => { loadRequest.current += 1 }
  }, [query, service])

  function openEditor(exercise: Exercise | null) {
    setEditor({
      exercise,
      name: exercise?.name ?? '',
      muscleGroup: exercise?.muscleGroup ?? '',
      equipment: exercise?.equipment ?? '',
      notes: exercise?.notes ?? '',
    })
    setError('')
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!editor || saveInFlight.current) return
    saveInFlight.current = true
    setIsSaving(true)
    try {
      const draft = {
        name: editor.name,
        muscleGroup: editor.muscleGroup,
        equipment: editor.equipment,
        notes: editor.notes,
      }
      if (editor.exercise) await service.update(editor.exercise.id, draft)
      else await service.create(draft)
      setEditor(null)
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The exercise could not be saved.')
    } finally {
      saveInFlight.current = false
      setIsSaving(false)
    }
  }

  async function addMedia(exercise: Exercise, event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    if (files.length === 0 || mediaBusyId) return
    setMediaBusyId(exercise.id)
    setError('')
    const failures: string[] = []
    for (const file of files) {
      try {
        const media = await service.addMedia(exercise.id, file)
        setExercises((current) => current.map((item) => item.id === exercise.id
          ? { ...item, media: [...item.media, media] }
          : item))
        setMediaAnnouncement(`${file.name} added to ${exercise.name}`)
      } catch (caught) {
        failures.push(`${file.name}: ${caught instanceof Error ? caught.message : 'could not be added'}`)
      }
    }
    if (failures.length) setError(failures.join(' '))
    setMediaBusyId(null)
  }

  async function changeMedia(exerciseId: string, mediaId: string, action: 'up' | 'down' | 'remove') {
    if (mediaBusyId) return
    setMediaBusyId(exerciseId)
    setError('')
    try {
      const updated = action === 'remove'
        ? await service.removeMedia(exerciseId, mediaId)
        : await service.moveMedia(exerciseId, mediaId, action)
      setExercises((current) => current.map((item) => item.id === exerciseId ? updated : item))
      const changed = updated.media.find(({ id }) => id === mediaId)
      setMediaAnnouncement(action === 'remove'
        ? 'Media removed'
        : `${changed?.name ?? 'Media'} moved ${action}`)
      if (action === 'remove') setTimeout(() => mediaPickerRefs.current.get(exerciseId)?.focus(), 0)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The media order could not be changed.')
    } finally {
      setMediaBusyId(null)
    }
  }

  return (
    <section id="main-view" role="tabpanel" aria-labelledby="tab-train" className="exercise-library">
      <div className="section-heading exercise-heading">
        <div>
          <p className="eyebrow">Shared library</p>
          <h2>Exercises</h2>
          <p>Create exercises once, then find them from any gym.</p>
        </div>
        <ActionButton type="button" onClick={() => openEditor(null)} disabled={isSaving}>
          <Plus size={18} aria-hidden="true" /> Add exercise
        </ActionButton>
      </div>

      <label className="exercise-search">
        <span>Search exercises</span>
        <span className="search-control"><Search size={18} aria-hidden="true" /><input type="search" value={query} onChange={(event) => { queryRef.current = event.target.value; setQuery(event.target.value) }} placeholder="Name, muscle, equipment, or notes" /></span>
      </label>
      {status === 'ready' && error && !editor && <p role="alert" className="form-message error-copy">{error}</p>}
      <p className="visually-hidden" aria-live="polite">{mediaAnnouncement}</p>

      {status === 'loading' && <p role="status" className="state-message">Loading exercises…</p>}
      {status === 'error' && <div role="alert" className="state-message error-state"><p>{error}</p><button type="button" className="text-button" onClick={() => void load(query)}>Try again</button></div>}
      {status === 'ready' && exercises.length === 0 && !editor && (
        <Panel className="exercise-empty">
          <Dumbbell size={30} aria-hidden="true" />
          <h3>{query ? 'No matching exercises' : 'No exercises yet'}</h3>
          <p>{query ? 'Try another search or clear the search field.' : 'Add your first shared exercise, then attach ordered form images or videos.'}</p>
          {!query && <ActionButton type="button" onClick={() => openEditor(null)}>Add your first exercise</ActionButton>}
        </Panel>
      )}

      {status === 'ready' && exercises.length > 0 && (
        <div className="exercise-list" aria-label="Exercise library">
          {exercises.map((exercise) => (
            <article key={exercise.id} className="exercise-card" aria-label={exercise.name}>
              <div className="exercise-card-heading">
                <div>
                  <p className="exercise-meta">{[exercise.muscleGroup, exercise.equipment].filter(Boolean).join(' · ') || 'Uncategorised'}</p>
                  <h3>{exercise.name}</h3>
                  {exercise.notes && <p>{exercise.notes}</p>}
                </div>
                <button type="button" aria-label={`Edit ${exercise.name}`} onClick={() => openEditor(exercise)} disabled={isSaving || Boolean(mediaBusyId)}><Pencil size={16} aria-hidden="true" /> Edit</button>
              </div>
              <div className="exercise-media-manager">
                <div className="media-policy">
                  <strong>Form media</strong>
                  <span>Images compressed · videos up to 15 MB · 25 MB total</span>
                </div>
                {exercise.media.length > 0 && (
                  <ol className="media-list" aria-label={`Media for ${exercise.name}`}>
                    {exercise.media.map((media, index) => (
                      <li key={media.id} aria-label={`${index + 1}. ${media.name}`}>
                        <MediaPreview media={media} />
                        <div className="media-details"><strong>{media.name}</strong><span>{media.kind} · {formatBytes(media.size)}</span></div>
                        <div className="media-actions">
                          <button type="button" aria-label={`Move ${media.name} up`} disabled={index === 0 || Boolean(mediaBusyId)} onClick={() => void changeMedia(exercise.id, media.id, 'up')}><ArrowUp size={16} aria-hidden="true" /></button>
                          <button type="button" aria-label={`Move ${media.name} down`} disabled={index === exercise.media.length - 1 || Boolean(mediaBusyId)} onClick={() => void changeMedia(exercise.id, media.id, 'down')}><ArrowDown size={16} aria-hidden="true" /></button>
                          <button type="button" aria-label={`Remove ${media.name}`} disabled={Boolean(mediaBusyId)} onClick={() => void changeMedia(exercise.id, media.id, 'remove')}><Trash2 size={16} aria-hidden="true" /></button>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
                <label className={`media-picker${mediaBusyId === exercise.id ? ' busy' : ''}`}>
                  <ImagePlus size={18} aria-hidden="true" /> {mediaBusyId === exercise.id ? 'Saving media…' : 'Add image or video'}
                  <input ref={(node) => { if (node) mediaPickerRefs.current.set(exercise.id, node); else mediaPickerRefs.current.delete(exercise.id) }} type="file" accept="image/jpeg,image/png,video/*" multiple disabled={Boolean(mediaBusyId)} onChange={(event) => void addMedia(exercise, event)} />
                </label>
              </div>
            </article>
          ))}
        </div>
      )}

      {editor && (
        <Panel className="exercise-editor" aria-labelledby="exercise-editor-title">
          <h3 id="exercise-editor-title">{editor.exercise ? `Edit ${editor.exercise.name}` : 'Add an exercise'}</h3>
          <form onSubmit={(event) => void save(event)}>
            <label>Exercise name<input required autoFocus disabled={isSaving} value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} /></label>
            <div className="exercise-fields">
              <label>Muscle group<input disabled={isSaving} value={editor.muscleGroup} onChange={(event) => setEditor({ ...editor, muscleGroup: event.target.value })} /></label>
              <label>Equipment<input disabled={isSaving} value={editor.equipment} onChange={(event) => setEditor({ ...editor, equipment: event.target.value })} /></label>
            </div>
            <label>Notes<textarea rows={3} disabled={isSaving} value={editor.notes} onChange={(event) => setEditor({ ...editor, notes: event.target.value })} /></label>
            {error && <p role="alert" className="form-message error-copy">{error}</p>}
            <div className="form-actions">
              <button type="button" className="text-button" disabled={isSaving} onClick={() => setEditor(null)}>Cancel</button>
              <ActionButton type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : editor.exercise ? 'Save changes' : 'Save exercise'}</ActionButton>
            </div>
          </form>
        </Panel>
      )}
    </section>
  )
}

function MediaPreview({ media }: { media: ExerciseMedia }) {
  const [source, setSource] = useState('')
  useEffect(() => {
    if (typeof URL.createObjectURL !== 'function') return
    const url = URL.createObjectURL(media.blob)
    setSource(url)
    return () => URL.revokeObjectURL(url)
  }, [media.blob])

  if (!source) return <span className="media-placeholder" aria-hidden="true"><ImagePlus size={20} /></span>
  return media.kind === 'image'
    ? <img className="media-preview" src={source} alt="" />
    : <video className="media-preview" src={source} aria-label={`Preview ${media.name}`} controls muted preload="metadata" />
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
