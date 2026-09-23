# Workout template and shared-exercise integrity verification

## Delivered seam

The Plan tab now exposes the public workout-template workflow:

- create or edit a named template linked to a gym;
- add, remove, and reorder references to shared exercises without copying the exercise;
- add, edit, remove, and reorder independent warm-up, working, and drop-set targets;
- persist and reload exact exercise/set order from IndexedDB;
- duplicate a template to the same gym or another gym with fresh template, reference, and set identities;
- duplicate a shared exercise for a variation, then substitute the new identity without changing the original;
- search shared exercises by name, muscle group, equipment, or notes;
- delete one confirmed template without deleting its shared exercises or copies;
- prevent gym deletion while a workout template still references that gym, with cross-tab writes serialized against deletion;
- resolve shared exercise names live, so a normal global edit propagates to every template reference;
- remove a reference from one template without changing the shared exercise or another template.

A duplicated variation intentionally starts without media. This avoids silently consuming the bounded local media allowance; media can be added explicitly to the new shared identity.

## Automated evidence

Executed from `C:\Users\PHIL_AI\Projects\spottr-v1-w39` on 2026-09-23:

- `npm test` — 4 files passed, 46 tests passed.
- `npm run build` — TypeScript project build and Vite production build passed.
- `npm run screenshots` — 6 Playwright browser tests passed, including the complete 393×844 workout journey.
- `git diff --check` — passed (Git emitted only its Windows LF→CRLF working-copy notices).

The service tests cover mixed set kinds, independent nested target identity, exercise/set reordering, set-kind and target validation, gym-existence validation, same-gym and cross-gym duplication, variation substitution, reference removal isolation, exact reordered kind/weight/reps restoration after an IndexedDB reload, and replacement of temporary editor IDs with unique domain identities after reload edits.

The React journey tests cover draft preservation after a failed save, mixed-set authoring, exact reorder/reload behavior, shared-exercise search, cross-gym duplication, saved variation creation/substitution, subsequent global exercise-edit propagation to every remaining original reference while the variation stays independent, isolated template deletion with keyboard-safe confirmation, linked-gym deletion protection, and a concurrent stale-tab write rejected after serialized gym deletion.

The Playwright journey creates two gyms and two shared exercises, authors and reorders a mixed-set workout, reloads it, duplicates it cross-gym through the keyboard, creates and saves a variation, verifies every populated-editor field and action stays within its panel and viewport at 393 px, verifies no horizontal overflow, and captures the final list.

## Visual evidence

- `evidence/screenshots/spottr-workouts-393x844.png`

The screenshot was visually inspected: workout cards remain readable, actions retain large targets, the fixed mobile navigation does not overlap the active card actions, and no blocker-level clipping or horizontal overflow is visible.

## Scope boundary / next entry point

This checkpoint does not start or snapshot an active workout. The next scheduled phase should consume `WorkoutTemplate` through the `WorkoutService` public seam, snapshot its ordered shared-exercise references and set targets, and keep later session mutations isolated from the template.
