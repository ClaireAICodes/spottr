# Exercise media 4A–4D verification

## Scope delivered

- 4A: each shared exercise accepts ordered image/video media through the Train library.
- 4B: media can be moved up/down or removed, and its explicit order is persisted with the exercise in IndexedDB.
- 4C: safe JPEG/PNG inputs are resized to at most 1600 px on their longest edge and encoded as JPEG at 0.82 quality before storage. Source images are capped at 10 MB and 20 megapixels before decode; stored images are capped at 2 MB, videos at 15 MB each, and all exercise media at 25 MB locally.
- 4D: the mobile library exposes the policy, previews saved media, announces actionable failures, and retains media/order across reload.

## Test-first evidence

The domain tests were added before implementation and failed because the media service operations did not exist. The user-facing journey then failed because exercise cards had no upload control. The implementation was added incrementally until domain and UI seams passed.

## Verification commands and outcomes

```text
npm test
# 3 files passed; 30 tests passed

npm run build
# TypeScript and Vite production build passed; 1,885 modules transformed

npx playwright test
# 5 tests passed
# Chromium verified add, image compression to JPEG, reorder, reload, remove, and real IndexedDB persistence
# 390x844 media screen had zero horizontal overflow

git diff --check
# passed (line-ending conversion notices only)
```

## Automated policy and failure coverage

- Image preparation is invoked before persistence and its compressed Blob is stored.
- Oversized source files and unsafe decoded dimensions are rejected before image decode.
- A compressed image that still exceeds 2 MB is rejected.
- Videos over 15 MB are rejected before persistence.
- Adding media beyond the 25 MB library-wide cap is rejected.
- Unsupported file types are rejected with an image/video instruction and announced in the UI.
- Ordered media and its metadata survive repository close/reopen.
- IndexedDB serializes concurrent additions so they cannot race past the global cap or overwrite one another.
- A later failure in a multi-file selection leaves earlier successful additions visible and announced.

## Visual and interaction evidence

- `evidence/screenshots/spottr-exercise-media-390x844.png`

The final mobile audit shows the stored image preview, file metadata, 44 px reorder/remove actions, visible storage policy, and full-width add control above the fixed navigation. The Playwright assertion independently confirmed zero horizontal overflow.

## Boundaries and next entry point

Media remains local to the browser and deliberately has no cloud sync, upload, capture, trimming, playback controls, workout-template binding, or active-session behavior. Videos are stored without transcoding so the per-video and total caps remain the predictable storage boundary. The next scheduled slot can consume ordered exercise media through `Exercise.media` without changing this storage policy.
