# Gym profiles 2A–2D verification

## Scope delivered

- 2A: typed `Gym` domain, service boundary, version-2 IndexedDB repository, and migration coverage preserving a version-1 gym while adding selected-gym settings.
- 2B: loading, empty, failure, list, add, edit, select, and confirmed-delete states with 44px-or-larger controls and manual address entry.
- 2C: optional browser geolocation capture; denied or unavailable location leaves the address field enabled and explains the manual fallback.
- 2D: Home resolves the persisted selected gym and exposes it in the disabled future workout-entry action without implementing templates early.

## Test-first evidence

The first targeted data test failed because `./gyms` did not exist. The service and IndexedDB repository were then implemented to make create/edit/select/delete and version migration pass. The first UI journey failed because the shell had no “Manage gyms” entry point; the Home-to-Gyms flow was then implemented. Review-blocker regressions cover stale geolocation callbacks, repeated form submission, and modal focus containment/restoration. The browser journey exercises the real IndexedDB and browser-permission boundaries.

## Verification commands and outcomes

```text
npm test
# 2 files passed; 17 tests passed

npm run build
# TypeScript and Vite production build passed; 1,882 modules transformed

npm run screenshots
# 3 Playwright tests passed
# two-gym create/edit/select/reload succeeded against real IndexedDB
# denied geolocation preserved manual address entry
# delete cancellation and confirmed delete both succeeded
# confirmed deletion remained absent after reload
# 390px gym screen had zero horizontal overflow

git diff --check
# passed (line-ending conversion notices only)
```

## Visual and interaction evidence

- `evidence/screenshots/spottr-gyms-390x844.png`
- `evidence/screenshots/spottr-shell-390x844.png`
- `evidence/screenshots/spottr-shell-1440x900.png`

The gym screenshot was captured after scrolling to the end of the selected card. Automated geometry verifies that the delete control sits above the fixed navigation, while the screenshot shows the selected badge/check and all three card actions without collision or clipping.

## Boundaries and next entry point

No exercise, media, template, or active-session model was introduced. The next scheduled slot can consume the persisted selected-gym service when connecting the exercise library and later gym-filtered workout templates.
