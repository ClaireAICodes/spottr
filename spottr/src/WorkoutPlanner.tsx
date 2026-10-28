import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { AUTHORING_DRAFT_ID, createMemoryDraftRepository, createWorkoutDraftOwner, type WorkoutDraftOwner, type WorkoutDraftRecord } from './workoutDrafts'
import { ArrowDown, ArrowUp, Copy, Dumbbell, Pencil, Plus, Trash2 } from 'lucide-react'
import type { FormEvent } from 'react'
import type { Exercise, ExerciseDraft, ExerciseService } from './exercises'
import type { Gym, GymService } from './gyms'
import { ActionButton, Panel, revealNumericInput } from './primitives'
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
const draftId = () => `draft-${++draftSequence}-${crypto.randomUUID()}`

// Tuple encoding preserves scope even when imported IDs contain separators or overlap.
const exerciseControlKey = (exerciseId: string | undefined, action: string) => JSON.stringify(['exercise', exerciseId, action])
const setControlKey = (exerciseId: string | undefined, setId: string | undefined, action: string) => JSON.stringify(['set', exerciseId, setId, action])

export function WorkoutPlanner({
  workoutService,
  gymService,
  exerciseService,
  settings,
  draftOwner: providedDraftOwner,
  datasetGeneration = '0',
}: {
  workoutService: WorkoutService
  gymService: GymService
  exerciseService: ExerciseService
  settings: AppSettings
  draftOwner?: WorkoutDraftOwner
  datasetGeneration?: string
}) {
  const localOwner = useMemo(() => createWorkoutDraftOwner(createMemoryDraftRepository()), [])
  const draftOwner = providedDraftOwner ?? localOwner
  const snapshot = useSyncExternalStore(draftOwner.subscribe, draftOwner.getSnapshot)
  const busy = useSyncExternalStore(draftOwner.subscribe, draftOwner.getBusy)
  const libraryBusy = useSyncExternalStore(draftOwner.subscribe, draftOwner.getLibraryBusy)
  const priorLibraryBusy = useRef(libraryBusy)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const editor: EditorState | null = snapshot ? { ...snapshot.value, template: snapshot.template ?? null } : null
  const newExercise = snapshot?.nested ?? null
  const exerciseQuery = snapshot?.exerciseQuery ?? ''
  const editUnit = snapshot?.editUnit ?? settings.weightUnit
  function publish(changes: Partial<WorkoutDraftRecord>) {
    const current = draftOwner.getSnapshot()
    if (!current) return
    draftOwner.edit({ ...current, ...changes, revision: current.revision + 1, updatedAt: new Date().toISOString() })
  }
  function setEditor(next: EditorState | null) {
    if (!next) return // Closing is an explicit exact-revision discard/save, never an unmount side effect.
    if (draftOwner.getSnapshot()) publish({ value: { name: next.name, gymId: next.gymId, exercises: next.exercises } })
    else draftOwner.edit({
      schema: 1, id: AUTHORING_DRAFT_ID, editorIntentId: crypto.randomUUID(), templateId: next.template?.id ?? crypto.randomUUID(),
      baseUpdatedAt: next.template?.updatedAt ?? null, template: next.template, revision: 1,
      datasetGeneration, updatedAt: new Date().toISOString(), value: { name: next.name, gymId: next.gymId, exercises: next.exercises },
      numericBuffers: {}, nested: null, editUnit: settings.weightUnit, returnContext: { kind: 'workouts' }, focusKey: 'name', scrollY: window.scrollY,
    })
  }
  function setNewExercise(nested: ExerciseDraft | null) { publish({ nested }) }
    function setExerciseQuery(exerciseQuery: string) { publish({ exerciseQuery }) }

    // A service read may queue behind the held Save. The captured template is
    // still a valid reopen choice; its captured version remains conflict-fenced.
    const [templates, setTemplates] = useState<WorkoutTemplate[]>(() => snapshot?.template ? [snapshot.template] : [])
    const [gyms, setGyms] = useState<Gym[]>([])
    const [exercises, setExercises] = useState<Exercise[]>([])
    const [duplicate, setDuplicate] = useState<DuplicateState | null>(null)
    const [pendingDelete, setPendingDelete] = useState<WorkoutTemplate | null>(null)
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
    const [error, setError] = useState('')
    const [saving, setIsSaving] = useState(false)
    const isSaving = saving || busy
    const isVarying = false
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
    const editorControlRefs = useRef(new Map<string, (node: HTMLElement | null) => void>())
    const pendingEditorFocus = useRef<string | null>(null)
    const [savedFocusId, setSavedFocusId] = useState<string | null>(null)
    const [exerciseError, setExerciseError] = useState('')
    const isCreating = busy
    const exerciseDialog = useRef<HTMLDivElement>(null)

    function controlRef(key: string) {
    // Stable refs avoid a moved row's detach deleting another row's new binding.
    if (!editorControlRefs.current.has(key)) {
      editorControlRefs.current.set(key, (node: HTMLElement | null) => {
        if (node) { node.dataset.draftFocus = key; editorControls.current.set(key, node) }
        else editorControls.current.delete(key)
      })
    }
    return editorControlRefs.current.get(key)!
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

  const [pendingDiscard, setPendingDiscard] = useState<{ draft: WorkoutDraftRecord; epoch: number } | null>(null)
  const [discarding, setDiscarding] = useState(false)
  const discardInFlight = useRef(false)
  const discardDialog = useRef<HTMLDivElement>(null)
  const keepEditingButton = useRef<HTMLButtonElement>(null)
  const discardTrigger = useRef<HTMLButtonElement | null>(null)
  const [saveConfirmation, setSaveConfirmation] = useState('')

  useEffect(() => {
    // Save owns exact-draft cleanup, including when this view was remounted.
    // A replacement/revised draft must keep its own confirmation and edits.
    if (!pendingDiscard || snapshot || busy || discardInFlight.current || draftOwner.getIntentEpoch() !== pendingDiscard.epoch) return
    const committed = draftOwner.getCommittedWorkout()
    if (!committed) return
    setPendingDiscard(null)
    setError('')
    setSaveConfirmation('Workout saved.')
    setSavedFocusId(committed.id)
  }, [pendingDiscard, snapshot, busy, draftOwner])

  function keepEditing() {
    if (discardInFlight.current) return
    setPendingDiscard(null)
    queueMicrotask(() => { if (discardTrigger.current?.isConnected) discardTrigger.current.focus() })
  }

  useEffect(() => {
    if (pendingDiscard) {
      if (discarding) discardDialog.current?.focus()
      else keepEditingButton.current?.focus()
    }
  }, [pendingDiscard, discarding])

  async function closePanel() {
    setDuplicate(null)
    setError('')
    panelReturnFocus.current()
  }

  async function discardDraft() {
    if (!pendingDiscard || discardInFlight.current || draftOwner.getLibraryBusy()) return
    const { draft, epoch } = pendingDiscard
    const matches = () => {
      const current = draftOwner.getSnapshot()
      return draftOwner.getIntentEpoch() === epoch && current?.id === draft.id && current.revision === draft.revision && current.editorIntentId === draft.editorIntentId
    }
    discardInFlight.current = true
    setDiscarding(true)
    setError('')
    try {
      if (!matches()) throw new Error('changed')
      const result = await draftOwner.flushDraft(draft.id)
      if (result.status !== 'saved' || !matches() || !(await draftOwner.removeCommitted(draft.id, draft.revision, draft.editorIntentId))) throw new Error('changed')
      if (!mounted.current) return
      if (draftOwner.getIntentEpoch() !== epoch) throw new Error('changed')
      setPendingDiscard(null)
      if (!draftOwner.getSnapshot()) queueMicrotask(() => { if (mounted.current && draftOwner.getIntentEpoch() === epoch) panelReturnFocus.current() })
      else setError('The draft changed while discarding. Your newer changes are still here.')
    } catch {
      if (mounted.current) setError('Could not discard the exact draft revision. Your changes are still here. Keep editing, then Cancel again to review the current draft.')
    } finally {
      discardInFlight.current = false
      if (mounted.current) setDiscarding(false)
    }
  }

  async function load(owns = () => mounted.current, preserveOperationError = false) {
    setStatus('loading')
    try {
      const [nextTemplates, nextGyms, nextExercises] = await Promise.all([
        workoutService.list(),
        gymService.list(),
        exerciseService.search(),
      ])
      if (!owns()) return
      setTemplates(nextTemplates)
      setGyms(nextGyms)
      setExercises(nextExercises)
      if (!preserveOperationError) setError('')
      setStatus('ready')
    } catch {
      if (!owns()) return
      const committed = draftOwner.getCommittedWorkout()
      const libraryIds = draftOwner.getLibraryOperations().flatMap(operation => operation.created ? [operation.created.id] : [])
      setError(committed
        ? `Workout saved as ${committed.id}. Refresh failed; Try again refreshes without saving again.`
        : libraryIds.length
          ? `Library exercise saved as ${libraryIds.join(', ')}. Refresh failed; Try again refreshes without creating again.`
          : 'Your workouts could not be loaded. Your existing data has not been changed.')
      setStatus('error')
    }
  }

  useEffect(() => { void load() }, [workoutService, gymService, exerciseService])
  useEffect(() => {
    if (priorLibraryBusy.current && !libraryBusy) {
      const epoch = draftOwner.getIntentEpoch()
      void load(() => mounted.current && draftOwner.getIntentEpoch() === epoch, true)
    }
    priorLibraryBusy.current = libraryBusy
  }, [libraryBusy])

  function openEditor(template: WorkoutTemplate | null) {
    setSaveConfirmation('')
    panelReturnFocus.current = () => {
      if (template) editButtons.current.get(template.id)?.focus()
      else addWorkoutButton.current?.focus()
    }
    if (draftOwner.getSnapshot()) return
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
    if (saveInFlight.current || draftOwner.getBusy()) return
    pendingEditorFocus.current = 'create-exercise'
    setNewExercise(null)
    setExerciseError('')
  }

  async function saveNewExercise(event: FormEvent) {
    event.preventDefault()
    if (!newExercise || !editor || draftOwner.getBusy()) return
    const epoch = draftOwner.getIntentEpoch()
    setExerciseError('')
    try {
      const content = structuredClone(newExercise)
      const result = await draftOwner.createLibraryEntry(JSON.stringify(['nested', content]), operationId => exerciseService.create(content, operationId), (current, created) => ({
        value: { ...current.value, exercises: [...current.value.exercises, { id: draftId(), exerciseId: created.id, sets: [{ id: draftId(), kind: 'working', weight: 0, reps: 8 }] }] },
        nested: null, exerciseQuery: '',
      }), exerciseService.get)
      if (result && mounted.current && draftOwner.getIntentEpoch() === epoch && draftOwner.getSnapshot()?.revision === result.revision) {
        setExercises(items => [...items, result.created].sort((a, b) => a.name.localeCompare(b.name)))
        const entry = draftOwner.getSnapshot()!.value.exercises.at(-1)!
        pendingEditorFocus.current = setControlKey(entry.id, entry.sets[0].id, 'type')
      }
    } catch (caught) {
      if (mounted.current && draftOwner.getIntentEpoch() === epoch) setExerciseError(caught instanceof Error ? caught.message : 'The exercise could not be saved.')
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
      if (field !== 'kind') publish({ numericBuffers: { ...draftOwner.getSnapshot()!.numericBuffers, [setControlKey(exercise.id, exercise.sets[setIndex].id, field)]: value } })
      const sets = [...exercise.sets]
      sets[setIndex] = {
        ...sets[setIndex],
        [field]: field === 'kind'
          ? value as SetKind
          : field === 'weight'
            ? storedWeight(Number(value), editUnit)
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
    if (!editor || draftOwner.getBusy()) return
    const entry = editor.exercises[exerciseIndex]
    const epoch = draftOwner.getIntentEpoch()
    setError('')
    try {
      const result = await draftOwner.createLibraryEntry(JSON.stringify(['variation', entry.id, entry.exerciseId]), operationId => exerciseService.duplicate(entry.exerciseId, undefined, operationId), (current, created) => ({
        value: { ...current.value, exercises: current.value.exercises.map(item => item.id === entry.id ? { ...item, exerciseId: created.id } : item) },
      }), exerciseService.get)
      if (result && mounted.current && draftOwner.getIntentEpoch() === epoch && draftOwner.getSnapshot()?.revision === result.revision) {
        setExercises(items => [...items, result.created].sort((a, b) => a.name.localeCompare(b.name)))
        pendingEditorFocus.current = setControlKey(entry.id, entry.sets[0].id, 'type')
      }
    } catch (caught) {
      if (mounted.current && draftOwner.getIntentEpoch() === epoch) setError(caught instanceof Error ? caught.message : 'The variation could not be created.')
    }
  }

  async function save(event: FormEvent) {
      event.preventDefault()
      if (!editor || saveInFlight.current || draftOwner.getBusy()) return
      const current = draftOwner.getSnapshot()
      for (const exercise of editor.exercises) {
        for (const set of exercise.sets) {
          const key = setControlKey(exercise.id, set.id, 'weight')
          const buffer = current?.numericBuffers[key]
          if (buffer !== undefined && !buffer.trim()) {
            setError('Enter a weight of zero or more.')
            editorControls.current.get(key)?.focus()
            return
          }
        }
      }
      const epoch = draftOwner.getIntentEpoch()
      const owns = () => mounted.current && draftOwner.getIntentEpoch() === epoch
      saveInFlight.current = true
      setIsSaving(true)
      setError('')
      try {
        const saved = await draftOwner.saveWorkout(workoutService)
        if (!owns()) return
        setSavedFocusId(saved.id)
        await load(owns)
      } catch (caught) {
        if (owns()) setError(caught instanceof Error ? caught.message : 'The workout could not be saved.')
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
    <section id="main-view" role="tabpanel" aria-labelledby="tab-workouts" className="workout-planner" onFocusCapture={revealNumericInput} onInputCapture={revealNumericInput}>
      <div className="workout-planner-content" inert={pendingDelete || newExercise || pendingDiscard ? true : undefined} aria-hidden={pendingDelete || newExercise || pendingDiscard ? true : undefined}>
      <div className="section-heading workout-heading">
        <div>
          <p className="eyebrow">Gym-linked templates</p>
          <h2>Workouts</h2>
          <p>Build ordered workouts from shared exercises and independent set targets.</p>
        </div>
        <ActionButton ref={addWorkoutButton} type="button" onClick={() => openEditor(null)} disabled={draftOwner.getLibraryBusy() || status !== 'ready' || gyms.length === 0}>
          <Plus size={18} aria-hidden="true" /> Add workout
        </ActionButton>
      </div>

      {draftOwner.getLibraryOperations().filter(operation => operation.status === 'committed' || operation.status === 'unknown').map(operation => (
        <p role="status" className="form-message" key={operation.operationId}>
          {operation.created
            ? `Library exercise saved as ${operation.created.id}. It has not been applied to the changed draft; only the original operation can retry reconciliation.`
            : `Library operation ${operation.operationId} has an unresolved outcome. Creation will not be replayed.`}
        </p>
      ))}
      {saveConfirmation && !editor && <p role="status" className="form-message">{saveConfirmation}</p>}
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
      {(status === 'ready' || status === 'loading') && templates.length > 0 && !editor && (
        <div className="workout-list" aria-label="Workout templates">
          {templates.map((template) => (
            <article key={template.id} className="workout-card" aria-label={template.name}>
              <div><p className="exercise-meta">{gymName(template.gymId)}</p><h3>{template.name}</h3><p>{template.exercises.length} {template.exercises.length === 1 ? 'exercise' : 'exercises'} · {template.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)} sets</p></div>
              <div className="workout-card-actions">
                <button ref={(button) => { if (button) editButtons.current.set(template.id, button); else editButtons.current.delete(template.id) }} type="button" aria-label={`Edit ${template.name}`} onClick={() => openEditor(template)} disabled={draftOwner.getLibraryBusy()}><Pencil size={16} aria-hidden="true" /> Edit</button>
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
          {status === 'ready' && error && <p role="alert" className="form-message error-copy">{error}</p>}
          <div className="form-actions"><button type="button" className="text-button" disabled={isSaving} onClick={closePanel}>Cancel</button><ActionButton type="button" disabled={isSaving} onClick={() => void createDuplicate()}>{isSaving ? 'Duplicating…' : 'Create duplicate'}</ActionButton></div>
        </Panel>
      )}

      {editor && (
        <Panel className="workout-editor" aria-labelledby="workout-editor-title">
          <h3 id="workout-editor-title">{editor.template ? `Edit ${editor.template.name}` : 'Add a workout'}</h3>
          {draftOwner.getRecoveryMessage() && <p role="status">{draftOwner.getRecoveryMessage()}</p>}
          <form onSubmit={(event) => void save(event)}>
            <div className="workout-basics">
              <label>Workout name<input ref={controlRef('name')} required autoFocus disabled={isSaving} value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} /></label>
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
                          <label>Weight ({editUnit})<input ref={controlRef(setControlKey(exercise.id, set.id, 'weight'))} aria-label={`Set ${setIndex + 1} weight (${editUnit}) — ${context}`} type="number" min="0" step="0.1" disabled={isSaving} value={snapshot?.numericBuffers[setControlKey(exercise.id, set.id, 'weight')] ?? Number(displayWeight(set.weight, editUnit).toFixed(1))} onChange={(event) => updateSet(exerciseIndex, setIndex, 'weight', event.target.value)} /></label>
                                                    <label>Reps<input ref={controlRef(setControlKey(exercise.id, set.id, 'reps'))} aria-label={`Set ${setIndex + 1} reps — ${context}`} type="number" min="1" step="1" disabled={isSaving} value={snapshot?.numericBuffers[setControlKey(exercise.id, set.id, 'reps')] ?? set.reps} onChange={(event) => updateSet(exerciseIndex, setIndex, 'reps', event.target.value)} /></label>
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
            {status === 'ready' && error && <p role="alert" className="form-message error-copy">{error}</p>}
            <div className="form-actions"><button type="button" className="text-button" disabled={draftOwner.getLibraryBusy()} onClick={(event) => { const draft = draftOwner.getSnapshot(); if (!draft) return; discardTrigger.current = event.currentTarget; setError(''); setPendingDiscard({ draft: structuredClone(draft), epoch: draftOwner.getIntentEpoch() }) }}>Cancel</button><ActionButton type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save workout'}</ActionButton></div>
          </form>
        </Panel>
      )}
      </div>

      {pendingDiscard && (
        <div className="dialog-backdrop">
          <div ref={discardDialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="discard-draft-title" className="confirm-dialog" onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); keepEditing() }
            if (event.key === 'Tab') {
              event.preventDefault()
              const controls = Array.from(discardDialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
              if (!controls.length) { discardDialog.current?.focus(); return }
              const index = controls.indexOf(document.activeElement as HTMLButtonElement)
              controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus()
            }
          }}>
            <h3 id="discard-draft-title">Discard draft?</h3>
            <p>This removes only this draft. Saved workouts and already committed changes stay saved.</p>
            {error && <p role="alert" className="form-message error-copy">{error}</p>}
            {discarding && <p role="status">Discarding draft…</p>}
            <div className="form-actions"><button ref={keepEditingButton} type="button" className="text-button" disabled={discarding} onClick={keepEditing}>Keep editing</button><button type="button" className="danger-confirm" disabled={discarding || libraryBusy} onClick={() => void discardDraft()}>Discard</button></div>
          </div>
        </div>
      )}

      {newExercise && (
        <div className="dialog-backdrop">
          <div ref={exerciseDialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="planner-exercise-title" className="confirm-dialog" onKeyDown={handleExerciseDialogKeyDown}>
            <h3 id="planner-exercise-title">Create a shared exercise</h3>
            <p>Save adds this exercise to your library and your current workout draft.</p>
            {draftOwner.getRecoveryMessage() && <p role="status">{draftOwner.getRecoveryMessage()}</p>}
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
            {status === 'ready' && error && <p role="alert" className="form-message error-copy">{error}</p>}
            <div className="form-actions"><button ref={keepDeleteButton} type="button" className="text-button" disabled={isSaving} onClick={closeDeleteDialog}>Keep workout</button><button ref={confirmDeleteButton} type="button" className="danger-confirm" disabled={isSaving} onClick={() => void deleteTemplate()}>{isSaving ? 'Deleting…' : 'Delete workout'}</button></div>
          </div>
        </div>
      )}
    </section>
  )
}
