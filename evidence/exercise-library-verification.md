# Exercise library 3A–3D verification

## Scope delivered

- 3A: typed shared `Exercise` domain and service seam with normalized create/edit behavior and case-insensitive search across name, muscle group, equipment, and notes.
- 3B: persistent IndexedDB repository in a library shared across gym contexts; no media fields or media storage were introduced.
- 3C: accessible Train-tab library states for loading, empty, failure, search results, create, and edit, with 44px-or-larger actions and a single-column mobile layout.
- 3D: local app-shell service worker plus IndexedDB persistence keeps the previously loaded library usable after an offline reload.

## Test-first evidence

The targeted data test first failed because `./exercises` did not exist, then passed after the service and repositories were implemented. The user-facing journey first failed because Train still rendered the Phase 1 placeholder, then passed after the exercise library was connected. The browser offline-reload test first failed with `net::ERR_INTERNET_DISCONNECTED`, then passed after the app-shell service worker was added.

## Verification commands and outcomes

```text
npm test
# 3 files passed; 21 tests passed

npm run build
# TypeScript and Vite production build passed; 1,885 modules transformed

npx playwright test
# 4 tests passed
# exercise create/search/edit/reload succeeded against real IndexedDB
# the exercise remained visible after Chromium was switched offline and reloaded
# 390px exercise screen had zero horizontal overflow

git diff --check
# passed (line-ending conversion notices only)
```

## Visual and interaction evidence

- `evidence/screenshots/spottr-exercises-390x844.png`

The mobile screenshot shows the edited “Double Kettlebell Squat” restored after the offline reload, including its metadata, notes, and full-width edit action above the fixed navigation without clipping or overlap. Search behavior is exercised in the automated journey before reload.

## Boundaries and next entry point

This checkpoint contains no exercise media, workout templates, active-session behavior, cloud sync, deployment, or release. The next scheduled slot can consume the shared exercise service when authoring gym-filtered workout templates.
