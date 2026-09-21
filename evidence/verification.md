# Phase 1A–1D verification

## Scope delivered

- 1A: clean Vite/React/TypeScript scaffold; npm lockfile; Vitest and Playwright harnesses.
- 1B: original token layer plus reusable `Panel`, `ActionButton`, and `StatusPill` primitives.
- 1C: five-tab responsive shell with `navigation`, `tablist`, `tab`, `tabpanel`, roving `tabIndex`, `aria-selected`, and keyboard navigation.
- 1D: presentation-only Home empty and resume frames. Actions are deliberately disabled and labelled as previews.

## Test-first evidence

The first unit run failed because `src/App.tsx` did not exist. Implementation followed that red state. During review remediation, the new Train-tabpanel accessible-name assertion and 390px orientation assertion both failed before their implementation. The final public-seam tests verify five named tabs, active-state semantics, arrow-key focus/selection behavior, named Home and non-Home tabpanels, responsive orientation semantics, live viewport changes, and both Home frames.

## Final commands and outcomes

```text
npm ci
# reproducible lockfile install completed

npm test
# 1 test file passed; 3 tests passed

npm run build
# TypeScript and Vite production build passed; 1,879 modules transformed

npm run screenshots
# 2 Playwright tests passed
# verified keyboard focus/selection and horizontal orientation at 390px
# verified live 390px → 821px → 390px orientation updates
# verified vertical orientation and zero horizontal overflow at 1440px

npm audit --audit-level=high
# 0 vulnerabilities
```

## Keyboard and focus audit

- Tab stops: brand skip target, profile button, and one active primary tab; inactive tabs use roving `tabIndex=-1`.
- Tab navigation: ArrowRight/ArrowDown advance; ArrowLeft/ArrowUp reverse; Home/End select edges; wrapping is supported.
- Focus visibility: global 3px blue `:focus-visible` ring with 4px offset. The mobile evidence capture visibly shows the focused Home tab.
- Target size: mobile tabs are at least 56×62 CSS px; avatar is at least 44×44; primary panel actions are at least 50px tall.
- Active state is not color-only: `aria-selected=true`, position, outline, fill, and shadow distinguish it.
- Every rendered tabpanel is named by its controlling tab through `aria-labelledby`.
- Tablist orientation matches the layout: horizontal at 820px and below, vertical above 820px, including after live viewport changes.
- Reduced motion: a `prefers-reduced-motion: reduce` rule suppresses transitions and animations.

## Responsive visual evidence

- `evidence/screenshots/spottr-shell-390x844.png`
- `evidence/screenshots/spottr-shell-1440x900.png`

Both were produced by the real app through Playwright. The desktop audit confirmed zero horizontal overflow. Visual inspection found both Home frames legible and the five-tab navigation clear. On mobile, the fixed bottom navigation intentionally overlays the viewport edge while content remains scrollable with reserved bottom padding.

## Exclusions preserved

No business behavior, data persistence, gyms, exercises, workout templates, media, release, remote, push, deployment, spending, credentials, or external communication was added. Non-Home destinations are intentionally empty shell panels.

## Remaining gate

Same-card independent Reviewer approval is required before the Kanban card can complete.
