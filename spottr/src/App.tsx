import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  Activity,
  BarChart3,
  CalendarDays,
  ChevronRight,
  Dumbbell,
  Home,
  Play,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react'
import { ActionButton, Panel, StatusPill } from './primitives'
import { ActiveSession } from './ActiveSession'
import { SessionHistory } from './SessionHistory'
import { SessionSummary } from './SessionSummary'
import { ExerciseLibrary } from './ExerciseLibrary'
import { GymManager } from './GymManager'
import { WorkoutPlanner } from './WorkoutPlanner'
import { SettingsView } from './SettingsView'
import { useInstallPrompt } from './InstallPanel'
import type { ExerciseService } from './exercises'
import type { Gym, GymService } from './gyms'
import type { CompletedWorkoutSession, SessionService, WorkoutSession } from './sessions'
import type { WorkoutService, WorkoutTemplate } from './workouts'
import { DEFAULT_SETTINGS, type AppSettings, type SettingsService } from './settings'
import { composeDataset, type Dataset } from './datasetCoordinator'
import { recoveryDiagnostic } from './recoveryDiagnostic'

const tabs = [
  { label: 'Home', icon: Home },
  { label: 'Exercises', icon: Dumbbell },
  { label: 'Workouts', icon: CalendarDays },
  { label: 'History', icon: BarChart3 },
  { label: 'Settings', icon: SlidersHorizontal },
] as const

const compactNavQuery = '(max-width: 820px)'
const defaultDataset = composeDataset()

export function App({
  gymService: injectedGymService,
  exerciseService: injectedExerciseService,
  workoutService: injectedWorkoutService,
  sessionService: injectedSessionService,
  settingsService: injectedSettingsService,
}: {
  gymService?: GymService
  exerciseService?: ExerciseService
  workoutService?: WorkoutService
  sessionService?: SessionService
  settingsService?: SettingsService
}) {
  const hasInjectedServices = Boolean(injectedGymService || injectedExerciseService || injectedWorkoutService || injectedSessionService || injectedSettingsService)
  const coreDataset = useMemo(() => (
    hasInjectedServices
      ? composeDataset({ gymService: injectedGymService, exerciseService: injectedExerciseService,
          workoutService: injectedWorkoutService, sessionService: injectedSessionService,
          settingsService: injectedSettingsService })
      : defaultDataset
  ), [hasInjectedServices, injectedGymService, injectedExerciseService, injectedWorkoutService, injectedSessionService])
  // A settings-origin change must gate settings without replacing live session roots.
  const dataset = useMemo(() => injectedSettingsService
    ? coreDataset.withSettings(injectedSettingsService)
    : coreDataset, [coreDataset, injectedSettingsService])
  const recoveryState = useSyncExternalStore(dataset.subscribeRecovery, dataset.getRecoveryState)
  const [activeTab, setActiveTab] = useState(0)
  const [recoveryError, setRecoveryError] = useState('')
  const retry = () => { setRecoveryError(''); void dataset.initializeOrRecover().catch(error => setRecoveryError(String(error))) }
  useEffect(() => {
    let current = true
    void dataset.initializeOrRecover().catch(error => { if (current) setRecoveryError(String(error)) })
    return () => { current = false }
  }, [dataset])
  if (recoveryState === 'blocked' || recoveryState === 'recovering') return <main className="app-shell">
    <h1>Spottr local data recovery</h1>

    {recoveryState === 'blocked' ? <>
      <p role="alert">Recovery could not finish. Your recovery record has been kept.</p>
      <button type="button" onClick={retry}>Retry recovery</button>
      <button type="button" onClick={() => {
        void dataset.recoveryEvidence().then(recoveryDiagnostic).then(blob => {
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url; link.download = 'spottr-recovery-diagnostic.json'; link.click()
          setTimeout(() => URL.revokeObjectURL(url), 1000)
        }).catch(error => setRecoveryError(String(error)))
      }}>Download recovery evidence</button>
      <p>This diagnostic is not a verified backup. Keep your original backup file.</p>
      {recoveryError && <p>{recoveryError}</p>}
    </> : <p role="status">Recovering local data…</p>}
  </main>
  return <ReadyApp dataset={dataset} ready={recoveryState === 'ready'} activeTab={activeTab} setActiveTab={setActiveTab} />
}

function ReadyApp({ dataset, ready, activeTab, setActiveTab }: { dataset: Omit<Dataset, 'withSettings'>; ready: boolean; activeTab: number; setActiveTab: (tab: number) => void }) {
  const { gymService, exerciseService, workoutService, settingsService, sessionService: activeSessionService } = dataset
  const managedGymService = gymService
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
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [settingsStatus, setSettingsStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [settingsReload, setSettingsReload] = useState(0)
  const [settingsOrigin, setSettingsOrigin] = useState(settingsService)
  const settingsExitButton = useRef<HTMLButtonElement>(null)
  const settingsRetryButton = useRef<HTMLButtonElement>(null)
  const settingsRetryOrigin = useRef<number | null>(null)
  const mainView = useRef<HTMLElement>(null)
  const [isBackupRestoreInProgress, setIsBackupRestoreInProgress] = useState(false)
  const selectedGymRequest = useRef(0)
  const activeSessionRequest = useRef(0)
  const [isCompactNav, setIsCompactNav] = useState(
    () => typeof window.matchMedia === 'function' && window.matchMedia(compactNavQuery).matches,
  )
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const resumeButton = useRef<HTMLButtonElement>(null)
  const [restoreResumeFocus, setRestoreResumeFocus] = useState(false)
  const installPrompt = useInstallPrompt()


  useEffect(() => {
    if (!ready) return
    let current = true
    setSettingsStatus('loading')
    settingsService.get().then((loaded) => {
      if (current) {
        setSettings(loaded)
        setSettingsOrigin(settingsService)
        setSettingsStatus('ready')
      }
    }).catch(() => {
      if (current) {
        // Rejection belongs to this origin too; expose recovery without old values.
        setSettingsOrigin(settingsService)
        setSettingsStatus('error')
      }
    })
    return () => { current = false }
  }, [ready, settingsService, settingsReload])

  // Remain gated until values from this exact settings origin have loaded.
  const settingsServiceChanged = settingsOrigin !== settingsService

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
      if (!gym) void gymService.repairInvalidSelection?.().catch(() => {
        if (requestId === selectedGymRequest.current) { setGymStatus('error') }
      })
    }).catch(() => {
      if (requestId !== selectedGymRequest.current) return
      setSelectedGym(null)
      setGymStatus('error')
    })
  }


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
    if (!ready) return
    setActiveSession(null)
    setIsSessionOpen(false)
    setSessionLoadError('')
    void loadActiveSession()
    return () => { activeSessionRequest.current += 1 }
  }, [ready, activeSessionService])

  useEffect(() => {
    if (!ready) return
    loadSelectedGym()
    return () => { selectedGymRequest.current += 1 }
  }, [ready, gymService])


  useEffect(() => {
    if (!ready) return
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
  }, [ready, activeTab, selectedGym, workoutService, templateReload])

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
    settingsRetryOrigin.current = null
    setActiveTab(index)
    setIsManagingGyms(false)
    tabRefs.current[index]?.focus()
  }

  function handleBackupRestored(restoredSettings: AppSettings) {
    setSettings(restoredSettings)
    setCompletedSession(null)
    setIsSessionOpen(false)
    setSelectedGym(null)
    setActiveSession(null)
    setSessionTemplates([])
    setSessionLoadError('')
    setTemplateLoadError('')
    setTemplateStatus('idle')
    void loadSelectedGym()
    void loadActiveSession()
    setTemplateReload((value) => value + 1)
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
  const isEnteringSession = activeTab === 0 && isSessionOpen && Boolean(activeSession) && !completedSession
  const isFocusedSession = isEnteringSession && settingsStatus === 'ready'
  useEffect(() => {
    if (isEnteringSession && settingsStatus !== 'ready') settingsExitButton.current?.focus()
  }, [isEnteringSession, settingsStatus])

  useEffect(() => {
    if (settingsRetryOrigin.current !== activeTab || settingsStatus === 'loading') return
    const target = settingsStatus === 'error'
      ? (isEnteringSession ? settingsExitButton.current : settingsRetryButton.current)
      : mainView.current?.querySelector<HTMLElement>(isFocusedSession ? '#active-session-title' : 'h1')
    if (!target?.isConnected) return
    target.focus()
    if (document.activeElement === target) settingsRetryOrigin.current = null
  }, [activeTab, settingsStatus, isEnteringSession, isFocusedSession])

  function exitSession() {
    settingsRetryOrigin.current = null
    setIsSessionOpen(false)
    setRestoreResumeFocus(true)
  }
  useEffect(() => {
    if (!restoreResumeFocus || isFocusedSession) return
    const target = resumeButton.current
    if (!target?.isConnected || target.disabled) return
    target.focus()
    if (document.activeElement === target) setRestoreResumeFocus(false)
  }, [restoreResumeFocus, isFocusedSession, activeSession])
  const pageTitle = isManagingGyms ? 'Gyms' : current.label
  const settingsSensitiveView = activeTab === 2
    || activeTab === 3
    || (activeTab === 0 && Boolean(completedSession || (isSessionOpen && activeSession)))

  return (
    <div className={`app-shell${isFocusedSession ? ' focused-session-shell' : ''}`}>
      {!isFocusedSession && <aside className="brand-rail" aria-label="Spottr identity">
        <a className="brand" href="#main" aria-label="Spottr home">
          <span className="brand-mark" aria-hidden="true"><Activity size={22} /></span>
          <span>spottr</span>
        </a>
        <p className="brand-note">Your training,<br />clearly in view.</p>
      </aside>}

      <main ref={mainView} id="main" className="main-canvas" tabIndex={-1}>
        {!isFocusedSession && <header className="topbar">
          <div>
            <h1 tabIndex={-1}>{pageTitle}</h1>
          </div>

        </header>}

        {!ready ? <p role="status">Recovering local data…</p> : settingsSensitiveView && (settingsStatus === 'loading' || settingsServiceChanged) ? (
          <section id="main-view" role="tabpanel" aria-labelledby={`tab-${current.label.toLowerCase()}`}>
            <p role="status">Loading saved settings…</p>
            {isEnteringSession && <ActionButton ref={settingsExitButton} onClick={exitSession}>Exit workout</ActionButton>}
          </section>
        ) : settingsSensitiveView && settingsStatus === 'error' ? (
          <section id="main-view" role="tabpanel" aria-labelledby={`tab-${current.label.toLowerCase()}`}>
            <p role="alert" className="form-message error-copy">Your saved settings could not be loaded. Your saved data has not been changed.</p>
            {isEnteringSession && <ActionButton ref={settingsExitButton} onClick={exitSession}>Exit workout</ActionButton>}
            <ActionButton ref={settingsRetryButton} onClick={() => {
              settingsRetryOrigin.current = activeTab
              setSettingsStatus('loading')
              setSettingsReload((value) => value + 1)
            }}>Retry saved settings</ActionButton>
          </section>
        ) : activeTab === 0 && completedSession ? (
          <SessionSummary
            session={completedSession}
            sessionService={activeSessionService}
            settings={settings}
            onViewHistory={() => { setCompletedSession(null); selectTab(3) }}
            onDone={() => setCompletedSession(null)}
          />
        ) : activeTab === 0 && isSessionOpen && activeSession ? (
          <ActiveSession initialSession={activeSession} sessionService={activeSessionService} exerciseService={exerciseService} settings={settings} onSessionChange={setActiveSession} onComplete={completeSession} onExit={exitSession} />
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
            resumeButton={resumeButton}
            sessionLoadError={sessionLoadError}
            templateLoadError={templateLoadError}
            templateStatus={templateStatus}
            onRetrySession={() => void loadActiveSession()}
            onRetryTemplates={() => setTemplateReload((value) => value + 1)}
          />
        ) : activeTab === 1 ? (
          <ExerciseLibrary service={exerciseService} />
        ) : activeTab === 2 ? (
          <WorkoutPlanner workoutService={workoutService} gymService={gymService} exerciseService={exerciseService} settings={settings} />
        ) : activeTab === 3 ? (
          <SessionHistory sessionService={activeSessionService} settings={settings} />
        ) : (
          <SettingsView
            settingsService={settingsService}
            exerciseService={exerciseService}
            backupOperations={dataset}
            onSettingsChange={setSettings}
            onBackupRestored={handleBackupRestored}
            onBackupRestoreStateChange={setIsBackupRestoreInProgress}
            installPrompt={installPrompt}
          />
        )}
      </main>

      {!isFocusedSession && <nav className="primary-nav" aria-label="Primary">
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
              disabled={isBackupRestoreInProgress}
              onClick={() => selectTab(index)}
              onKeyDown={(event) => handleTabKey(event, index)}
            >
              <Icon size={21} strokeWidth={2.2} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </nav>}
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
  resumeButton,
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
  resumeButton: React.RefObject<HTMLButtonElement | null>
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
          <ActionButton ref={resumeButton} disabled={!activeSession} className="dark-action" onClick={onResume}>
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
