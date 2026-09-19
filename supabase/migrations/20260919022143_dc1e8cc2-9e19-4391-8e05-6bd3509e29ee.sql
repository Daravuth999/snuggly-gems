ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS lesson_title text,
  ADD COLUMN IF NOT EXISTS lesson_note text;

CREATE INDEX IF NOT EXISTS videos_published_idx ON public.videos (is_published, published_at DESC);

GRANT SELECT ON public.videos TO anon;
GRANT SELECT ON public.transcript_cues TO anon;
GRANT SELECT ON public.transcript_words TO anon;

CREATE POLICY "published videos are public"
  ON public.videos FOR SELECT TO anon
  USING (is_published);

CREATE POLICY "published transcript is public"
  ON public.transcript_cues FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.videos v WHERE v.id = video_id AND v.is_published));

CREATE POLICY "published words are public"
  ON public.transcript_words FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.videos v WHERE v.id = video_id AND v.is_published));