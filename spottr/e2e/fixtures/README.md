# Owned video acceptance fixture

owned-motion-vp8.webm is synthetic original canvas animation generated locally by e2e/generate-owned-video.mjs using Chromium MediaRecorder. It contains only programmatically drawn rectangles and colours, no third-party media, identifiable people, music, or private data. The project may retain and publish this project-owned fixture and generator for regression testing.

Retained exact artifact (do not regenerate for ordinary tests):
- Container: WebM; video codec: VP8 (generator requests video/webm;codecs=vp8).
- Source dimensions: 1280 x 720; canvas capture requests 30 fps; recording approximately 2.2 seconds.
- Bytes: 1146833.
- SHA256: 8425519b380c6b5e10a468d48caa2ccdd3cc557cf16a3a1c1af0a7046ed9f416.
- No audio track. Timing and exact bytes are nondeterministic on regeneration.

Run from spottr/: npx playwright test --config playwright.retained.config.ts
The managed server builds current source and serves /spottr/ without reusing an existing preview. Natural keyboard file selection exercises preparation and automatic durable save, playback, reload, and public Settings backup downloads. SHA256 and byte length compare the actual encoded preview with reload and export; media identity is compared across exports. Source bytes must differ and be larger than the encoded artifact. The retained browser receipt is under evidence/retained-video-results/.

Scope limits: this Chromium VP8 silent-video seam does not certify audio preservation, MP4, other engines, hosted/offline playback, Cancel/departure/progress, time/byte/retry limits, or whole evening acceptance. Those remain retained card obligations. Duplicate unfinished lifecycle scripts from the prior timed-out attempt are not acceptance evidence; their original bytes were preserved externally by the operator before this checkpoint.
