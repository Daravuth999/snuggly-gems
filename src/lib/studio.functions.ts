import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type Cue = {
  idx: number;
  start_ms: number;
  end_ms: number;
  speaker: string | null;
  text: string;
};

export type NarrationLine = {
  idx: number;
  start_ms: number;
  end_ms: number;
  language: string;
  text: string;
  audio_path: string | null;
  audio_ms: number | null;
};

export type TranscriptWord = {
  idx: number;
  cue_idx: number | null;
  start_ms: number;
  end_ms: number;
  speaker: string | null;
  text: string;
  confidence: number | null;
};

/** Grant admin to the first ever user, or to an invited email. */
export const claimAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;
    const email = (context.claims as { email?: string } | undefined)?.email ?? null;

    const existing = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    if (existing.error) throw existing.error;

    const rows = existing.data ?? [];
    if (rows.some((r) => r.user_id === userId)) return { admin: true as const };

    let allowed = rows.length === 0;
    if (!allowed && email) {
      const invite = await supabaseAdmin
        .from("admin_invites")
        .select("email")
        .eq("email", email.toLowerCase())
        .maybeSingle();
      allowed = Boolean(invite.data);
    }
    if (!allowed) return { admin: false as const };

    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "admin" });
    if (error && error.code !== "23505") throw error;
    return { admin: true as const };
  });

export const listVideos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("videos")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const createVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        title: z.string().min(1),
        storagePath: z.string().min(1),
        durationSec: z.number().min(0),
        language: z.enum(["en", "km"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("videos")
      .insert({
        title: data.title,
        storage_path: data.storagePath,
        duration_sec: data.durationSec,
        narration_language: data.language,
        status: "uploaded",
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const getVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const video = await context.supabase.from("videos").select("*").eq("id", data.id).single();
    if (video.error) throw video.error;
    const cues = await context.supabase
      .from("transcript_cues")
      .select("*")
      .eq("video_id", data.id)
      .order("idx");
    const narration = await context.supabase
      .from("narration_lines")
      .select("*")
      .eq("video_id", data.id)
      .order("idx");
    const words = await context.supabase
      .from("transcript_words")
      .select("*")
      .eq("video_id", data.id)
      .order("idx");
    const signed = await context.supabase.storage
      .from("studio")
      .createSignedUrl(video.data.storage_path, 60 * 60 * 6);
    return {
      video: video.data,
      cues: (cues.data ?? []) as Cue[],
      narration: (narration.data ?? []) as NarrationLine[],
      words: (words.data ?? []) as TranscriptWord[],
      videoUrl: signed.data?.signedUrl ?? null,
    };
  });

export const deleteVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("videos").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/** Transcribe one measured speech segment (WAV, base64). */
export const transcribeSegment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ wavBase64: z.string().min(1), language: z.string().nullable() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { transcribeAudio } = await import("./ai.server");
    const binary = atob(data.wavBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const text = await transcribeAudio(bytes, data.language ?? undefined);
    return { text };
  });

/** Transcribe the full source with measured word timestamps and speaker detection. */
export const generateWordTimings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ videoId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const apiKey = process.env['ELEVENLABS_API_KEY'];
    if (!apiKey) throw new Error("ElevenLabs is not connected to this project.");

    const video = await context.supabase
      .from("videos")
      .select("storage_path")
      .eq("id", data.videoId)
      .single();
    if (video.error) throw video.error;

    const signed = await context.supabase.storage
      .from("studio")
      .createSignedUrl(video.data.storage_path, 60 * 60);
    if (signed.error || !signed.data?.signedUrl) {
      throw signed.error ?? new Error("Could not prepare the video for word timing.");
    }

    const form = new FormData();
    form.append("cloud_storage_url", signed.data.signedUrl);
    form.append("model_id", "scribe_v2");
    form.append("timestamps_granularity", "word");
    form.append("diarize", "true");
    form.append("tag_audio_events", "false");

    const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
    });
    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(`ElevenLabs word timing failed [${response.status}]: ${message}`);
    }

    const result = (await response.json()) as {
      words?: Array<{
        text?: string;
        type?: string;
        start?: number | null;
        end?: number | null;
        speaker_id?: string | null;
        logprob?: number | null;
      }>;
    };
    const timed = (result.words ?? []).filter(
      (word) =>
        word.type === "word" &&
        typeof word.start === "number" &&
        typeof word.end === "number" &&
        Boolean(word.text?.trim()),
    );
    if (!timed.length) throw new Error("No spoken words were detected in this video.");

    await context.supabase.from("transcript_words").delete().eq("video_id", data.videoId);
    let cueIdx = 0;
    let previousSpeaker: string | null | undefined;
    let previousEnd = 0;
    const rows = timed.map((word, idx) => {
      const speaker = word.speaker_id ?? null;
      const startMs = Math.round((word.start ?? 0) * 1000);
      if (idx > 0 && (speaker !== previousSpeaker || startMs - previousEnd > 800)) cueIdx++;
      previousSpeaker = speaker;
      previousEnd = Math.round((word.end ?? word.start ?? 0) * 1000);
      return {
        video_id: data.videoId,
        cue_idx: cueIdx,
        idx,
        start_ms: startMs,
        end_ms: previousEnd,
        speaker,
        text: word.text?.trim() ?? "",
        confidence: typeof word.logprob === "number" ? word.logprob : null,
      };
    });
    const inserted = await context.supabase.from("transcript_words").insert(rows);
    if (inserted.error) throw inserted.error;
    return { words: rows as TranscriptWord[] };
  });

/** Save measured cues, then label who is speaking in each one. */
export const saveTranscript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        videoId: z.string().uuid(),
        durationSec: z.number().min(0),
        cues: z.array(
          z.object({ start_ms: z.number(), end_ms: z.number(), text: z.string() }),
        ),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { askModel } = await import("./ai.server");

    const numbered = data.cues.map((c, i) => `${i + 1}. ${c.text}`).join("\n");
    let speakers: string[] = [];
    if (data.cues.length > 0) {
      const raw = await askModel(
        `These are the transcript lines of a video, in order. Decide who speaks each line. ` +
          `Use short consistent labels such as "Speaker 1", "Speaker 2", or "Narrator" when one voice ` +
          `tells the whole story. Return one label per line, in the same order.\n\n${numbered}`,
        {
          name: "speaker_labels",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["labels"],
            properties: { labels: { type: "array", items: { type: "string" } } },
          },
        },
      );
      try {
        speakers = (JSON.parse(raw) as { labels: string[] }).labels ?? [];
      } catch {
        speakers = [];
      }
    }

    await context.supabase.from("transcript_cues").delete().eq("video_id", data.videoId);
    const rows = data.cues.map((c, i) => ({
      video_id: data.videoId,
      idx: i,
      start_ms: Math.round(c.start_ms),
      end_ms: Math.round(c.end_ms),
      speaker: speakers[i] ?? null,
      text: c.text,
    }));
    if (rows.length) {
      const { error } = await context.supabase.from("transcript_cues").insert(rows);
      if (error) throw error;
    }
    await context.supabase
      .from("videos")
      .update({ status: "transcribed", duration_sec: data.durationSec })
      .eq("id", data.videoId);
    return { cues: rows as Cue[] };
  });

/** Write scene-by-scene narration covering the whole video. */
export const generateNarration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ videoId: z.string().uuid(), language: z.enum(["en", "km"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { askModel } = await import("./ai.server");

    const video = await context.supabase
      .from("videos")
      .select("*")
      .eq("id", data.videoId)
      .single();
    if (video.error) throw video.error;
    const cues = await context.supabase
      .from("transcript_cues")
      .select("*")
      .eq("video_id", data.videoId)
      .order("idx");

    const source = (cues.data ?? [])
      .map(
        (c) =>
          `[${(c.start_ms / 1000).toFixed(1)}-${(c.end_ms / 1000).toFixed(1)}s] ${
            c.speaker ? `${c.speaker}: ` : ""
          }${c.text}`,
      )
      .join("\n");
    const duration = Number(video.data.duration_sec ?? 0);
    const langName = data.language === "km" ? "Khmer (ភាសាខ្មែរ)" : "English";

    const raw = await askModel(
      `You are writing a replacement voice-over for a ${duration.toFixed(
        0,
      )} second video. Here is what is said in the original audio, with timings:\n\n${source}\n\n` +
        `Write cinematic narration in ${langName} that replaces the original audio completely. ` +
        `Split it into lines that each fit inside a time slot. Cover the whole ${duration.toFixed(
          0,
        )} seconds from 0 with no gaps longer than a few seconds and no overlaps. ` +
        `Keep each line short enough to be spoken naturally inside its slot (about 2.5 words per second). ` +
        `Do not invent events that are not supported by the source. Times are in milliseconds.`,
      {
        name: "narration_script",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["lines"],
          properties: {
            lines: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["start_ms", "end_ms", "text"],
                properties: {
                  start_ms: { type: "number" },
                  end_ms: { type: "number" },
                  text: { type: "string" },
                },
              },
            },
          },
        },
      },
    );

    let lines: { start_ms: number; end_ms: number; text: string }[] = [];
    try {
      lines = (JSON.parse(raw) as { lines: typeof lines }).lines ?? [];
    } catch {
      throw new Error("The AI returned an unreadable narration script. Try again.");
    }

    await context.supabase.from("narration_lines").delete().eq("video_id", data.videoId);
    const rows = lines.map((l, i) => ({
      video_id: data.videoId,
      idx: i,
      start_ms: Math.round(l.start_ms),
      end_ms: Math.round(l.end_ms),
      language: data.language,
      text: l.text,
      audio_path: null as string | null,
      audio_ms: null as number | null,
    }));
    if (rows.length) {
      const { error } = await context.supabase.from("narration_lines").insert(rows);
      if (error) throw error;
    }
    await context.supabase
      .from("videos")
      .update({ status: "scripted", narration_language: data.language })
      .eq("id", data.videoId);
    return { lines: rows as NarrationLine[] };
  });

/** Generate the voice audio for a single narration line. */
export const synthesizeLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ videoId: z.string().uuid(), idx: z.number().int().min(0) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { synthesizeSpeech, wavDurationMs } = await import("./ai.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const line = await context.supabase
      .from("narration_lines")
      .select("*")
      .eq("video_id", data.videoId)
      .eq("idx", data.idx)
      .single();
    if (line.error) throw line.error;

    const km = line.data.language === "km";
    const prompt = km
      ? `សូមនិទានតែប្រយោគនេះជាភាសាខ្មែរ ដោយសំឡេងកក់ក្តៅ រឹងមាំ ធម្មជាតិ និងអារម្មណ៍បែបភាពយន្ត។ និយាយច្បាស់ ហើយកុំបន្ថែមអ្វី៖ ${line.data.text}`
      : `Narrate this line in a warm, confident, natural cinematic storyteller voice. Speak clearly and add nothing extra: ${line.data.text}`;

    const wav = await synthesizeSpeech(prompt, "Sulafat");
    const path = `${data.videoId}/narration/${String(data.idx).padStart(3, "0")}.wav`;
    const up = await supabaseAdmin.storage
      .from("studio")
      .upload(path, wav as unknown as ArrayBufferView, {
        contentType: "audio/wav",
        upsert: true,
      });
    if (up.error) throw up.error;

    const ms = wavDurationMs(wav);
    const { error } = await context.supabase
      .from("narration_lines")
      .update({ audio_path: path, audio_ms: ms })
      .eq("video_id", data.videoId)
      .eq("idx", data.idx);
    if (error) throw error;
    return { idx: data.idx, audio_path: path, audio_ms: ms };
  });

/** Signed URLs for generated narration audio. */
export const signAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ paths: z.array(z.string()) }).parse(input))
  .handler(async ({ data, context }) => {
    if (!data.paths.length) return { urls: {} as Record<string, string> };
    const { data: signed, error } = await context.supabase.storage
      .from("studio")
      .createSignedUrls(data.paths, 60 * 60 * 6);
    if (error) throw error;
    const urls: Record<string, string> = {};
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls[s.path] = s.signedUrl;
    return { urls };
  });
