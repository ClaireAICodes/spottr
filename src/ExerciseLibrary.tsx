import { useEffect, useRef, useState } from 'react'
import { Dumbbell, Pencil, Plus, Search } from 'lucide-react'
import type { FormEvent } from 'react'
import type { Exercise, ExerciseService } from './exercises'
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
  const loadRequest = useRef(0)
  const saveInFlight = useRef(false)
  const queryRef = useRef(query)

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

      {status === 'loading' && <p role="status" className="state-message">Loading exercises…</p>}
      {status === 'error' && <div role="alert" className="state-message error-state"><p>{error}</p><button type="button" className="text-button" onClick={() => void load(query)}>Try again</button></div>}
      {status === 'ready' && exercises.length === 0 && !editor && (
        <Panel className="exercise-empty">
          <Dumbbell size={30} aria-hidden="true" />
          <h3>{query ? 'No matching exercises' : 'No exercises yet'}</h3>
          <p>{query ? 'Try another search or clear the search field.' : 'Add your first shared exercise. Media can be connected in a later phase.'}</p>
          {!query && <ActionButton type="button" onClick={() => openEditor(null)}>Add your first exercise</ActionButton>}
        </Panel>
      )}

      {status === 'ready' && exercises.length > 0 && (
        <div className="exercise-list" aria-label="Exercise library">
          {exercises.map((exercise) => (
            <article key={exercise.id} className="exercise-card" aria-label={exercise.name}>
              <div>
                <p className="exercise-meta">{[exercise.muscleGroup, exercise.equipment].filter(Boolean).join(' · ') || 'Uncategorised'}</p>
                <h3>{exercise.name}</h3>
                {exercise.notes && <p>{exercise.notes}</p>}
              </div>
              <button type="button" aria-label={`Edit ${exercise.name}`} onClick={() => openEditor(exercise)} disabled={isSaving}><Pencil size={16} aria-hidden="true" /> Edit</button>
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
