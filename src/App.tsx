import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  BarChart3,
  CalendarDays,
  ChevronRight,
  CircleUserRound,
  Dumbbell,
  Home,
  Play,
  Sparkles,
} from 'lucide-react'
import { ActionButton, Panel, StatusPill } from './primitives'
import { ActiveSession } from './ActiveSession'
import { SessionHistory } from './SessionHistory'
import { SessionSummary } from './SessionSummary'
import { ExerciseLibrary } from './ExerciseLibrary'
import { GymManager } from './GymManager'
import { WorkoutPlanner } from './WorkoutPlanner'
import { createIndexedDbExerciseRepository } from './exerciseRepository'
import { createExerciseService, type ExerciseService } from './exercises'
import { createIndexedDbGymRepository } from './gymRepository'
import { createGymService, type Gym, type GymService } from './gyms'
import { createIndexedDbWorkoutRepository } from './workoutRepository'
import { createIndexedDbSessionRepository } from './sessionRepository'
import { createMemorySessionRepository, createSessionService, type CompletedWorkoutSession, type SessionService, type WorkoutSession } from './sessions'
import { withWorkoutIntegrityLock } from './workoutIntegrity'
import { createWorkoutService, type WorkoutService, type WorkoutTemplate } from './workouts'

const tabs = [
  { label: 'Home', icon: Home },
  { label: 'Train', icon: Dumbbell },
  { label: 'Plan', icon: CalendarDays },
  { label: 'History', icon: BarChart3 },
  { label: 'Profile', icon: CircleUserRound },
] as const

const compactNavQuery = '(max-width: 820px)'
const defaultGymService = createGymService(createIndexedDbGymRepository())
const defaultExerciseService = createExerciseService(createIndexedDbExerciseRepository())
const defaultWorkoutService = createWorkoutService(createIndexedDbWorkoutRepository(), {
  gymExists: async (id) => Boolean(await defaultGymService.get(id)),
})
const defaultSessionService = createSessionService(
  createIndexedDbSessionRepository(),
  defaultWorkoutService,
  defaultExerciseService,
)

export function App({
  gymService = defaultGymService,
  exerciseService = defaultExerciseService,
  workoutService = defaultWorkoutService,
  sessionService,
}: {
  gymService?: GymService
  exerciseService?: ExerciseService
  workoutService?: WorkoutService
  sessionService?: SessionService
}) {
  const [activeTab, setActiveTab] = useState(0)
  const [isManagingGyms, setIsManagingGyms] = useState(false)
  const [selectedGym, setSelectedGym] = useState<Gym | null>(null)
  const [gymStatus, setGymStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [activeSession, setActiveSession] = useState<WorkoutSession | null>(null)
  const [completedSession, setCompletedSession] = useState<CompletedWorkoutSession | null>(null)
  const [sessionTemplates, setSessionTemplates] = useState<WorkoutTemplate[]>([])
  const [isSessionOpen, setIsSessionOpen] = useState(false)
  const [sessionLoadError, setSessionLoadError] = useState('')
  const [templateLoadError, setTemplateLoadError] = useState('')
  const [templateStatus, setTemplateStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [templateReload, setTemplateReload] = useState(0)
  const selectedGymRequest = useRef(0)
  const activeSessionRequest = useRef(0)
  const [isCompactNav, setIsCompactNav] = useState(
    () => typeof window.matchMedia === 'function' && window.matchMedia(compactNavQuery).matches,
  )
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const managedGymService = useMemo(() => ({
    ...gymService,
    async remove(id: string) {
      await withWorkoutIntegrityLock(async () => {
        if ((await workoutService.list(id)).length > 0) {
          throw new Error('Delete linked workouts before deleting this gym')
        }
        await gymService.remove(id)
      })
    },
  }), [gymService, workoutService])
  const activeSessionService = useMemo(() => sessionService ?? (
    workoutService === defaultWorkoutService && exerciseService === defaultExerciseService
      ? defaultSessionService
      : createSessionService(createMemorySessionRepository(), workoutService, exerciseService)
  ), [exerciseService, sessionService, workoutService])

  useEffect(() => {
    if (!window.matchMedia) return

    const query = window.matchMedia(compactNavQuery)
    const updateOrientation = () => setIsCompactNav(query.matches)

    updateOrientation()
    query.addEventListener('change', updateOrientation)
    return () => query.removeEventListener('change', updateOrientation)
  }, [])

  function loadSelectedGym() {
    const requestId = ++selectedGymRequest.current
    setGymStatus('loading')
    gymService.getSelected().then((gym) => {
      if (requestId !== selectedGymRequest.current) return
      setSelectedGym(gym)
      setGymStatus('ready')
    }).catch(() => {
      if (requestId !== selectedGymRequest.current) return
      setSelectedGym(null)
      setGymStatus('error')
    })
  }

  useEffect(() => {
    loadSelectedGym()
    return () => { selectedGymRequest.current += 1 }
  }, [gymService])

  async function loadActiveSession() {
    const requestId = ++activeSessionRequest.current
    try {
      const session = await activeSessionService.getActive()
      if (requestId !== activeSessionRequest.current) return
      setActiveSession(session)
      setSessionLoadError('')
    } catch {
      if (requestId !== activeSessionRequest.current) return
      setSessionLoadError('Your active session could not be loaded. Your saved data has not been changed.')
    }
  }

  useEffect(() => {
    setActiveSession(null)
    setIsSessionOpen(false)
    setSessionLoadError('')
    void loadActiveSession()
    return () => { activeSessionRequest.current += 1 }
  }, [activeSessionService])

  useEffect(() => {
    let current = true
    if (!selectedGym) {
      setSessionTemplates([])
      setTemplateStatus('idle')
      return () => { current = false }
    }
    setSessionTemplates([])
    setTemplateLoadError('')
    setTemplateStatus('loading')
    workoutService.list(selectedGym.id).then((templates) => {
      if (current) {
        setSessionTemplates(templates)
        setTemplateLoadError('')
        setTemplateStatus('ready')
      }
    }).catch(() => {
      if (current) {
        setTemplateLoadError('Your saved workouts could not be loaded. Your saved data has not been changed.')
        setTemplateStatus('error')
      }
    })
    return () => { current = false }
  }, [activeTab, selectedGym, workoutService, templateReload])

  async function startSession(templateId: string) {
    const session = await activeSessionService.start(templateId, selectedGym?.name)
    activeSessionRequest.current += 1
    setActiveSession(session)
    setIsSessionOpen(true)
  }

  function completeSession(session: CompletedWorkoutSession) {
    activeSessionRequest.current += 1
    setActiveSession(null)
    setIsSessionOpen(false)
    setCompletedSession(session)
  }

  function selectTab(index: number) {
    setActiveTab(index)
    setIsManagingGyms(false)
    tabRefs.current[index]?.focus()
  }

  function handleTabKey(event: React.KeyboardEvent, index: number) {
    let next: number | undefined
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + tabs.length) % tabs.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = tabs.length - 1
    if (next !== undefined) {
      event.preventDefault()
      selectTab(next)
    }
  }

  const current = tabs[activeTab]
  const pageTitle = isManagingGyms ? 'Gyms' : current.label

  return (
    <div className="app-shell">
      <aside className="brand-rail" aria-label="Spottr identity">
        <a className="brand" href="#main" aria-label="Spottr home">
          <span className="brand-mark" aria-hidden="true"><Activity size={22} /></span>
          <span>spottr</span>
        </a>
        <p className="brand-note">Your training,<br />clearly in view.</p>
      </aside>

      <main id="main" className="main-canvas" tabIndex={-1}>
        <header className="topbar">
          <div>
            <p className="eyebrow">Monday · September 21</p>
            <h1>{pageTitle}</h1>
          </div>
          <button className="avatar-button" aria-label="Open profile"><span aria-hidden="true">P</span></button>
        </header>

        {activeTab === 0 && completedSession ? (
          <SessionSummary
            session={completedSession}
            onViewHistory={() => { setCompletedSession(null); selectTab(3) }}
            onDone={() => setCompletedSession(null)}
          />
        ) : activeTab === 0 && isSessionOpen && activeSession ? (
          <ActiveSession initialSession={activeSession} sessionService={activeSessionService} onSessionChange={setActiveSession} onComplete={completeSession} />
        ) : activeTab === 0 && isManagingGyms ? (
          <GymManager
            service={managedGymService}
            onClose={() => setIsManagingGyms(false)}
            onSelectionChange={loadSelectedGym}
          />
        ) : activeTab === 0 ? (
          <HomeFrames
            selectedGym={selectedGym}
            gymStatus={gymStatus}
            onManageGyms={() => setIsManagingGyms(true)}
            onRetry={loadSelectedGym}
            templates={sessionTemplates}
            activeSession={activeSession}
            onStart={startSession}
            onResume={() => setIsSessionOpen(true)}
            sessionLoadError={sessionLoadError}
            templateLoadError={templateLoadError}
            templateStatus={templateStatus}
            onRetrySession={() => void loadActiveSession()}
            onRetryTemplates={() => setTemplateReload((value) => value + 1)}
          />
        ) : activeTab === 1 ? (
          <ExerciseLibrary service={exerciseService} />
        ) : activeTab === 2 ? (
          <WorkoutPlanner workoutService={workoutService} gymService={gymService} exerciseService={exerciseService} />
        ) : activeTab === 3 ? (
          <SessionHistory sessionService={activeSessionService} />
        ) : (
          <QuietPlaceholder title={current.label} labelledBy={`tab-${current.label.toLowerCase()}`} />
        )}
      </main>

      <nav className="primary-nav" aria-label="Primary">
        <div role="tablist" aria-label="Spottr sections" aria-orientation={isCompactNav ? 'horizontal' : 'vertical'}>
          {tabs.map(({ label, icon: Icon }, index) => (
            <button
              key={label}
              ref={(node) => { tabRefs.current[index] = node }}
              id={`tab-${label.toLowerCase()}`}
              role="tab"
              type="button"
              aria-selected={activeTab === index}
              aria-controls="main-view"
              tabIndex={activeTab === index ? 0 : -1}
              onClick={() => selectTab(index)}
              onKeyDown={(event) => handleTabKey(event, index)}
            >
              <Icon size={21} strokeWidth={2.2} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

function HomeFrames({
  selectedGym,
  gymStatus,
  onManageGyms,
  onRetry,
  templates,
  activeSession,
  onStart,
  onResume,
  sessionLoadError,
  templateLoadError,
  templateStatus,
  onRetrySession,
  onRetryTemplates,
}: {
  selectedGym: Gym | null
  gymStatus: 'loading' | 'ready' | 'error'
  onManageGyms: () => void
  onRetry: () => void
  templates: WorkoutTemplate[]
  activeSession: WorkoutSession | null
  onStart: (templateId: string) => Promise<void>
  onResume: () => void
  sessionLoadError: string
  templateLoadError: string
  templateStatus: 'idle' | 'loading' | 'ready' | 'error'
  onRetrySession: () => void
  onRetryTemplates: () => void
}) {
  const [isChoosingWorkout, setIsChoosingWorkout] = useState(false)
  const [startError, setStartError] = useState('')

  async function start(templateId: string) {
    setStartError('')
    try {
      await onStart(templateId)
    } catch (caught) {
      setStartError(caught instanceof Error ? caught.message : 'The workout could not be started.')
    }
  }

  return (
    <div id="main-view" role="tabpanel" aria-labelledby="tab-home" className="home-grid">
      <Panel className="welcome-panel" aria-labelledby="welcome-title">
        <div className="orb" aria-hidden="true"><Sparkles size={24} /></div>
        <StatusPill>Fresh start</StatusPill>
        <h2 id="welcome-title">Ready when you are.</h2>
        {gymStatus === 'loading' ? (
          <p role="status">Loading your training place…</p>
        ) : gymStatus === 'error' ? (
          <div role="alert">
            <p>Your gym context could not be loaded.</p>
            <button type="button" className="text-button" onClick={onRetry}>Try again</button>
          </div>
        ) : selectedGym ? (
          <p>Work out at <strong>{selectedGym.name}</strong>. Future workout choices will stay scoped to this gym.</p>
        ) : (
          <p>Add a gym before starting so your future routines match the equipment around you.</p>
        )}
        <ActionButton disabled={gymStatus !== 'ready' || !selectedGym || templateStatus !== 'ready' || templates.length === 0 || Boolean(activeSession) || Boolean(sessionLoadError)} onClick={() => setIsChoosingWorkout(true)}>
          <Play size={18} fill="currentColor" aria-hidden="true" /> {selectedGym ? `Start workout at ${selectedGym.name}` : 'Choose a gym to start'}
        </ActionButton>
        {isChoosingWorkout && !activeSession && (
          <div className="workout-choices" aria-label="Choose a workout">
            {templates.map((template) => <button key={template.id} type="button" onClick={() => void start(template.id)}>Start {template.name}</button>)}
          </div>
        )}
        {startError && <p role="alert" className="form-message error-copy">{startError}</p>}
        {templateLoadError && <div role="alert" className="form-message error-copy"><p>{templateLoadError}</p><button type="button" className="text-button" onClick={onRetryTemplates}>Try again</button></div>}
        <button type="button" className="manage-gyms-button" onClick={onManageGyms}>Manage gyms</button>
        {!templateLoadError && !activeSession && selectedGym && templateStatus === 'ready' && templates.length === 0 && <small>No saved workouts for this gym yet.</small>}
      </Panel>

      <Panel className="resume-panel" aria-labelledby="resume-title">
        <div className="panel-kicker">
          <span>In progress</span>
          <span className="live-dot">Paused</span>
        </div>
        <h2 id="resume-title">Resume your session</h2>
        {sessionLoadError && <div role="alert"><p>{sessionLoadError}</p><button type="button" className="text-button" onClick={onRetrySession}>Try again</button></div>}
        {!sessionLoadError && <>
          <p className="session-name">{activeSession?.name ?? 'No session in progress'}</p>
          <dl className="session-stats">
            <div><dt>Status</dt><dd>{activeSession ? 'Saved' : 'Ready'}</dd></div>
            <div><dt>Exercises</dt><dd>{activeSession?.exercises.length ?? 0}</dd></div>
            <div><dt>Logged</dt><dd>{activeSession?.exercises.flatMap(({ sets }) => sets).filter(({ completedAt }) => completedAt).length ?? 0}</dd></div>
          </dl>
          <ActionButton disabled={!activeSession} className="dark-action" onClick={onResume}>
            {activeSession ? `Resume ${activeSession.name}` : 'Nothing to resume'} <ChevronRight size={18} aria-hidden="true" />
          </ActionButton>
          <small>{activeSession ? 'Your latest set log is stored on this device.' : 'Start a saved workout to create a session snapshot.'}</small>
        </>}
      </Panel>

      <section className="principle-strip" aria-label="Product principles">
        <span>Clear</span><span>Calm</span><span>Ready</span>
      </section>
    </div>
  )
}

function QuietPlaceholder({ title, labelledBy }: { title: string; labelledBy: string }) {
  return (
    <div id="main-view" role="tabpanel" aria-labelledby={labelledBy} className="quiet-placeholder">
      <p className="eyebrow">Shell preview</p>
      <h2>{title}</h2>
      <p>This destination is intentionally empty in Phase 1.</p>
    </div>
  )
}
