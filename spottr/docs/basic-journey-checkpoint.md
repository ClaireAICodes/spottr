# Canonical navigation and connected basic journey checkpoint

Parent: 4825c72449ceec567583a11515223fcc470bbd96.

Public seam: application navigation and real UI authoring/session/history, using actual IndexedDB without seeded data, storage mocks or fixture import. This is the bounded navigation/basic-journey slice, not full product acceptance.

Changes: Home | Exercises | Workouts | History | Settings captions, associated tabpanel accessible labels, omission of the fixed fictional date and unavailable profile button. Existing test navigation locators migrate to the canonical labels; behavior expectations remain intact. No session/service/repository behavior changed.

RED: `npx playwright test --config playwright.journey.config.ts --max-failures=1` failed at the canonical tabs assertion: expected Exercises/Workouts, received Train/Plan. Date/profile gaps were identified in source; they were not independently reached in that RED run because the first assertion stopped it.

GREEN:
- `npm test`: 17 files, 143 tests passed.
- `npx playwright test --config playwright.journey.config.ts`: 3 passed at 390x844, 834x844, 1440x844. Managed fresh TypeScript/Vite build, strict dedicated port, reuseExistingServer=false, actual /spottr/ navigation.
- `npx playwright test e2e/screenshots.spec.ts e2e/active-session.spec.ts e2e/exercise-skip.spec.ts e2e/legacy-media.spec.ts e2e/backup-rejection-retry.spec.ts --workers=1`: 12 passed with fresh managed production build.
- `git diff --check`: passed.

New connected scenario: create gym, create shared exercise, create two-set template (40kg x5 and 30kg x6), start, log first set, manually stop rest, skip second set, await committed status, reload, resume, explicitly return second set, log it, stop rest, finish, assert 380kg/two completed/zero skipped, open history, reload, inspect both saved actuals and completed labels. Also asserts exact canonical tabs, linked tabpanel names, and absence of the fictional date/profile control.

One initial desktop attempt reloaded after the input became disabled but before skip persistence completed. Waiting for committed skipped status before reload corrected the test synchronization; no sleep, retry or weakened persistence assertion was added. An initial full-unit run exposed two multiline old-caption expectations; those were migrated to the canonical contract and the complete suite rerun successfully.

Local generated evidence (ignored, not publication artifacts): evidence/basic-journey-results/history-390.png, history-834.png, history-1440.png; existing screenshot suite refreshed shell screenshots. Browser evidence is Chromium emulation, not native safe-area/keyboard/assistive speech certification. Migrated tests outside the named executed suites were not all run. Full end-to-end codec/media and offline certification is not claimed.

Retained scope: fake-MP4 migration, audio-content fidelity, visible preparation progress/reachable Cancel/departure noncommit and finite time/output-byte/retry/unsupported routes; Thursday codec/engine closure. Latest exact-SHA review then authorized hosted deployment with remote/workflow/resource scope readback and actual online/cache-ready/offline smoke remains owed. Wednesday restore coordinator/journal and all original BASE/R1-R6/O1-O7 obligations stay in their original slots. No push/deploy performed. Whole-envelope acceptance remains false.

Next verification: `npm test && npx playwright test --config playwright.journey.config.ts`, then designated independent exact-SHA bounded review. Further retained work stays on the same card.

## Review correction: complete indirect navigation migration

Correction parent: 4abae97c1b8c216c5c687ba9162c12e76bbcf6be. The designated review rejected stale helper callers in offline-keyboard, offline-media-keyboard and connected-residual. The tracked-source audit additionally found two settings-retry-focus parameter arrays still naming Plan. All nine stale caption occurrences now use Exercises/Workouts. No production code changed, tests were not deleted/skipped, and keyboard actions and behavioral assertions remain intact.

Fresh RED command: `npx playwright test e2e/offline-keyboard.spec.ts e2e/offline-media-keyboard.spec.ts e2e/connected-residual.spec.ts e2e/settings-retry-focus.spec.ts --grep '390x844|local image|template create: committed|Plan keyboard settings' --workers=4`. Four selected tests failed on missing Train/Plan tabs before repair.

The first extended GREEN attempt passed 54 cases but exposed two strict-locator errors: Workouts is both the level-one page heading and a level-two panel heading. Settings retry assertions now explicitly select the level-one page heading, retaining focused/tabIndex/focus-visible and departure-focus checks. This is disambiguation of the original intended page-heading target, not removal of an assertion or scripted focus workaround.

Final fresh verification:
- `npm test`: 17 files / 143 tests passed; `npm run build`: TypeScript/Vite passed.
- `npx playwright test e2e/offline-keyboard.spec.ts e2e/offline-media-keyboard.spec.ts e2e/connected-residual.spec.ts e2e/settings-retry-focus.spec.ts e2e/screenshots.spec.ts e2e/active-session.spec.ts e2e/exercise-skip.spec.ts e2e/legacy-media.spec.ts e2e/backup-rejection-retry.spec.ts --workers=1`: 56/56 passed without retries. Includes all 35 connected-residual cases, all four offline keyboard layouts, offline image chooser/reference and all four settings-retry cases, plus the prior 12 affected regressions.
- `npx playwright test --config playwright.journey.config.ts`: 3/3 passed, fresh managed production /spottr/ build/server.
- `git diff --check`: passed. Programmatic audit of Git-tracked e2e/src TypeScript found no Train/Plan caption remnants; the four remaining You matches are ordinary user-facing sentences, not navigation references.

These local cached-ready core/image tests are not hosted/offline video or whole-envelope certification. Prior approved media bytes remain unchanged. All residuals above remain owned by the original card and original scheduled slots. No push/deployment; independent successor-SHA review still required.
