# Spottr W39 — Local-first training foundation

A fresh, local-only Spottr delivery foundation covering Phase 1A–1D, gym profiles 2A–2D, the shared exercise library 3A–3D, ordered exercise media 4A–4D, workout templates/integrity 5A–6D, active-session execution 7A–7D, and completion/history 9A–9D:

- Vite + React + TypeScript scaffold and Vitest/Playwright harness
- original design tokens and reusable panel/action/status primitives
- accessible five-tab shell with roving keyboard focus
- Home start and resume controls backed by one persisted active session
- IndexedDB-backed gym create, edit, select, reload, and confirmed delete
- optional current-location capture with a manual-address fallback
- selected-gym context exposed at the future workout-entry seam
- IndexedDB-backed shared exercise create, search, edit, and reload
- ordered local exercise images/videos with image compression and bounded storage
- gym-linked workout templates with searchable shared exercises and independent warm-up, working, and drop-set targets
- same-gym/cross-gym workout duplication plus explicit duplicate-for-variation exercise identity
- confirmed template deletion and protection against deleting gyms that still own templates
- global shared-exercise edits propagate through references while variations, copies, and removed templates stay isolated
- independent workout snapshots with fast set logging, reload, resume, and template non-mutation
- partial-workout completion summaries and durable newest-first set-by-set history
- offline reload support for previously loaded local app resources and exercise data
- responsive layouts verified at 390×844, the populated workout editor at 393×844, and 1440×900

## Run

```text
npm install
npm test
npm run build
npm run screenshots
```

## Keyboard model

Focus a primary tab, then use Left/Right or Up/Down to move. Home/End jump to the first/last tab. Selection and focus move together, and the active destination is exposed through `aria-selected`.

## Scope boundary

This checkpoint includes the bounded active-session start, fast-log, reload, resume, partial completion, summary, and durable history slices. Adding or removing exercises/sets during execution, substitutions, free-form sessions, timers, and richer execution controls remain deferred to the original flexible-execution envelope. Release, push, and deployment are excluded.

## Evidence

- `evidence/screenshots/spottr-shell-390x844.png`
- `evidence/screenshots/spottr-shell-1440x900.png`
- `evidence/screenshots/spottr-gyms-390x844.png`
- `evidence/screenshots/spottr-exercises-390x844.png`
- `evidence/gym-verification.md`
- `evidence/exercise-library-verification.md`
- `evidence/exercise-media-verification.md`
- `evidence/workout-template-verification.md`
- `evidence/screenshots/spottr-workouts-393x844.png`
- `evidence/screenshots/spottr-active-session-390x844.png`
- `evidence/screenshots/spottr-completion-history-390x844.png`
- `evidence/active-session-verification.md`
- `evidence/no-w38-reuse-proof.md`
- `evidence/verification.md`
