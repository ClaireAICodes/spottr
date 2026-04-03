# Spottr

**Spottr** is a premium Progressive Web App (PWA) for gym workout planning, execution, and tracking with a focus on progressive overload and a stunning glassmorphism UI. Built for the modern fitness enthusiast who values both function and form.

## ✨ Features

- **Dashboard**: Quick overview with last workout summary, recent PRs celebration, and one-tap workout start
- **Exercise Library**: Searchable catalog with media upload (images/videos) and intelligent compression
- **Workout Builder**: Flexible template creation with per-set targets, exercise reordering, and gym selection
- **Workout Execution**: Multi-screen flow with progressive overload cues, PR detection, confetti celebrations, and rest timers
- **History**: Calendar view with detailed session logs and set performance tracking
- **Gym Management**: CRUD with optional geolocation (browser API + Google Maps links)
- **Data Portability**: Full export/import via ZIP including all data and media blobs
- **Offline-First**: Works completely offline after first load; install as PWA on mobile/desktop

## 🎨 Design

Light-mode glassmorphism aesthetic:
- Navy gradient background (#0f172a → #1e293b) with floating blur blobs
- Translucent glass panels with soft borders and shadows
- Playfair Display (700/800) for headings, Inter for body text
- Sky blue (#38bdf8) accent with glow effects
- Smooth animations and hover effects

## 🛠 Tech Stack

- **Framework**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + custom glassmorphism CSS
- **Database**: Dexie.js (IndexedDB wrapper) with local blob storage
- **State Management**: Zustand
- **PWA**: vite-plugin-pwa with service worker caching
- **Export/Import**: JSZip for backup archives
- **Utilities**: date-fns, uuid
- **Deployment**: GitHub Pages (static build)

## 📦 Project Structure

```
src/
├── components/
│   ├── common/        # GlassCard, GlassButton, GradientText
│   ├── workout/       # WorkoutList, WorkoutExecutor, ExerciseMedia, SetEntry, RestTimer
│   ├── exercise/      # ExerciseLibrary, ExerciseEditor, MediaUploader
│   ├── gym/           # GymList, GymEditor
│   └── layout/        # Header, Navigation
├── db/                # Dexie schema and React hooks
├── hooks/             # useWorkoutSession, useMediaCompression
├── store/             # Zustand global store
├── utils/             # mediaCompress, exportImport, progressiveOverload
├── types/             # TypeScript interfaces
├── styles/            # glassmorphism.css
├── App.tsx            # Main app component
└── main.tsx           # Entry point
```

## 🚀 Development

### Prerequisites
- Node.js 18+
- npm

### Setup
```bash
cd spottr
npm install
```

### Development Server
```bash
npm run dev
```
Open http://localhost:5173 in your browser.

### Build
```bash
npm run build
```
Production output goes to `dist/`.

### Preview Production Build
```bash
npm run preview
```

## 📋 Implementation Phases

This project follows a structured 10-phase implementation plan:

- **Phase 1**: Project Foundation & Setup ✅ (Completed)
- **Phase 2**: Database Layer (Dexie schema & hooks)
- **Phase 3**: Core CRUD Components (Gyms, Exercises, Workouts)
- **Phase 4**: Media Handling & Compression
- **Phase 5**: Workout Execution Flow
- **Phase 6**: Progressive Overload System
- **Phase 7**: Export/Import Feature
- **Phase 8**: PWA Configuration
- **Phase 9**: Testing, Polish & Accessibility
- **Phase 10**: GitHub Pages Deployment
- **Phase 11**: Documentation & Handoff

See [`implementation-plan.md`](./implementation-plan.md) for detailed phase breakdowns and timelines.

## 📂 Related Documentation

- [`features-screens.md`](./features-screens.md) - Complete UX/UI specification and screen flows
- [`implementation-plan.md`](./implementation-plan.md) - Phase-by-phase technical implementation guide
- [`gym-workout-app-requirements.md`](./gym-workout-app-requirements.md) - Full requirements document (data model, MVP scope)
- [`requirements-design.md`](./requirements-design.md) - Initial design constraints and decisions

## 🔒 Data Privacy

All data is stored locally in your browser's IndexedDB. No data is sent to external servers. Your workout history, exercises, and media stay on your device.

## 📱 PWA Installation

Once deployed, visit the app in a supported browser (Chrome, Safari, Edge) and look for the "Install" prompt in the address bar, or use the in-app install button (when implemented). The app will install to your home screen and run in standalone mode.

## 🤝 Contributing

This is a personal project built for Master Phil. Not open for external contributions at this time.

## 📄 License

Proprietary - All rights reserved.

---

*Built with love for Master Phil 💖*
