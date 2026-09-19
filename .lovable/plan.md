# Video Library precision-sync transformation

## Recommendation
Keep the current EduHub architecture and replace only the speech-timing authority. ElevenLabs Scribe becomes the source of spoken words, word boundaries, confidence, and speaker changes. Gemini remains responsible for scene understanding, Khmer translation, vocabulary, grammar, CEFR level, explanations, and narration planning.

Administrators process each upload once. The approved synchronization document is saved. Student playback reads that saved document locally, so play, replay, seeking, and many simultaneous students create no ElevenLabs or Gemini calls.

```text
Admin upload
  -> audio extraction
  -> ElevenLabs: words + exact timings + speakers
  -> Gemini: teaching content + scene understanding
  -> one canonical sync document
  -> review and approval
  -> publish
  -> students stream video and read saved timing only
```

## Why this fits the existing app
The audit found that most of the required system is already strong and should be preserved:
- Author Studio already has upload, staged processing, synchronization review, manual corrections, approval, publishing, and analytics.
- Student playback already makes no AI calls.
- The karaoke engine already uses the real media clock, frame-level updates, binary-search word lookup, seek/replay recovery, auto-follow, speaker modes, and reduced-motion support.
- Approved timing is already protected: reprocessing creates a candidate and cannot silently replace what students see.
- Purchases, progress, bookmarks, notes, narration, media storage, and Gemini learning features are separate from timing.

The failure is isolated to the present two-pass Gemini timing path, where measured words are merged onto an independently generated transcript and unmatched words fall back to estimated spacing.

## Backend transformation

### 1. Promote the existing ElevenLabs adapter
- Harden the existing Scribe provider rather than introducing a parallel synchronization system.
- Keep `ELEVENLABS_API_KEY` on the server only.
- Use word-level timestamps, diarization, language detection, and confidence from Scribe.
- Add bounded timeouts, safe retries, current file-size/duration checks, and sanitized errors.

### 2. Make Scribe the speech source of truth
- Build the canonical word stream directly from Scribe so every accepted word keeps its measured start and end.
- Preserve the current `paragraphs -> sentences -> words` document contract.
- Derive sentence and paragraph bounds from their words; never let a sentence boundary disagree with its contained words.
- Retain stable sentence IDs so Gemini translations and learning annotations can attach without changing timing.
- Use Gemini after timing exists to organize and enrich the lesson, never to overwrite Scribe word boundaries.

### 3. Preserve compatibility and approved content
- Existing Gemini-timed lessons continue to work unchanged.
- New lessons use ElevenLabs when enabled.
- Reprocessing an approved lesson continues to create a candidate version requiring explicit approval.
- Store provider version, generated time, alignment version, detected language, speaker count, word count, and confidence summary.
- Keep all unrelated endpoints, storage, authentication, purchases, progress, bookmarks, notes, analytics, and narration behavior untouched.

### 4. Honest failure policy
- A failed Scribe call must not be presented as precise synchronization.
- Keep the lesson in an administrator-visible **Timing needs attention** state.
- Let the administrator retry or deliberately continue with clearly labeled estimated timing.
- Never silently publish estimated timing as measured.

## Author Studio improvements
- Replace the single “Gemini processing” story with truthful stages: **Speech & timing**, **Speaker detection**, **Teaching analysis**, and **Ready for review**.
- Show measured-word coverage, low-confidence words, speaker count, language, duration agreement, provider, and version.
- Keep the current drag timing controls, speaker relabeling, split/merge, undo/redo, preview, and approval flow.
- Add low-confidence filtering and tap-to-replay for a selected word or sentence.
- Add an explicit **Regenerate timing** action with cost confirmation. Refreshing, previewing, publishing, and student playback must never call Scribe.

## Student mobile experience
Build on the current Teleprompter and clock engine rather than rewriting them.

- Keep the video and current words visible together on common phone heights.
- Use a cinematic focus area for the current sentence, with previous and next lines softened for context.
- Give every word a stable box footprint so highlights never cause text movement.
- Use a restrained luminous active-word treatment, a completed-word state, and quiet upcoming words.
- Show a compact active-speaker marker with accessible, consistent speaker colors.
- Make words tappable to seek and replay from their measured boundary.
- Keep sentence replay, five-second rewind, playback speed, translation reveal, font size, line spacing, auto-follow, and original/narration audio controls thumb-reachable.
- Show **Audio-synced** only for approved measured timing; legacy fallback lessons show **Estimated timing**.
- Preserve grammar, vocabulary, notes, purchases, bookmarks, progress, and all other lesson views.
- Support safe areas, portrait and landscape, rotation, screen lock/resume, slow connections, long transcripts, and reduced motion.

## Cost controls
- Save an audio fingerprint plus alignment settings and reuse an existing successful result when both match.
- Keep the current atomic per-lesson claim so double taps or simultaneous administrators cannot create duplicate calls.
- Record one call ledger entry per processing attempt with duration, status, model, and administrator—never credentials.
- Add configurable upload-size and video-duration limits.
- Enforce an import-boundary test proving no student endpoint can reach the ElevenLabs provider.

## Verification
- Provider tests: punctuation, multiple speakers, silence, overlapping speech, Khmer/English, malformed times, low confidence, and empty audio.
- Pipeline tests: exactly one Scribe call per explicit run and zero calls from student playback.
- Safety tests: candidate approval/rejection, manual corrections, legacy documents, and honest fallback labels.
- Player tests: play, pause, seek, replay, speed changes, background/resume, word tap, speaker transitions, and long transcripts.
- Real-video validation: compare visible word activation against speech on representative iPhone and Android sizes before rollout.

## Rollout
1. Add ElevenLabs support behind a server setting; leave current playback unchanged.
2. Validate a private sample set against the current Gemini timing.
3. Enable Scribe for newly processed lessons.
4. Release the improved Author Studio quality controls.
5. Release the refined student karaoke presentation after real-phone testing.
6. Reprocess older lessons individually only when an administrator chooses; never run a surprise batch migration.

## Expected result
Administrators upload once, receive measured speaker-aware timing plus Gemini teaching content, review it, and publish it. Students receive an elegant word-synchronized lesson that can be replayed by any class size without recurring AI cost.
