import { useEffect, useRef, useState } from 'react'
import type { Exercise, ExerciseMedia, ExerciseService } from './exercises'

// Read the shared library; reference viewing never changes session or template data.
export function ExerciseReference({ exerciseId, name, service, onResolved, occurrenceId }: { exerciseId: string; name: string; service: ExerciseService; onResolved?: (id: string, exercise: Exercise | null) => void; occurrenceId?: string }) {
  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [open, setOpen] = useState(false)
  const toggle = useRef<HTMLButtonElement>(null)
  const reference = useRef<HTMLDivElement>(null)
  const retry = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef<string | null>(null)
  const regionId = `exercise-reference-${occurrenceId ?? exerciseId}`

  useEffect(() => {
    if (restoreFocus.current !== exerciseId || status === 'loading') return
    const target = status === 'error' ? retry.current : toggle.current ?? reference.current
    if (!target?.isConnected) return
    target.focus()
    if (document.activeElement === target) restoreFocus.current = null
  }, [exerciseId, status])

  useEffect(() => {
    let current = true

    setStatus('loading')
    service.get(exerciseId).then((loaded) => {
      if (!current) return
      setExercise(loaded)
      onResolved?.(exerciseId, loaded)
      setStatus('ready')
    }).catch(() => { if (current) setStatus('error') })
    return () => { current = false }
  }, [exerciseId, service, attempt, onResolved])

  function close() {
    setOpen(false)
    toggle.current?.focus()
  }

  if (status === 'loading') return <p role="status">Loading reference for {name}…</p>
  if (status === 'error') return <div><p role="alert">Reference for {name} could not be loaded. Your workout has not been changed.</p><button ref={retry} type="button" className="text-button" onClick={() => { restoreFocus.current = exerciseId; setAttempt((value) => value + 1) }}>Retry reference for {name}</button></div>
  if (!exercise) return <div ref={reference} role="group" aria-label={`Reference for ${name}`} tabIndex={-1}><p>Exercise unavailable. Reference for {name} is no longer in the library. Saved session data is unchanged; you can keep logging sets.</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Retry reference for {name}</button></div>

  return (
    <div ref={reference} role="group" aria-label={`Reference for ${name}`} tabIndex={-1} className="exercise-reference">
      {exercise.notes && <p className="exercise-reference-notes">{exercise.notes}</p>}
      {exercise.media.length > 0 && <>
        <button ref={toggle} type="button" className="text-button" aria-expanded={open} aria-controls={regionId} onClick={() => open ? close() : setOpen(true)}>
          {open ? 'Hide' : 'Show'} reference media for {name}
        </button>
        {open && <div id={regionId} role="region" aria-label={`Reference media for ${name}`} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() } }}>
          {exercise.media.map((media) => <ReferenceMedia key={media.id} media={media} name={name} />)}
        </div>}
      </>}
    </div>
  )
}

function ReferenceMedia({ media, name }: { media: ExerciseMedia; name: string }) {
  const [source, setSource] = useState('')
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const figure = useRef<HTMLElement>(null)
  const retry = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)
  function restore(target: HTMLElement | null) {
    if (!restoreFocus.current || !target?.isConnected) return
    target.focus()
    if (document.activeElement === target) restoreFocus.current = false
  }
  useEffect(() => { if (failed) restore(retry.current) }, [failed])
  useEffect(() => {
    const url = URL.createObjectURL(media.blob)
    setSource(url)
    setFailed(false)
    return () => URL.revokeObjectURL(url)
  }, [media.blob, attempt])
  return <figure ref={figure} tabIndex={-1} aria-label={`${name}: ${media.name} reference`}>
    {failed ? <div><p role="alert">{media.name} could not be displayed. The stored attachment has not been changed.</p><button ref={retry} type="button" className="text-button" onClick={() => { restoreFocus.current = true; setAttempt((value) => value + 1) }}>Retry {media.name}</button></div> : source && (media.kind === 'image'
      ? <img src={source} alt={`${name}: ${media.name}`} onLoad={() => restore(figure.current)} onError={() => setFailed(true)} />
      : <video src={source} aria-label={`${name}: ${media.name}`} controls playsInline preload="auto" onLoadedData={(event) => restore(event.currentTarget)} onError={() => setFailed(true)} />)}
    <figcaption>{media.name}</figcaption>
  </figure>
}
