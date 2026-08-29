# Task — Cry analyzer: analyze an uploaded audio or video clip

The analyzer only listened through the mic, so a parent had to catch the cry
live. Add a second way in: pick an audio or video file off the device.

## Decisions
- **On-device, still.** Decode with the browser's `decodeAudioData` — no upload,
  no edge function, no new bucket. `cry_analyses` keeps storing only the derived
  numeric features, exactly as before.
- **Video works for free.** The browser's decoder demuxes the audio track out of
  an `.mp4` / `.mov` container, so video needs no extra machinery.
- **No schema change.** A `source` column ('mic' | 'upload') would be nice for
  future insights, but it isn't needed for the feature and would break logging
  until the migration landed. Skipped — the ask was the upload path.
- **Trim long clips.** A two-minute nap video is mostly silence; feeding the
  whole thing to `extractFeatures` washes the loudness features out.

## Lib — `src/lib/cryFeatures.ts`
- [x] Export `ANALYSIS_WINDOW_S = 8` (the cap the live recorder already used)
- [x] `pickLoudestWindow()` — sliding sum over a 100ms energy envelope, O(n),
      returns the buffer untouched when it already fits the window

## Hook — `src/hooks/useCryAnalyzer.tsx`
- [x] Extract `analyzeArrayBuffer()` — decode → mono → loudest window →
      features → classify, shared by the mic and file paths
- [x] `analyzeFile(file)` with `audio/*` + `video/*` MIME check, extension
      fallback for blank MIME types, and a 100 MB cap
- [x] `fileCapturedAt()` — log against the clip's own `lastModified`, clamped to
      reject future or >1yr-old stamps
- [x] Expose `source`, `fileName`, `capturedAt`; reset them in `reset()`

## Frontend — `src/components/CryAnalyzer.tsx`
- [x] Hidden `<input type="file">` + "Upload audio or video" button under an
      `or` divider on the idle recorder card
- [x] Analyzing state names the file; result card shows "From <filename>"
- [x] `occurred_at` uses `capturedAt` instead of `new Date()`
- [x] Intro copy covers both paths; on-device disclosure next to the medical one
- [x] `touch-target` on the result-card buttons

## Verify
- [x] `npx tsc -p tsconfig.app.json --noEmit`, `npx eslint`, `npm run build`
- [x] `npm test` — 379 passed / 27 files
- [x] New `src/lib/__tests__/cryFeatures.test.ts` — 6 cases

## Review

**Shipped** as PR #210 (draft). Three source files touched, one test file added.
No migration, no edge function, no legal-doc change.

**One analysis path, two front doors.** The mic recorder's `onstop` and the new
`analyzeFile()` both call `analyzeArrayBuffer()`, so the classifier can't drift
between them. That refactor is why the diff to the mic path is small.

**Why `pickLoudestWindow` and not "decode the first 8 seconds".** Uploads are
found footage — the cry is somewhere in the middle of a clip that starts with
silence. Taking the head would have handed the classifier ambient room tone and
returned `unknown` almost every time. The sliding-sum implementation is O(n) over
a 100ms envelope rather than the naive O(n · windowLen) scan, so a five-minute
clip costs a few ms.

**Timestamps.** An uploaded cry that logged as "just now" would quietly corrupt
the history list the weekly insights are meant to read later. Using the file's
`lastModified` fixes the common case (phone recording), and the clamp keeps a
picker that rewrites mtime on copy from stamping a nonsense date.

**Known limitation, called out in the PR.** A container or codec the browser
can't open — DRM'd media, something exotic, a silent video — surfaces the
"couldn't read any audio" error. The realtime-capture fallback (media element +
`captureStream`) needs a user gesture and doesn't work uniformly across Safari,
so it wasn't worth the complexity for v1.
