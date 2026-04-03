# Spottr

**Spottr** is a premium Progressive Web App (PWA) for gym workout planning, execution, and tracking with a focus on progressive overload and a stunning glassmorphism UI.

## 📚 Documentation

- [`implementation-plan.md`](./implementation-plan.md) — Complete phase-by-phase technical implementation guide (React + Vite + TypeScript)
- [`features-screens.md`](./features-screens.md) — Detailed UX/UI specification and screen flows
- [`gym-workout-app-requirements.md`](./gym-workout-app-requirements.md) — Full requirements (data model, MVP scope, technical stack)
- [`requirements-design.md`](./requirements-design.md) — Initial design constraints and decisions

## 🏗 Current Status

**Phase 1: Project Foundation & Setup — ✅ COMPLETED**

The project has been successfully scaffolded with:
- Vite + React 18 + TypeScript
- Tailwind CSS with custom glassmorphism theme
- Dexie.js for IndexedDB persistence
- Zustand for state management
- Complete component structure
- Build verified: `npm run build` succeeds
- Dev server working: `npm run dev`

**Live repository:** https://github.com/ClaireAICodes/spottr

## 🛠 Actual Tech Stack (Implementation)

- **Framework**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + custom glassmorphism CSS
- **Database**: Dexie.js (IndexedDB wrapper)
- **State**: Zustand
- **PWA**: vite-plugin-pwa
- **Export/Import**: JSZip
- **Utilities**: date-fns, uuid

*Note: The original specification mentioned Flutter, but the actual implementation uses React + Vite for better PWA support and faster iteration.*

## 🚀 Getting Started (for developers)

```bash
# Navigate to the project
cd spottr/spottr

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

See the [project README](./spottr/README.md) for more details.

## 📋 Implementation Phases

1. ✅ Project Foundation & Setup
2. ⏳ Database Layer (in progress)
3. ⏳ Core CRUD Components
4. ⏳ Media Handling & Compression
5. ⏳ Workout Execution Flow
6. ⏳ Progressive Overload System
7. ⏳ Export/Import Feature
8. ⏳ PWA Configuration
9. ⏳ Testing, Polish & Accessibility
10. ⏳ GitHub Pages Deployment
11. ⏳ Documentation & Handoff

## 💖 Philosophy

Spottr combines powerful functionality with a premium, minimalist aesthetic. Every feature is designed to help you focus on what matters—your workout—while the app handles the rest.

---

*Built with love for Master Phil 💖*
