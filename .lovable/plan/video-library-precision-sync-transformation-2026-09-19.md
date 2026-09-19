# Video Library Precision Sync Transformation

## Goal
Upgrade the existing Video Library without replacing its proven architecture: ElevenLabs becomes the one-time speech and word-timing authority, Gemini remains the learning-analysis engine, and the student karaoke experience becomes more polished, mobile-first, and curiosity-driven.

## What stays intact
- Current CRA PWA, FastAPI/Render backend, MongoDB data, storage, authentication, purchases, progress, notes, analytics, narration, publishing, and admin permissions.
- Existing canonical `paragraphs → sentences → words` synchronization document.
- Existing Author Studio, Sync Review Studio, approval/candidate workflow, manual correction tools, and student player.
- Gemini-generated translation, vocabulary, grammar, CEFR, summaries, explanations, scene understanding, and narration planning.

## Implementation

### 1. Make ElevenLabs the timing authority
- Activate the existing server-side Scribe provider for transcript text, measured word start/end times, language detection, confidence, and speaker diarization.
- Call ElevenLabs only during an explicit admin processing or regeneration action.
- Validate every returned word for non-negative, increasing timestamps before persistence.
- Keep a feature flag for temporary Gemini timing rollback.
- If ElevenLabs is unavailable, retain the current estimated timing but label it honestly and prevent publication as precision-synced unless an admin explicitly accepts it.

### 2. Preserve the data contract and review safety
- Normalize Scribe output into the existing synchronization schema rather than changing student-facing APIs.
- Continue staging reprocessed results as a candidate when an approved version exists.
- Require admin review and approval before the candidate replaces the published synchronization document.
- Keep provider, model, measured/estimated provenance, language, confidence, processing time, and word counts in metadata.

### 3. Keep Gemini focused on teaching intelligence
- Send the persisted transcript to Gemini after speech processing.
- Preserve grammar explanations, translations, keywords, phrasal verbs, summaries, lesson notes, CEFR analysis, and scene/story enrichment.
- Do not let Gemini rewrite measured timestamps.

### 4. Improve the Author Studio experience
- Rename Gemini-centric pipeline labels to clearly separate “ElevenLabs speech & word timing” from “Gemini teaching analysis.”
- Show measured versus estimated timing, detected speakers, language, low-confidence words, duration, and provider status.
- Add clear Process, Regenerate Timing, Review Candidate, Approve, Reject, and Publish states.
- Add duration/cost confirmation before paid reprocessing and prevent duplicate submissions for the same media fingerprint.

### 5. Elevate the mobile student karaoke player
- Build on the existing media-clock, binary-search, auto-follow, focus-zone, reduced-motion, and tap-to-seek engine rather than rewriting it.
- Present the current phrase in a focused reading zone with stable word footprints, warm active-word glow, speaker-aware accents, and smooth sentence transitions.
- Keep upcoming context visible but visually quieter; optionally show Khmer beneath the active English sentence.
- Show a compact “Audio-synced” indicator for measured timing and a truthful “Estimated timing” state otherwise.
- Preserve accessibility, reduced motion, responsive layouts, replay, seeking, and playback-speed behavior.

### 6. Guarantee low-cost student playback
- Persist one approved synchronization document with the lesson.
- Student playback reads only the saved video and timing JSON; it must never import or call ElevenLabs or Gemini.
- Unlimited students and replays create no additional AI processing charge.
- Regeneration is admin-only and explicitly initiated.

## Technical safeguards
- Environment: `ELEVENLABS_API_KEY`, `ELEVENLABS_SCRIBE_MODEL=scribe_v2`, `VIDEO_ALIGNMENT_PROVIDER=elevenlabs`, existing `GEMINI_API_KEY`.
- Add duration/file-size guards, request timeout handling, idempotency keys, media fingerprints, and exactly-once processing tests.
- Preserve chronology validation, approved-version protection, and student-serving gates.
- Keep old Gemini-timed lessons readable without forced migration; reprocess only when an admin chooses.

## Verification
- Provider fixtures for English, Khmer, punctuation, malformed spans, speaker changes, silence, and low-confidence speech.
- Pipeline tests proving one provider call per admin run and candidate protection for approved content.
- Static and runtime tests proving student routes make zero AI calls.
- Frontend tests for measured/estimated modes, speaker transitions, seeking, speed changes, mobile focus behavior, reduced motion, and accessibility.
- Final live acceptance test on one real classroom video before broad rollout.

## Delivery sequence
1. Backend provider activation and schema-safe persistence.
2. Admin pipeline labels, quality controls, and candidate review.
3. Mobile karaoke visual refinement.
4. Automated regression and no-playback-cost verification.
5. Staged rollout behind the provider flag, then production enablement after one approved real-video test.
