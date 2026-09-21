import { useEffect, useRef, useState } from 'react'
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

const tabs = [
  { label: 'Home', icon: Home },
  { label: 'Train', icon: Dumbbell },
  { label: 'Plan', icon: CalendarDays },
  { label: 'Progress', icon: BarChart3 },
  { label: 'Profile', icon: CircleUserRound },
] as const

const compactNavQuery = '(max-width: 820px)'

export function App() {
  const [activeTab, setActiveTab] = useState(0)
  const [isCompactNav, setIsCompactNav] = useState(
    () => typeof window.matchMedia === 'function' && window.matchMedia(compactNavQuery).matches,
  )
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    if (!window.matchMedia) return

    const query = window.matchMedia(compactNavQuery)
    const updateOrientation = () => setIsCompactNav(query.matches)

    updateOrientation()
    query.addEventListener('change', updateOrientation)
    return () => query.removeEventListener('change', updateOrientation)
  }, [])

  function selectTab(index: number) {
    setActiveTab(index)
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
            <h1>{current.label}</h1>
          </div>
          <button className="avatar-button" aria-label="Open profile"><span aria-hidden="true">P</span></button>
        </header>

        {activeTab === 0 ? <HomeFrames /> : <QuietPlaceholder title={current.label} labelledBy={`tab-${current.label.toLowerCase()}`} />}
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

function HomeFrames() {
  return (
    <div id="main-view" role="tabpanel" aria-labelledby="tab-home" className="home-grid">
      <Panel className="welcome-panel" aria-labelledby="welcome-title">
        <div className="orb" aria-hidden="true"><Sparkles size={24} /></div>
        <StatusPill>Fresh start</StatusPill>
        <h2 id="welcome-title">Ready when you are.</h2>
        <p>Nothing is scheduled. Start a free session when it feels right.</p>
        <ActionButton disabled aria-describedby="preview-note">
          <Play size={18} fill="currentColor" aria-hidden="true" /> Start a workout
        </ActionButton>
        <small id="preview-note">Preview only · workout behavior arrives later</small>
      </Panel>

      <Panel className="resume-panel" aria-labelledby="resume-title">
        <div className="panel-kicker">
          <span>In progress</span>
          <span className="live-dot">Paused</span>
        </div>
        <h2 id="resume-title">Resume your session</h2>
        <p className="session-name">Upper body · Free session</p>
        <dl className="session-stats">
          <div><dt>Elapsed</dt><dd>18:42</dd></div>
          <div><dt>Exercises</dt><dd>2 of 5</dd></div>
          <div><dt>Volume</dt><dd>1,240 kg</dd></div>
        </dl>
        <ActionButton disabled aria-describedby="resume-preview-note" className="dark-action">
          Resume <ChevronRight size={18} aria-hidden="true" />
        </ActionButton>
        <small id="resume-preview-note">Static resume frame · no session logic</small>
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
