CREATE TABLE public.transcript_words (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  cue_idx integer,
  idx integer NOT NULL,
  start_ms integer NOT NULL CHECK (start_ms >= 0),
  end_ms integer NOT NULL CHECK (end_ms >= start_ms),
  speaker text,
  text text NOT NULL,
  confidence numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (video_id, idx)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transcript_words TO authenticated;
GRANT ALL ON public.transcript_words TO service_role;
ALTER TABLE public.transcript_words ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage transcript words"
ON public.transcript_words
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX transcript_words_video_start_idx ON public.transcript_words(video_id, start_ms);