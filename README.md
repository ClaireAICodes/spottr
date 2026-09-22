# Spottr W39 — Local-first training foundation

A fresh, local-only Spottr delivery foundation covering Phase 1A–1D, gym profiles 2A–2D, the shared exercise library 3A–3D, and ordered exercise media 4A–4D:

- Vite + React + TypeScript scaffold and Vitest/Playwright harness
- original design tokens and reusable panel/action/status primitives
- accessible five-tab shell with roving keyboard focus
- presentation-only Home empty and resume frames
- IndexedDB-backed gym create, edit, select, reload, and confirmed delete
- optional current-location capture with a manual-address fallback
- selected-gym context exposed at the future workout-entry seam
- IndexedDB-backed shared exercise create, search, edit, and reload
- ordered local exercise images/videos with image compression and bounded storage
- offline reload support for previously loaded local app resources and exercise data
- responsive layouts verified at 390×844 and 1440×900

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

This checkpoint intentionally stops at a searchable shared exercise library with ordered local media. It contains no workout templates, active-session behavior, release, push, or deployment. The selected gym and exercise library remain separate foundations for a later scheduled template phase.

## Evidence

- `evidence/screenshots/spottr-shell-390x844.png`
- `evidence/screenshots/spottr-shell-1440x900.png`
- `evidence/screenshots/spottr-gyms-390x844.png`
- `evidence/screenshots/spottr-exercises-390x844.png`
- `evidence/gym-verification.md`
- `evidence/exercise-library-verification.md`
- `evidence/exercise-media-verification.md`
- `evidence/no-w38-reuse-proof.md`
- `evidence/verification.md`
