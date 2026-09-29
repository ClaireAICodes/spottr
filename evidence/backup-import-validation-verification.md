# Backup import validation verification

## Outcome

Settings now accepts a backup JSON file for preflight validation. The complete version 1 contract is checked before any restore path can run, including entity shapes, unique identities, references, session snapshots and summaries, settings, canonical ISO timestamps and ordering, and base64 media payload sizes. Input is bounded to 40 MB, existing per-file and aggregate media limits are enforced, and export serialization refuses files above the same boundary so Spottr cannot download a backup its importer rejects for size.

Malformed JSON/structures and unsupported backup versions show an explicit error that current saved data has not changed. A compatible backup is reported as ready for a future restore step; this envelope intentionally performs no restore writes.

## Acceptance evidence

- `src/App.test.tsx` exercises the Settings file-input seam with malformed and version 2 files, then reads the same gym, exercise, workout, and settings services to prove current data remains intact.
- `src/backup.test.ts` proves a complete backup emitted by the version 1 exporter passes the import validator unchanged.
- `e2e/pr-settings.spec.ts` submits malformed and incompatible files in Chromium at 390 px, verifies both rejection messages, confirms settings remain unchanged, and verifies no horizontal overflow.
- Visual evidence: `evidence/screenshots/spottr-backup-import-validation-390x844.png`.

## Verification

- `npm test` — 8 files, 108 tests passed.
- `npm run build` — TypeScript and Vite production build passed.
- `npx playwright test e2e/pr-settings.spec.ts` — 1 browser test passed.
- `git diff --check` — passed.

## Boundary

This slice validates import files and guarantees invalid-input preservation. Applying a valid backup to local storage is not included and must remain a separately authorized envelope.
