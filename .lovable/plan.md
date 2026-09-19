# V3 Cinematic Focus Transformation

## Goal
Transform the existing Video Library, student player, karaoke teleprompter, and author preview into a premium mobile-first learning experience while preserving ElevenLabs timing, Gemini learning content, publishing, saved lesson data, and zero-cost student replay.

## Implementation
1. **Design foundation**
   - Introduce a cohesive cinematic palette, typography hierarchy, surfaces, and shared motion rules for the Video Library experience.
   - Replace scattered teleprompter presentation values with reusable visual tokens while keeping existing application styling outside this feature unchanged.

2. **Video Library discovery**
   - Add a prominent featured lesson and stronger hierarchy for continue-learning, recommended, and category collections.
   - Improve lesson cards with progress, duration, difficulty, speaker, and precision-sync signals using existing lesson data only.
   - Rework narrow-screen headers and filters for deliberate mobile composition rather than wrapping desktop rows.

3. **Cinematic student player**
   - Recompose mobile playback so the video remains visible and the reading surface receives the remaining viewport.
   - Simplify controls into a clear primary playback layer and contextual secondary controls.
   - Preserve original/narrated audio switching, chapters, progress reporting, bookmarking, fullscreen, and all existing media diagnostics.

4. **Premium karaoke teleprompter**
   - Build a stable three-layer focus zone: previous context, active sentence, and upcoming context.
   - Add duration-aware active-word illumination without changing word dimensions or timing calculations.
   - Add clear conversation, focus, and script-oriented presentation while preserving confidence-tier honesty and speaker identity.
   - Restore transcript search, sentence replay/loop, and bookmark access within the teleprompter experience.
   - Add contextual translation and learning-detail reveals without changing Gemini-produced data.

5. **Settings and author experience**
   - Replace the flat settings list with Shadow, Understand, Challenge, and Custom presets plus grouped advanced controls.
   - Surface cinematic focus directly.
   - Upgrade the Author Studio preview and synchronization review presentation, including clearer measured/estimated status and touch-friendly timing controls, while preserving its editing actions and APIs.

6. **Accessibility and performance**
   - Provide coherent sentence-level screen-reader output, visible keyboard focus, reduced-motion behavior, safe-area support, and non-color-only confidence cues.
   - Preserve media-clock authority, per-sentence subscriptions, memoization, and bounded internal scrolling; optimize long transcripts if measured testing shows it is necessary.

7. **Verification and V3 delivery**
   - Extend focused tests for modes, search, looping, accessibility, seek/pause/rate changes, and existing data compatibility.
   - Run relevant frontend and backend timing tests, then inspect the real interface at mobile and desktop sizes.
   - Package only required changed files plus README, exact manifest, checksums, apply order, rollback steps, and acceptance checklist into one `V3` ZIP.

## Non-negotiable compatibility
- ElevenLabs remains the one-time measured timing and speaker source.
- Gemini remains responsible for translation, grammar, vocabulary, explanations, and other educational analysis.
- Student playback reads persisted timing and makes no AI calls.
- Existing lesson IDs, synchronization structure, routes, media references, publishing behavior, and API contracts remain compatible unless a verified defect requires a documented migration.
- Unrelated PWA areas are not redesigned or changed.
