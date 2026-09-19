ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS timing_status text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS timing_provider text,
  ADD COLUMN IF NOT EXISTS timing_model text,
  ADD COLUMN IF NOT EXISTS timing_generated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS timing_word_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS timing_low_confidence_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS timing_speaker_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS timing_language text,
  ADD COLUMN IF NOT EXISTS timing_error text,
  ADD COLUMN IF NOT EXISTS timing_fingerprint text;

ALTER TABLE public.transcript_words
  ADD COLUMN IF NOT EXISTS timing_source text NOT NULL DEFAULT 'estimated',
  ADD COLUMN IF NOT EXISTS measured boolean NOT NULL DEFAULT false;

ALTER TABLE public.videos
  ADD CONSTRAINT videos_timing_status_valid
  CHECK (timing_status IN ('not_started', 'processing', 'measured', 'needs_attention', 'estimated'));

ALTER TABLE public.transcript_words
  ADD CONSTRAINT transcript_words_timing_source_valid
  CHECK (timing_source IN ('elevenlabs_scribe', 'estimated', 'reviewer'));