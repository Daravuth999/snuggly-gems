# Video Library — ElevenLabs Timing + Gemini Learning Deployment

**Status:** All Video Library code (backend routes, pipeline, Review
Studio, student player, purchase flow) is built, tested, and merged to
`audit/video-library-production-fixes` in both repos. Nothing in this
file was executed by Claude — every step below is a manual action you
perform in Render / MongoDB / Vercel.

There is **no feature flag** gating the Video Library. The routes mount
unconditionally in `server.py` (wrapped in try/except purely so an import
error can't take down the rest of the API — not a kill switch). Once the
branch is merged and deployed, the routes and UI are live immediately.

---

## 1. Required Render environment variables

Set on the **eduhub-backend** Render service → Environment:

```
GEMINI_API_KEY=<your Gemini API key>
ELEVENLABS_API_KEY=<your ElevenLabs API key>
VIDEO_ALIGNMENT_PROVIDER=elevenlabs
ELEVENLABS_SCRIBE_MODEL=scribe_v2
```

ElevenLabs Scribe v2 is the one-time speech, speaker, and measured word-timing
engine. Gemini remains responsible for translation, grammar, vocabulary,
summaries, explanations, and story analysis. These secrets belong on the
Render backend only; never add them to Vercel or any `REACT_APP_*` variable.

Timing runs through a single guarded path for every provider
(`video_word_alignment.run_word_alignment`): Gemini produces the canonical
`paragraphs -> sentences -> words` structure that sentence IDs, speaker labels
and the educational analysis are keyed to, and the selected provider's measured
word start/end times are merged onto that structure. Consequences:

* `VIDEO_ALIGNMENT_MAX_SECONDS` is enforced before any paid timing upload,
  for ElevenLabs exactly as for Gemini.
* A provider outage degrades to the existing interpolated timing and is
  labeled honestly. It never triggers a second transcription call, so a
  failure costs one attempt, not two.
* Sentence identity is stable, so existing translations, grammar notes and
  vocabulary attached to sentences keep working unchanged.

Get a key from [Google AI Studio](https://aistudio.google.com/apikey) if
one isn't already provisioned — check first, since this codebase's other
Gemini integrations (`voice_treasure_gemini.py`, `ai_assistant_tools.py`,
`book_factory_gemini.py`, `edutalk_tools.py`) already read the same
`GEMINI_API_KEY`. If a key is already set for those features, **the Video
Library reuses it — no second key, no second provider, nothing new to
provision.**

## 2. Optional environment variables and rollback

```
VIDEO_AI_MODEL=gemini-2.5-flash     # default if unset; any generateContent-capable model works
VIDEO_AI_MOCK=1                     # forces deterministic mock ASR even if GEMINI_API_KEY is set
VIDEO_ALIGNMENT_MAX_SECONDS=1800    # reject oversized paid timing calls before upload
```

Temporary rollback: set `VIDEO_ALIGNMENT_PROVIDER=gemini`. This restores the
legacy Gemini timestamp merge without changing saved lesson documents.

Leave both unset for normal production behavior. `VIDEO_AI_MOCK` exists
for staging/demo environments where you want the pipeline to run without
burning Gemini quota — the mock produces clearly-labeled placeholder
transcripts (`provider_version: "mock-asr-v1"`), never something that
could be mistaken for real speech recognition.

If `ELEVENLABS_API_KEY` is absent, measured timing is reported as unavailable;
the system does not silently describe estimated timing as audio-synced.

## 3. Database — no migration required

No manual MongoDB setup, index creation, or data migration is needed.
`ensure_video_library_indexes()` runs automatically on API startup and
creates every required index the first time the service boots with this
code (idempotent — safe to run on every restart). Collections
(`video_lessons`, `video_purchases`, `video_progress`, `video_bookmarks`,
`video_notes`, `chapter_sync`) are created lazily on first write — there
is nothing to pre-create by hand.

## 4. Storage — no new bucket required

Uploaded media (video/audio) reuses the existing GridFS-backed storage
path already used by `sync_studio_tools.py` for book audio. No new
storage bucket, no new credentials, no new provider account.

## 5. Frontend — no build-time configuration needed

The Video Library UI ships inside the existing CRA bundle
(`eduhub-studio-test`). It talks to the backend through the existing
`REACT_APP_BACKEND_URL` — the same variable every other `/api/...`
feature already uses. No new frontend env var.

## 6. Deployment steps, in order

1. Merge `audit/video-library-production-fixes` → your integration branch
   → `master` in **both** repos (backend, frontend), or deploy the audit
   branch directly if that's your current workflow.
2. Render (backend): confirm both API keys and the alignment provider values
   are set (step 1). Deploy.
   Watch the boot log for `video_library_tools: disabled (...)` or
   `video_pipeline_tools: disabled (...)` — if either line appears, the
   import failed and the feature is silently off; if neither appears,
   both mounted successfully.
3. Vercel (frontend): deploy as normal — no new env vars, no new build
   flags.
4. Author Studio → Video Factory tab (`/studio`) is visible immediately
   to allowlisted admin accounts (`StudioAuth.jsx` allowlist — unrelated
   to this feature, already governs all of `/studio`).
5. Create one test lesson end-to-end (see verification checklist below)
   before announcing the feature to students.

## 7. Turning it off

To roll timing back without changing the frontend or stored lessons, set
`VIDEO_ALIGNMENT_PROVIDER=gemini` on Render and redeploy. Already approved
documents remain unchanged until an administrator explicitly reprocesses them.
Nothing this feature writes affects any other collection ownership
(verified via `tools/check_collection_ownership.py --strict`), so a
revert is clean.

---

## Manual, honest disclosure: what has and hasn't been verified

Everything below the line is real evidence, not aspiration:

- **Verified in this environment:** full backend pytest suite (2330
  passed, 21 skipped), full frontend jest suite (2247 passed), `yarn
  build` clean, `tools/check_collection_ownership.py --strict` clean,
  every backend route cross-referenced against a frontend consumer (two
  gaps found and fixed this round: `GET /video/purchases/mine` and the
  admin reconcile-listing route).
- **Not verified, and cannot be from here:** a live call against your own
  Render environment and production MongoDB, and
  end-to-end behavior against your actual deployed Render/Vercel/MongoDB
  production stack. This environment has no live MongoDB, no Docker, and
  no network path to your production infrastructure — "verified against
  the deployed code" in the sense of hitting the real production URLs is
  not something I can do from here. The mitigation is the same one this
  codebase already uses for every other Gemini feature: mock-mode
  fallback with honest labeling, so a missing key degrades gracefully
  instead of failing silently or fabricating results.
- **What you should personally check once deployed:** create one lesson,
  upload a short real video, confirm the pipeline reaches
  `review_ready` with a non-mock `provider_version`, approve it in Review
  Studio, publish it, and complete one real student purchase + watch +
  resume cycle. That is the one gap only a live deploy with a real key
  can close.
