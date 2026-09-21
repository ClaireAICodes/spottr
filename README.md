# Spottr W39 — Phase 1 shell

A fresh, local-only Spottr delivery foundation covering Phase 1A–1D:

- Vite + React + TypeScript scaffold and Vitest/Playwright harness
- original design tokens and reusable panel/action/status primitives
- accessible five-tab shell with roving keyboard focus
- presentation-only Home empty and resume frames
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

This checkpoint intentionally contains no workout business behavior, gyms, exercises, templates, media, persistence, release, push, or deployment. Disabled actions and placeholder destinations communicate the boundary in the interface.

## Evidence

- `evidence/screenshots/spottr-shell-390x844.png`
- `evidence/screenshots/spottr-shell-1440x900.png`
- `evidence/no-w38-reuse-proof.md`
- `evidence/verification.md`
