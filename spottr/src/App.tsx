import './index.css'

function App() {
  return (
    <div className="relative min-h-screen">
      {/* Floating background blobs */}
      <div className="blob blob-1"></div>
      <div className="blob blob-2"></div>
      <div className="blob blob-3"></div>

      <div className="relative z-10 p-8 max-w-4xl mx-auto">
        <h1 className="gradient-text text-5xl font-extrabold mb-2" style={{fontFamily: 'Playfair Display, serif'}}>
          Spottr Setup Test
        </h1>
        <p className="text-slate-300 mb-8">Phase 1: Glassmorphism UI verification</p>

        <div className="glass-card max-w-md mb-6">
          <h2 className="text-2xl font-extrabold mb-4" style={{fontFamily: 'Playfair Display, serif'}}>
            Glass Card
          </h2>
          <p className="text-slate-300 mb-4">
            This card has a frosted glass effect with backdrop blur and subtle border.
          </p>
          <button className="glass-button">
            Get Started
          </button>
        </div>

        <div className="glass-card max-w-md">
          <h3 className="text-xl font-semibold mb-3">Test Input</h3>
          <input
            type="text"
            className="glass-input w-full"
            placeholder="Type something..."
          />
        </div>

        <div className="mt-8 flex gap-4">
          <div className="glass-card p-4 text-center">
            <div className="text-3xl font-bold text-accent">12</div>
            <div className="text-sm text-slate-300">Workouts</div>
          </div>
          <div className="glass-card p-4 text-center">
            <div className="text-3xl font-bold text-accent">5</div>
            <div className="text-sm text-slate-300">Streak</div>
          </div>
          <div className="glass-card p-4 text-center">
            <div className="text-3xl font-bold text-accent">35</div>
            <div className="text-sm text-slate-300">PRs</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
