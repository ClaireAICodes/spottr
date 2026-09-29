# Versioned backup export verification

## Outcome

Settings now offers **Download backup**, producing a complete JSON export with the stable contract markers:

- `format: "spottr-backup"`
- `version: 1`
- ISO `exportedAt`
- all gyms and the selected gym identity
- all shared exercises and ordered media
- all workout templates
- the active session and completed-session history
- application settings

Each media item preserves its metadata and carries its bytes as `{ "encoding": "base64", "data": "..." }`, so the JSON file is self-contained rather than leaving browser `Blob` values unserialized.

## Verification

- `npm test` — 8 files, 105 tests passed.
- `npm run build` — TypeScript and Vite production build passed as part of the browser run.
- `npx playwright test e2e/pr-settings.spec.ts` — 1 browser test passed. The test creates a gym, exercise with video bytes, workout, and custom settings; downloads the backup; then verifies the version, entities, settings, and exact base64 media payload.
- Mobile overflow assertion passed at 390 px.
- Visual evidence: `evidence/screenshots/spottr-settings-storage-390x844.png`.

## Boundary

This slice exports backup data only. Restore/import is intentionally not included.
