# Video Library precision-sync transformation

## Recommendation
Keep the current EduHub architecture and replace only the speech-timing authority. ElevenLabs Scribe becomes the source of spoken words, word boundaries, confidence, and speaker changes. Gemini remains responsible for scene understanding, Khmer translation, vocabulary, grammar, CEFR level, explanations, and narration planning.

Administrators process each upload once. The approved synchronization document is saved. Student playback reads that saved document locally, so play, replay, seeking, and many simultaneous students create no ElevenLabs or Gemini calls.

```text
Admin upload
  -> audio extraction
  -> ElevenLabs: words + exact timings + speakers
  -> Gemini: teaching content + scene understanding + translation
  -> one canonical sync document
  -> review and approval
  -> publish
  -> students stream video and read saved timing only
```

## Why this fits the existing app
- Author Studio already has upload, staged processing, synchronization review, manual corrections, approval, publishing, and analytics.
- Student playback already makes no AI calls.
- The karaoke engine already uses the media clock, frame-level updates, word lookup, seek/replay recovery, auto-follow, speaker modes, and reduced-motion support.
- Approved timing is protected: reprocessing creates a candidate and cannot silently replace what students see.
- Purchases, progress, bookmarks, notes, narration, media storage, and Gemini learning features are separate from timing.

The failure is isolated to the current two-pass Gemini timing path, where measured words are merged onto an independently generated transcript and unmatched words can fall back to estimated spacing.

## Backend transformation

### 1. Promote the existing ElevenLabs adapter
- Harden the existing Scribe provider rather than introducing a parallel synchronization system.
- Keep the ElevenLabs key server-side only.
- Use word timestamps, diarization, language detection, and confidence from Scribe.
- Add bounded timeouts, safe retries, existing size/duration checks, and sanitized errors.

### 2. Make Scribe the speech source of truth
- Build the canonical word stream directly from Scribe so every accepted word keeps its measured start and end.
- Preserve the existing `paragraphs -> sentences -> words` contract.
- Derive sentence and paragraph bounds from their words.
- Retain stable sentence IDs so Gemini learning annotations attach without changing timing.
- Use Gemini after timing exists to enrich the lesson, never to overwrite measured word boundaries.

### 3. Preserve compatibility and approved content
- Existing Gemini-timed lessons continue unchanged.
- New lessons use ElevenLabs when enabled.
- Reprocessing an approved lesson continues to create a candidate requiring approval.
- Store provider version, generated time, alignment version, detected language, speaker count, word count, and confidence summary.
- Keep unrelated endpoints, storage, authentication, purchases, progress, bookmarks, notes, analytics, and narration untouched.

### 4. Honest failure policy
- A failed Scribe call must not be presented as precise synchronization.
- Keep the lesson in an administrator-visible **Timing needs attention** state.
- Let administrators retry or deliberately continue with clearly labelled estimated timing.
- Never silently publish estimated timing as measured.

## Author Studio improvements
- Replace the “Gemini processing” story with truthful stages: **Speech & timing**, **Speaker detection**, **Teaching analysis**, and **Ready for review**.
- Show measured-word coverage, low-confidence words, speaker count, language, duration agreement, provider, and version.
- Keep drag timing controls, speaker relabelling, split/merge, undo/redo, preview, and approval.
- Add low-confidence filtering and tap-to-replay for a selected word or sentence.
- Add an explicit **Regenerate timing** action with cost confirmation. Refreshing, previewing, publishing, and student playback never call Scribe.

## Student mobile experience
Build on the current teleprompter and clock engine rather than rewriting them.

- Keep the video and current words visible together on common phone heights.
- Use a cinematic focus area for the current sentence, with previous and next lines softened for context.
- Give every word a stable footprint so highlights never move the text.
- Use a restrained luminous active-word treatment, a completed-word state, and quiet upcoming words.
- Show a compact active-speaker marker with accessible, consistent speaker colours.
- Make words tappable to seek and replay from their measured boundary.
- Keep sentence replay, five-second rewind, speed, translation reveal, text size, line spacing, auto-follow, and audio controls thumb-reachable.
- Show **Audio-synced** only for approved measured timing; fallback lessons show **Estimated timing**.
- Preserve grammar, vocabulary, notes, purchases, bookmarks, progress, and other lesson views.
- Support safe areas, portrait/landscape, rotation, screen resume, slow connections, long transcripts, and reduced motion.

## Cost controls
- Save an audio fingerprint plus alignment settings and reuse a successful result when both match.
- Keep the current atomic per-lesson claim so simultaneous admin actions cannot create duplicate calls.
- Record one provider-call ledger entry per processing attempt with duration, status, model, and administrator—never credentials.
- Add configurable upload-size and duration limits.
- Enforce an import-boundary test proving student endpoints cannot reach ElevenLabs.

## Verification
- Provider tests: punctuation, multiple speakers, silence, overlapping speech, Khmer/English, malformed times, low confidence, and empty audio.
- Pipeline tests: exactly one Scribe call per explicit run and zero calls from student playback.
- Safety tests: candidate approval/rejection, manual corrections, legacy documents, and honest fallback labels.
- Player tests: play, pause, seek, replay, speed changes, background/resume, word tap, speaker transitions, and long transcripts.
- Real-video validation on representative iPhone and Android sizes before rollout.

## Rollout
1. Add ElevenLabs behind a server setting; leave playback unchanged.
2. Validate a private sample set against current Gemini timing.
3. Enable Scribe for newly processed lessons.
4. Release Author Studio quality controls.
5. Release the refined student karaoke presentation after real-phone testing.
6. Reprocess older lessons individually only when an administrator chooses; never run a surprise batch migration.

## Expected result
Administrators upload once, receive measured speaker-aware timing plus Gemini teaching content, review it, and publish it. Students receive an elegant word-synchronized lesson that can be replayed by any class size without recurring AI cost.
