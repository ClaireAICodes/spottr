import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Copy, Dumbbell, Pencil, Plus, Trash2 } from 'lucide-react'
import type { FormEvent } from 'react'
import type { Exercise, ExerciseDraft, ExerciseService } from './exercises'
import type { Gym, GymService } from './gyms'
import { ActionButton, Panel } from './primitives'
import { displayWeight, storedWeight, type AppSettings } from './settings'
import type { SetKind, TemplateExerciseDraft, WorkoutService, WorkoutTemplate } from './workouts'

type EditorState = {
  template: WorkoutTemplate | null
  name: string
  gymId: string
  exercises: TemplateExerciseDraft[]
}

type DuplicateState = {
  template: WorkoutTemplate
  gymId: string
}

let draftSequence = 0
const draftId = () => `draft-${++draftSequence}`

// Tuple encoding preserves scope even when imported IDs contain separators or overlap.
const exerciseControlKey = (exerciseId: string | undefined, action: string) => JSON.stringify(['exercise', exerciseId, action])
const setControlKey = (exerciseId: string | undefined, setId: string | undefined, action: string) => JSON.stringify(['set', exerciseId, setId, action])

export function WorkoutPlanner({
  workoutService,
  gymService,
  exerciseService,
  settings,
}: {
  workoutService: WorkoutService
  gymService: GymService
  exerciseService: ExerciseService
  settings: AppSettings
}) {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [gyms, setGyms] = useState<Gym[]>([])
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [duplicate, setDuplicate] = useState<DuplicateState | null>(null)
  const [pendingDelete, setPendingDelete] = useState<WorkoutTemplate | null>(null)
  const [exerciseQuery, setExerciseQuery] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isVarying, setIsVarying] = useState(false)
  const saveInFlight = useRef(false)
  const keepDeleteButton = useRef<HTMLButtonElement>(null)
  const deleteDialog = useRef<HTMLDivElement>(null)
  const confirmDeleteButton = useRef<HTMLButtonElement>(null)
  const deleteReturnFocus = useRef<HTMLButtonElement | null>(null)
  const addWorkoutButton = useRef<HTMLButtonElement>(null)
  const focusAfterDelete = useRef(false)
  const editButtons = useRef(new Map<string, HTMLButtonElement>())
  const panelReturnFocus = useRef<() => void>(() => {})
  const editorControls = useRef(new Map<string, HTMLElement>())
  const pendingEditorFocus = useRef<string | null>(null)
  const [savedFocusId, setSavedFocusId] = useState<string | null>(null)
  const [newExercise, setNewExercise] = useState<ExerciseDraft | null>(null)
  const [exerciseError, setExerciseError] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const exerciseDialog = useRef<HTMLDivElement>(null)

  function controlRef(key: string) {
    return (node: HTMLElement | null) => {
      if (node) editorControls.current.set(key, node)
      else editorControls.current.delete(key)
    }
  }

  useEffect(() => {
    if (!editor || isSaving || newExercise || !pendingEditorFocus.current) return
    const target = editorControls.current.get(pendingEditorFocus.current)
    if (target && !target.matches(':disabled')) {
      target.focus()
      pendingEditorFocus.current = null
    }
  }, [editor, isSaving, newExercise])

  useEffect(() => {
    if (!savedFocusId || status !== 'ready' || isSaving) return
    const target = editButtons.current.get(savedFocusId)
    if (target && !target.disabled) {
      target.focus()
      setSavedFocusId(null)
    }
  }, [savedFocusId, status, isSaving])

  function closePanel() {
    setEditor(null)
    setDuplicate(null)
    setError('')
    queueMicrotask(() => panelReturnFocus.current())
  }

  async function load() {
    setStatus('loading')
    try {
      const [nextTemplates, nextGyms, nextExercises] = await Promise.all([
        workoutService.list(),
        gymService.list(),
        exerciseService.search(),
      ])
      setTemplates(nextTemplates)
      setGyms(nextGyms)
      setExercises(nextExercises)
      setError('')
      setStatus('ready')
    } catch {
      setError('Your workouts could not be loaded. Your existing data has not been changed.')
      setStatus('error')
    }
  }

  useEffect(() => { void load() }, [workoutService, gymService, exerciseService])

  function openEditor(template: WorkoutTemplate | null) {
    panelReturnFocus.current = () => {
      if (template) editButtons.current.get(template.id)?.focus()
      else addWorkoutButton.current?.focus()
    }
    setEditor({
      template,
      name: template?.name ?? '',
      gymId: template?.gymId ?? gyms[0]?.id ?? '',
      exercises: template?.exercises.map((exercise) => ({
        ...exercise,
        sets: exercise.sets.map((set) => ({ ...set })),
      })) ?? [],
    })
    setDuplicate(null)
    setExerciseQuery('')
    setError('')
  }

  function exerciseName(exerciseId: string) {
    return exercises.find(({ id }) => id === exerciseId)?.name ?? 'Unavailable exercise'
  }

  function gymName(gymId: string) {
    return gyms.find(({ id }) => id === gymId)?.name ?? 'Unavailable gym'
  }

  function updateExercise(index: number, next: TemplateExerciseDraft) {
    if (!editor) return
    const items = [...editor.exercises]
    items[index] = next
    setEditor({ ...editor, exercises: items })
  }

  function moveExercise(index: number, direction: -1 | 1) {
    if (!editor) return
    const target = index + direction
    if (target < 0 || target >= editor.exercises.length) return
    const items = [...editor.exercises]
    ;[items[index], items[target]] = [items[target], items[index]]
    const action = target === 0 ? 'down' : target === items.length - 1 ? 'up' : direction === -1 ? 'up' : 'down'
    pendingEditorFocus.current = exerciseControlKey(items[target].id, action)
    setEditor({ ...editor, exercises: items })
  }

  function removeExercise(index: number) {
    if (!editor) return
    const items = editor.exercises.filter((_, position) => position !== index)
    const next = items[Math.min(index, items.length - 1)]
    pendingEditorFocus.current = next ? exerciseControlKey(next.id, 'add') : 'search'
    setEditor({ ...editor, exercises: items })
  }

  function removeSet(exerciseIndex: number, setIndex: number) {
    if (!editor) return
    const exercise = editor.exercises[exerciseIndex]
    const sets = exercise.sets.filter((_, position) => position !== setIndex)
    if (!sets.length) return
    pendingEditorFocus.current = setControlKey(exercise.id, sets[Math.min(setIndex, sets.length - 1)].id, 'type')
    updateExercise(exerciseIndex, { ...exercise, sets })
  }

  function addExercise(exerciseId: string) {
    if (!editor || editor.exercises.some((item) => item.exerciseId === exerciseId)) return
    setEditor({
      ...editor,
      exercises: [...editor.exercises, {
        id: draftId(),
        exerciseId,
        sets: [{ id: draftId(), kind: 'working', weight: 0, reps: 8 }],
      }],
    })
  }

  function addSet(exerciseIndex: number) {
    if (!editor) return
    const exercise = editor.exercises[exerciseIndex]
    updateExercise(exerciseIndex, {
      ...exercise,
      sets: [...exercise.sets, { id: draftId(), kind: 'working', weight: 0, reps: 8 }],
    })
  }

  function cancelNewExercise() {
    if (saveInFlight.current) return
    pendingEditorFocus.current = 'create-exercise'
    setNewExercise(null)
    setExerciseError('')
  }

  async function saveNewExercise(event: FormEvent) {
    event.preventDefault()
    if (!newExercise || !editor || saveInFlight.current) return
    saveInFlight.current = true
    setIsCreating(true)
    setExerciseError('')
    try {
      const created = await exerciseService.create(newExercise)
      const entry = {
        id: draftId(), exerciseId: created.id,
        sets: [{ id: draftId(), kind: 'working' as const, weight: 0, reps: 8 }],
      }
      setExercises((items) => [...items, created].sort((left, right) => left.name.localeCompare(right.name)))
      pendingEditorFocus.current = setControlKey(entry.id, entry.sets[0].id, 'type')
      setEditor({ ...editor, exercises: [...editor.exercises, entry] })
      setExerciseQuery('')
      setNewExercise(null)
    } catch (caught) {
      setExerciseError(caught instanceof Error ? caught.message : 'The exercise could not be saved. Your workout draft is unchanged.')
    } finally {
      saveInFlight.current = false
      setIsCreating(false)
    }
  }

  function handleExerciseDialogKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelNewExercise()
    } else if (event.key === 'Tab') {
      const controls = Array.from(exerciseDialog.current?.querySelectorAll<HTMLElement>('input:not(:disabled), textarea:not(:disabled), button:not(:disabled)') ?? [])
      event.preventDefault()
      if (!controls.length) { exerciseDialog.current?.focus(); return }
      const index = controls.indexOf(document.activeElement as HTMLElement)
      controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus()
    }
  }

  useEffect(() => {
    if (!newExercise) return
    if (isCreating) exerciseDialog.current?.focus()
    else if (!exerciseDialog.current?.contains(document.activeElement)) exerciseDialog.current?.querySelector<HTMLInputElement>('input')?.focus()
  }, [newExercise, isCreating])

  function updateSet(exerciseIndex: number, setIndex: number, field: 'kind' | 'weight' | 'reps', value: string) {
    if (!editor) return
    const exercise = editor.exercises[exerciseIndex]
    const sets = [...exercise.sets]
    sets[setIndex] = {
      ...sets[setIndex],
      [field]: field === 'kind'
        ? value as SetKind
        : field === 'weight'
          ? storedWeight(Number(value), settings.weightUnit)
          : Number(value),
    }
    updateExercise(exerciseIndex, { ...exercise, sets })
  }

  function moveSet(exerciseIndex: number, setIndex: number, direction: -1 | 1) {
    if (!editor) return
    const exercise = editor.exercises[exerciseIndex]
    const target = setIndex + direction
    if (target < 0 || target >= exercise.sets.length) return
    const sets = [...exercise.sets]
    ;[sets[setIndex], sets[target]] = [sets[target], sets[setIndex]]
    const action = target === 0 ? 'down' : target === sets.length - 1 ? 'up' : direction === -1 ? 'up' : 'down'
    pendingEditorFocus.current = setControlKey(exercise.id, sets[target].id, action)
    updateExercise(exerciseIndex, { ...exercise, sets })
  }

  async function makeVariation(exerciseIndex: number) {
    if (!editor || saveInFlight.current) return
    saveInFlight.current = true
    setIsSaving(true)
    setIsVarying(true)
    setError('')
    try {
      const current = editor.exercises[exerciseIndex]
      const original = exercises.find(({ id }) => id === current.exerciseId)
      if (!original) throw new Error('The shared exercise is no longer available')
      const variation = await exerciseService.duplicate(original.id)
      setExercises((items) => [...items, variation].sort((left, right) => left.name.localeCompare(right.name)))
      pendingEditorFocus.current = setControlKey(current.id, current.sets[0].id, 'type')
      updateExercise(exerciseIndex, { ...current, exerciseId: variation.id })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The variation could not be created.')
    } finally {
      saveInFlight.current = false
      setIsVarying(false)
      setIsSaving(false)
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!editor || saveInFlight.current) return
    saveInFlight.current = true
    setIsSaving(true)
    setError('')
    try {
      const draft = { name: editor.name, gymId: editor.gymId, exercises: editor.exercises }
      const saved = editor.template
        ? await workoutService.update(editor.template.id, draft)
        : await workoutService.create(draft)
      setSavedFocusId(saved.id)
      setEditor(null)
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The workout could not be saved.')
    } finally {
      saveInFlight.current = false
      setIsSaving(false)
    }
  }

  async function createDuplicate() {
    if (!duplicate || saveInFlight.current) return
    saveInFlight.current = true
    setIsSaving(true)
    setError('')
    try {
      const saved = await workoutService.duplicate(duplicate.template.id, duplicate.gymId)
      setSavedFocusId(saved.id)
      setDuplicate(null)
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The workout could not be duplicated.')
    } finally {
      saveInFlight.current = false
      setIsSaving(false)
    }
  }

  async function deleteTemplate() {
    if (!pendingDelete || saveInFlight.current) return
    saveInFlight.current = true
    setIsSaving(true)
    setError('')
    try {
      await workoutService.remove(pendingDelete.id)
      focusAfterDelete.current = true
      setPendingDelete(null)
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The workout could not be deleted.')
    } finally {
      saveInFlight.current = false
      setIsSaving(false)
    }
  }

  function closeDeleteDialog() {
    if (saveInFlight.current) return
    setPendingDelete(null)
    setError('')
    queueMicrotask(() => deleteReturnFocus.current?.focus())
  }

  function handleDeleteDialogKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeDeleteDialog()
      return
    }
    if (event.key !== 'Tab') return
    if (saveInFlight.current) {
      event.preventDefault()
      deleteDialog.current?.focus()
      return
    }
    const focusable = [keepDeleteButton.current, confirmDeleteButton.current].filter(Boolean) as HTMLButtonElement[]
    if (focusable.length === 0) return
    const currentIndex = focusable.indexOf(document.activeElement as HTMLButtonElement)
    const nextIndex = event.shiftKey
      ? (currentIndex - 1 + focusable.length) % focusable.length
      : (currentIndex + 1) % focusable.length
    event.preventDefault()
    focusable[nextIndex].focus()
  }

  useEffect(() => {
    if (!pendingDelete) return
    if (isSaving) deleteDialog.current?.focus()
    else if (!deleteDialog.current?.contains(document.activeElement)) keepDeleteButton.current?.focus()
  }, [pendingDelete, isSaving])

  useEffect(() => {
    if (!pendingDelete && !isSaving && status === 'ready' && focusAfterDelete.current) {
      focusAfterDelete.current = false
      addWorkoutButton.current?.focus()
    }
  }, [pendingDelete, isSaving, status])

  return (
    <section id="main-view" role="tabpanel" aria-labelledby="tab-workouts" className="workout-planner">
      <div className="workout-planner-content" inert={pendingDelete || newExercise ? true : undefined} aria-hidden={pendingDelete || newExercise ? true : undefined}>
      <div className="section-heading workout-heading">
        <div>
          <p className="eyebrow">Gym-linked templates</p>
          <h2>Workouts</h2>
          <p>Build ordered workouts from shared exercises and independent set targets.</p>
        </div>
        <ActionButton ref={addWorkoutButton} type="button" onClick={() => openEditor(null)} disabled={isSaving || status !== 'ready' || gyms.length === 0}>
          <Plus size={18} aria-hidden="true" /> Add workout
        </ActionButton>
      </div>

      {status === 'loading' && <p role="status" className="state-message">Loading workouts…</p>}
      {isSaving && !pendingDelete && status !== 'loading' && <p role="status" className="form-message">{isVarying ? 'Creating exercise variation…' : duplicate ? 'Duplicating workout…' : 'Saving workout…'}</p>}
      {status === 'error' && <div role="alert" className="state-message error-state"><p>{error}</p><button type="button" className="text-button" onClick={() => void load()}>Try again</button></div>}
      {status === 'ready' && !editor && !duplicate && error && <p role="alert" className="form-message error-copy">{error}</p>}
      {status === 'ready' && gyms.length === 0 && (
        <Panel className="workout-empty">
          <Dumbbell size={30} aria-hidden="true" />
          <h3>Set up your workout foundations</h3>
          <p>Add at least one gym before creating a workout. You can create shared exercises while composing it.</p>
        </Panel>
      )}
      {status === 'ready' && templates.length === 0 && gyms.length > 0 && !editor && (
        <Panel className="workout-empty">
          <Dumbbell size={30} aria-hidden="true" />
          <h3>No workouts yet</h3>
          <p>Create a reusable workout for the equipment at your gym.</p>
        </Panel>
      )}
      {status === 'ready' && templates.length > 0 && !editor && (
        <div className="workout-list" aria-label="Workout templates">
          {templates.map((template) => (
            <article key={template.id} className="workout-card" aria-label={template.name}>
              <div><p className="exercise-meta">{gymName(template.gymId)}</p><h3>{template.name}</h3><p>{template.exercises.length} {template.exercises.length === 1 ? 'exercise' : 'exercises'} · {template.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)} sets</p></div>
              <div className="workout-card-actions">
                <button ref={(button) => { if (button) editButtons.current.set(template.id, button); else editButtons.current.delete(template.id) }} type="button" aria-label={`Edit ${template.name}`} onClick={() => openEditor(template)} disabled={isSaving}><Pencil size={16} aria-hidden="true" /> Edit</button>
                <button type="button" aria-label={`Duplicate ${template.name}`} onClick={(event) => { const trigger = event.currentTarget; panelReturnFocus.current = () => trigger.focus(); setError(''); setDuplicate({ template, gymId: template.gymId }) }} disabled={isSaving}><Copy size={16} aria-hidden="true" /> Duplicate</button>
                <button type="button" aria-label={`Delete ${template.name}`} onClick={(event) => { deleteReturnFocus.current = event.currentTarget; setError(''); setPendingDelete(template) }} disabled={isSaving}><Trash2 size={16} aria-hidden="true" /> Delete</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {duplicate && (
        <Panel className="duplicate-panel" aria-labelledby="duplicate-title">
          <h3 id="duplicate-title">Duplicate {duplicate.template.name}</h3>
          <label>Duplicate to gym<select autoFocus value={duplicate.gymId} disabled={isSaving} onChange={(event) => setDuplicate({ ...duplicate, gymId: event.target.value })}>{gyms.map((gym) => <option key={gym.id} value={gym.id}>{gym.name}</option>)}</select></label>
          {error && <p role="alert" className="form-message error-copy">{error}</p>}
          <div className="form-actions"><button type="button" className="text-button" disabled={isSaving} onClick={closePanel}>Cancel</button><ActionButton type="button" disabled={isSaving} onClick={() => void createDuplicate()}>{isSaving ? 'Duplicating…' : 'Create duplicate'}</ActionButton></div>
        </Panel>
      )}

      {editor && (
        <Panel className="workout-editor" aria-labelledby="workout-editor-title">
          <h3 id="workout-editor-title">{editor.template ? `Edit ${editor.template.name}` : 'Add a workout'}</h3>
          <form onSubmit={(event) => void save(event)}>
            <div className="workout-basics">
              <label>Workout name<input required autoFocus disabled={isSaving} value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} /></label>
              <label>Gym<select required disabled={isSaving} value={editor.gymId} onChange={(event) => setEditor({ ...editor, gymId: event.target.value })}><option value="">Choose a gym</option>{gyms.map((gym) => <option key={gym.id} value={gym.id}>{gym.name}</option>)}</select></label>
            </div>

            <div className="exercise-palette" aria-label="Add shared exercises">
              <strong>Shared exercises</strong>
              <button ref={controlRef('create-exercise')} type="button" disabled={isSaving} onClick={() => { setExerciseError(''); setNewExercise({ name: '', muscleGroup: '', equipment: '', notes: '' }) }}>Create new exercise</button>
              <label>Search shared exercises<input ref={controlRef('search')} type="search" disabled={isSaving} value={exerciseQuery} onChange={(event) => setExerciseQuery(event.target.value)} placeholder="Name, muscle, equipment, or notes" /></label>
              <div>{exercises.filter((exercise) => {
                const query = exerciseQuery.trim().toLocaleLowerCase()
                return !query || [exercise.name, exercise.muscleGroup, exercise.equipment, exercise.notes].some((value) => value.toLocaleLowerCase().includes(query))
              }).map((exercise) => <button key={exercise.id} type="button" disabled={isSaving || editor.exercises.some((item) => item.exerciseId === exercise.id)} onClick={() => addExercise(exercise.id)}>Add {exercise.name}</button>)}</div>
            </div>

            <div className="template-exercises">
              {editor.exercises.map((exercise, exerciseIndex) => {
                const name = exerciseName(exercise.exerciseId)
                const context = `${name}, exercise ${exerciseIndex + 1}`
                return (
                  <article key={exercise.id} className="template-exercise" aria-label={`${name} sets`}>
                    <div className="template-exercise-heading">
                      <div><span>Exercise {exerciseIndex + 1}</span><h4>{name}</h4></div>
                      <div className="compact-actions">
                        <button ref={controlRef(exerciseControlKey(exercise.id, 'up'))} type="button" aria-label={`Move exercise up — ${context}`} disabled={isSaving || exerciseIndex === 0} onClick={() => moveExercise(exerciseIndex, -1)}><ArrowUp size={16} aria-hidden="true" /></button>
                        <button ref={controlRef(exerciseControlKey(exercise.id, 'down'))} type="button" aria-label={`Move exercise down — ${context}`} disabled={isSaving || exerciseIndex === editor.exercises.length - 1} onClick={() => moveExercise(exerciseIndex, 1)}><ArrowDown size={16} aria-hidden="true" /></button>
                        <button type="button" aria-label={`Remove ${name} — ${context}`} disabled={isSaving} onClick={() => removeExercise(exerciseIndex)}><Trash2 size={16} aria-hidden="true" /></button>
                      </div>
                    </div>
                    <button type="button" className="variation-button" aria-label={`Duplicate for variation — ${context}`} disabled={isSaving} onClick={() => void makeVariation(exerciseIndex)}><Copy size={16} aria-hidden="true" /> Duplicate for variation</button>
                    <ol className="set-targets">
                      {exercise.sets.map((set, setIndex) => (
                        <li key={set.id}>
                          <span className="set-number">{setIndex + 1}</span>
                          <label>Set {setIndex + 1} type<select ref={controlRef(setControlKey(exercise.id, set.id, 'type'))} aria-label={`Set ${setIndex + 1} type — ${context}`} disabled={isSaving} value={set.kind} onChange={(event) => updateSet(exerciseIndex, setIndex, 'kind', event.target.value)}><option value="warm-up">Warm-up</option><option value="working">Working</option><option value="drop">Drop</option></select></label>
                          <label>Weight ({settings.weightUnit})<input aria-label={`Set ${setIndex + 1} weight (${settings.weightUnit}) — ${context}`} type="number" min="0" step="0.1" disabled={isSaving} value={Number(displayWeight(set.weight, settings.weightUnit).toFixed(1))} onChange={(event) => updateSet(exerciseIndex, setIndex, 'weight', event.target.value)} /></label>
                          <label>Reps<input aria-label={`Set ${setIndex + 1} reps — ${context}`} type="number" min="1" step="1" disabled={isSaving} value={set.reps} onChange={(event) => updateSet(exerciseIndex, setIndex, 'reps', event.target.value)} /></label>
                          <div className="compact-actions">
                            <button ref={controlRef(setControlKey(exercise.id, set.id, 'up'))} type="button" aria-label={`Move set ${setIndex + 1} up — ${context}`} disabled={isSaving || setIndex === 0} onClick={() => moveSet(exerciseIndex, setIndex, -1)}><ArrowUp size={16} aria-hidden="true" /></button>
                            <button ref={controlRef(setControlKey(exercise.id, set.id, 'down'))} type="button" aria-label={`Move set ${setIndex + 1} down — ${context}`} disabled={isSaving || setIndex === exercise.sets.length - 1} onClick={() => moveSet(exerciseIndex, setIndex, 1)}><ArrowDown size={16} aria-hidden="true" /></button>
                            <button type="button" aria-label={`Remove set ${setIndex + 1} — ${context}`} disabled={isSaving || exercise.sets.length === 1} onClick={() => removeSet(exerciseIndex, setIndex)}><Trash2 size={16} aria-hidden="true" /></button>
                          </div>
                        </li>
                      ))}
                    </ol>
                    <button ref={controlRef(exerciseControlKey(exercise.id, 'add'))} type="button" className="add-set-button" aria-label={`Add set — ${context}`} disabled={isSaving} onClick={() => addSet(exerciseIndex)}><Plus size={16} aria-hidden="true" /> Add set</button>
                  </article>
                )
              })}
            </div>
            {error && <p role="alert" className="form-message error-copy">{error}</p>}
            <div className="form-actions"><button type="button" className="text-button" disabled={isSaving} onClick={closePanel}>Cancel</button><ActionButton type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save workout'}</ActionButton></div>
          </form>
        </Panel>
      )}
      </div>

      {newExercise && (
        <div className="dialog-backdrop">
          <div ref={exerciseDialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="planner-exercise-title" className="confirm-dialog" onKeyDown={handleExerciseDialogKeyDown}>
            <h3 id="planner-exercise-title">Create a shared exercise</h3>
            <p>Save adds this exercise to your library and your current workout draft.</p>
            <form onSubmit={(event) => void saveNewExercise(event)}>
              <label>Exercise name<input autoFocus required disabled={isCreating} value={newExercise.name} onChange={(event) => setNewExercise({ ...newExercise, name: event.target.value })} /></label>
              <label>Muscle group<input disabled={isCreating} value={newExercise.muscleGroup} onChange={(event) => setNewExercise({ ...newExercise, muscleGroup: event.target.value })} /></label>
              <label>Equipment<input disabled={isCreating} value={newExercise.equipment} onChange={(event) => setNewExercise({ ...newExercise, equipment: event.target.value })} /></label>
              <label>Setup notes<textarea disabled={isCreating} value={newExercise.notes} onChange={(event) => setNewExercise({ ...newExercise, notes: event.target.value })} /></label>
              {exerciseError && <p role="alert" className="form-message error-copy">{exerciseError}</p>}
              {isCreating && <p role="status">Saving exercise…</p>}
              <div className="form-actions"><button type="button" className="text-button" disabled={isCreating} onClick={cancelNewExercise}>Cancel exercise</button><ActionButton type="submit" disabled={isCreating}>{isCreating ? 'Saving…' : 'Save exercise'}</ActionButton></div>
            </form>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="dialog-backdrop">
          <div ref={deleteDialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="delete-workout-title" className="confirm-dialog" onKeyDown={handleDeleteDialogKeyDown}>
            <h3 id="delete-workout-title">Delete {pendingDelete.name}?</h3>
            <p>This removes only this workout template. Shared exercises and other copies stay available.</p>
            {isSaving && <p role="status" className="form-message">Deleting workout…</p>}
            {error && <p role="alert" className="form-message error-copy">{error}</p>}
            <div className="form-actions"><button ref={keepDeleteButton} type="button" className="text-button" disabled={isSaving} onClick={closeDeleteDialog}>Keep workout</button><button ref={confirmDeleteButton} type="button" className="danger-confirm" disabled={isSaving} onClick={() => void deleteTemplate()}>{isSaving ? 'Deleting…' : 'Delete workout'}</button></div>
          </div>
        </div>
      )}
    </section>
  )
}
