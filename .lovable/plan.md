# Premium Video Library Dashboard

## Goal
Apply the approved mobile mockup to the existing Video Library discovery screen without changing teleprompter timing, speaker labels, lesson APIs, purchases, coupons, or navigation.

## Build
- Recompose the dashboard header into the mockup’s strong Video Library identity, personalized prompt, search, and compact discovery controls.
- Upgrade the real next lesson into a cinematic, progress-aware feature using only existing lesson data.
- Add an adaptive-path summary derived from existing progress and lesson metadata; hide unavailable insights rather than inventing data.
- Restyle lesson rails and cards into the mockup’s image-forward discovery layout while preserving every current filter, category, ownership, duration, sync, and progress state.
- Preserve loading, empty, error, voucher, purchased lesson, bookmark, recommendation, and restricted-points behavior.

## Safety and verification
- Do not edit the player, word-highlighting hooks, synchronization data, speaker handling, backend, or API files.
- Update dashboard tests for the redesigned surface while retaining all existing behavior assertions.
- Run the focused Video Library tests, then visually check the mobile dashboard at the approved phone size for clipping, readable text, stable controls, and empty/loading states.

## Technical details
- Scope changes to `VideoLibraryDashboard.jsx`, `LessonCard.jsx`, `videoLibrary.css`, and their dashboard/card tests only.
- Reuse current icons and assets delivered by lesson thumbnails; no new service or package is introduced.
