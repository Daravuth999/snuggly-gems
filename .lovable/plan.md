# Classroom mode: publish a video to students

Short answer to your cost question: **yes, this is possible with zero extra cost per student.**

The word timings are measured once, by the admin, and saved in the database. When a
student presses play, their phone just reads those saved numbers and lights up the
words. No voice service is called during playback — not once, not per student. A
hundred students can replay the same video all day and it costs nothing extra.

## What gets built

### 1. Admin side (existing studio, one new step)

Each video gets a **Publish to class** switch:
- A short lesson title and optional instruction line for students.
- Publish is only allowed once the word timings exist, so a student never lands on
  a lesson with nothing highlighted.
- Unpublish pulls it back instantly.

### 2. Student side (new, no sign-in)

A simple public area:
- `/learn` — a clean list of published lessons (cover, title, length).
- `/learn/:id` — the video with the karaoke teleprompter under it: each word glows
  exactly as it is spoken, tap any word to replay from that moment, plus a
  speaker-labelled transcript and the subtitle download.

Students need no account and see no admin controls. Unpublished videos are invisible.

### 3. Costs at playback: none

- Word timings, transcript and narration are stored in the database at publish time.
- Playback reads from the database only.
- No ElevenLabs, no AI call, no transcription is triggered by a student.
- The only ongoing cost is normal video bandwidth, which is part of the plan.

## Technical notes

- `videos` gains `is_published boolean default false`, `published_at`, `lesson_title`,
  `lesson_note`.
- New RLS: `TO anon SELECT` on `videos`, `transcript_words`, `transcript_cues`
  limited to rows where the video is published. Admin policies stay as they are.
- Public reads go through a `createServerFn` using the server publishable key —
  never the admin key — projecting only safe columns.
- The `studio` storage bucket stays private. The public lesson server function mints
  a short-lived signed playback URL per page load (free, no third-party call).
- `KaraokePrompter` is reused as-is by the student page; no duplicate logic.
- Student routes are public (top-level, SSR on); the studio stays under
  `_authenticated`.

## Verification

Sign in as admin, publish a video, then open the student page in a fresh
signed-out session and confirm playback plus word-by-word highlighting work with
no ElevenLabs call in the network log.
