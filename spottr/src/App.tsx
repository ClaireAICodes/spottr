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
          Spottr 💪
        </h1>
        <p className="text-slate-300 mb-8">Your premium workout tracking companion — coming soon!</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="glass-card">
            <h2 className="text-2xl font-extrabold mb-4" style={{fontFamily: 'Playfair Display, serif'}}>
              Status 🟢
            </h2>
            <ul className="space-y-2 text-slate-300 text-sm">
              <li>✅ Phase 1 — Project foundation & glassmorphism UI</li>
              <li>✅ Phase 2 — Database layer (Dexie.js + 8 tables)</li>
              <li>⏳ Phase 3 — Core CRUD components (in progress)</li>
              <li>⏳ Phase 4 — Media handling & compression</li>
              <li>⏳ Phase 5 — Workout execution flow</li>
              <li>⏳ Phase 6 — Progressive overload system</li>
            </ul>
          </div>

          <div className="glass-card">
            <h2 className="text-2xl font-extrabold mb-4" style={{fontFamily: 'Playfair Display, serif'}}>
              Tech Stack ⚡
            </h2>
            <ul className="space-y-2 text-slate-300 text-sm">
              <li>🎨 React 19 + TypeScript + Vite</li>
              <li>💎 Tailwind CSS + Glassmorphism</li>
              <li>🗄️ Dexie.js (IndexedDB)</li>
              <li>🧠 Zustand (state management)</li>
              <li>📦 JSZip (export / import backups)</li>
              <li>📅 date-fns + uuid</li>
            </ul>
          </div>
        </div>

        <p className="text-slate-500 text-xs mt-8 text-center">
          📖 <a href="?test" className="text-accent hover:underline">Run Phase 2 Database Tests</a> 
          &nbsp;&bull;&nbsp;
          <a href="/phase2-verify.html" className="text-accent hover:underline">Standalone HTML Test</a>
        </p>
      </div>
    </div>
  )
}

export default App
