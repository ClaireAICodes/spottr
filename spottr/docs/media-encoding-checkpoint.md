# Local media encoder checkpoint

## Reproduce

From the product directory run `npm test`, `npm run build`, and
`npx playwright test --config playwright.media.config.ts`. The codec probe uses
Vite module loading at the public ExerciseService seam; it is not a production
Pages/offline proof. The production TypeScript/Vite build passes separately.

Baseline: 269aae5a1a3381a290c5d775a78bdf42a488a9d8. Baseline unit suite:
128 passed; checkpoint: 130 passed. No assertions were removed. Existing jsdom
media ordering/focus/storage tests inject video preparation just as they already
inject image preparation: fake string MP4 inputs are not real decoder fixtures.
Real compression behavior is tested in Chromium, not mocked there.

## Executed codec proof

Environment: Windows, Node 26.7.0, HeadlessChrome 153.0.8010.12.
Original synthetic animated canvas fixtures generated locally in the test;
no external media, user data, or third-party content. Source dimensions 1280x720.

| Input | Source bytes | Output bytes | Runtime ms | Output |
| --- | ---: | ---: | ---: | --- |
| WebM VP8 | 1138892 | 264801 | 2302.4 | WebM VP8/Opus, 720x406 |
| MP4 AVC avc1.42001E | 1075451 | 253154 | 2220.6 | WebM VP8/Opus, 720x406 |

WebM source SHA256:
cb1cbb7831d10659c5b1c88314e5c0640c13d524e4d50183709a4424c37649bd
WebM output SHA256:
c2eea5058b10ea62f1617f85047801811b198663ebef241d1e164d2af789cc53
MP4 source SHA256:
6b842d4a2135c98ffa33a566d0050d3423d27d17245ce28bd0d610cb0e4f68f6
MP4-derived output SHA256:
46a3c64ac2c05ef92966bc3b26a429f07f7e24100b73f848169c47379d29ff01

Both outputs decoded with nonzero dimensions and playback advanced. Cancellation
at preparation progress and corrupt MP4 rejection preserved the complete memory
service dataset. RED used the identical probe before implementation: equal
source/output bytes and hashes, 1280x720 output, cancellation/failure did mutate.
GREEN uses real Canvas capture/MediaRecorder, no source pass-through.
Fixture bytes are generated anew each execution (hashes vary with capture timing).
The test attaches a JSON codec receipt to Playwright results; fixtures themselves
are not retained in this checkpoint.

## Implemented bounded behavior

ExerciseService now calls genuine default video preparation. Optional signal and
progress are exposed on addMedia; precommit cancellation is checked again after
preparation. The encoder accepts playable MP4/WebM containers, selects a supported
MediaRecorder output, bounds the maximum edge to 720 pixels and uses 1.2 Mbps
video/64 kbps audio. A single 500 kbps retry is allowed under one 60-second deadline
when the output is not smaller. Empty, over-budget or non-smaller outputs fail,
never fall back to uncompressed storage. Source remains unchanged. Sources are
bounded to 15 MiB, 20 megapixels and finite positive duration <=50 seconds.
Audio is routed from the decoded media element to the output stream rather than
silently stripped, but audible-content preservation has NOT been verified yet.
Stream tracks, playback, animation frame, audio context and object URLs are
released on completion/failure/cancellation.

Proved input codecs: VP8 WebM and AVC MP4 only, in the named Chromium environment.
Proved output: VP8/Opus WebM. Capability candidates are not a supported-codec
claim: MP4 output/other encoders, Firefox, Safari and physical devices remain OPEN.
JPEG/PNG image path is unchanged. The B2 repair removes the autoplay launch override.
Normal Chromium policy is exercised after a natural Train-tab click and through
the public ExerciseLibrary keyboard Tab/Enter file chooser with a real owned WebM.
The public upload succeeds and its preview decodes at width 720. This is browser
chooser automation, not physical OS chooser certification. Source playback is
muted; decoded audio still routes through Web Audio, with audible content OPEN.

B2 regression RED: pending AudioContext.resume cancellation returned `hung` after
500 ms, with unchanged dataset. GREEN: resume and play each reject on cancellation,
absolute deadline or browser rejection; complete memory-service dataset unchanged.
The deadline test accelerates only the existing 60000 ms timer to 150 ms; successful
real codec runtime measurements use the unchanged production deadline. Abort-aware
waits observe late API rejection and remove abort listeners. Finally stops recorder
and stream tracks, pauses/removes source, cancels frames and revokes URL; audio close
is requested without making a pending close promise hold cancellation hostage.

Re-executed no-override proof: WebM 1132334 -> 250248 bytes, 2278.3 ms;
MP4 1073574 -> 249054 bytes, 2210.4 ms. Both VP8/Opus WebM at 720x406,
decoded and playback advanced; exact varying hashes attached in codec-proof.json.
Full units 130/130 and production build pass. Natural-upload screenshot attached.

## Five-item boundary and legacy design

Repository addMedia enforces maximum five within the same readwrite transaction
as the aggregate 25 MiB check and append. Memory repository enforces the same
public boundary. A deterministic preparation rendezvous forces competing services
to arrive together; separate IndexedDB repository connections test transactional
serialization. With four existing items RED committed both writes; GREEN commits
one and rejects one, preserving five and returning an actionable error.

This protects incremental attachments, not yet all ingestion routes. Completion
must put incoming-list validation before any service/repository replaceAll clear,
and maximum-five backup preflight before replacement. Invalid incoming backups
must reject without deleting the current dataset. Existing legacy >five records
must remain readable/exportable/reorderable/removable without silent truncation;
new append is blocked until below five. A recovery snapshot containing such a
legacy record needs a private restore adapter, not weakening public import
validation. Export must not falsely present legacy oversize records as a compliant
new backup without explaining the required remediation. Those routes and tests
remain OPEN for the scheduled follow-up; this document does not claim full
five-item invariant or portable backup acceptance.

## Restore coordinator acquisition inspection (design, not implementation)

Current backup.ts drains each service queue, snapshots, then replaces multiple
independent databases with Promise.allSettled; handled failure attempts rollback.
The module-local restore queue does not exclude cross-tab/live writes or survive
termination. No cross-database ACID claim is justified.

Proposed implementation entry point: a common origin dataset admission layer with
lock order dataset -> workout-integrity -> session/target locks. Every public write
and export enters admission before its local service queue; restore owns one
exclusive permit. Internal domain replacement adapters use that held permit and
must not reacquire it. Do not acquire exclusivity and then wait for a service queue
whose pending work is waiting for the same permit: admission must happen first,
with one ordered coordinator. Read/bootstrap must gate on completed recovery.

Under exclusive ownership: validate all incoming domains/media first, snapshot
previous bytes/settings, durably persist prepared journal, mark applying, replace,
verify all-domain fingerprint, mark committed, then clear the journal. Quota or
journal acquisition failure prevents any replacement. On restart prepared/applying
rolls back the previous complete snapshot; committed verifies incoming. Failed
recovery preserves the journal and blocks writes with recover/export guidance.
No boolean public bypass; internal permit is closure-owned/unforgeable. Without
Web Locks an IDB lease/generation needs proven renewal/takeover, or use staged
stores plus one durable generation-pointer commit. Deterministic held admission,
competing restores/live writers, quota, kill/reopen and all-domain byte equality
are required before claiming correctness. No broad restore rewrite in this slot.

## Remaining acceptance and fallback

OPEN: visible UI progress/Cancel and departure behavior;
audio-content proof; actual encoded output persistence/reload and
backup byte equality; stored owned fixtures; time/byte/retry/unsupported-engine
edge coverage; production public/offline playback. Several historical browser
specs upload strings labelled MP4 and must move to genuine owned fixtures (they
are not codec evidence and were not claimed passing here). No UI/style changes
were made in this checkpoint.

Native Chromium route is suitable for the proved bounded slice; no new dependency
is needed now. If other required engines fail native capability tests, retain the
planned client-local WebCodecs + rights-reviewed muxer route; if unsuitable,
rights-reviewed single-thread offline FFmpeg-WASM worker with measured memory,
time and Pages asset cache budgets. No cloud upload, pass-through or silent video
omission. Unresolved production codec coverage retains Thursday budget.

This is a reviewable implementation checkpoint, not whole-envelope acceptance,
independent approval, publication approval receipt or final usable-product claim.
