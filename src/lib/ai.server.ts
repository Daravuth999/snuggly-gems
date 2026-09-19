// Server-only helpers for the Lovable AI Gateway.

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

export function apiKey(): string {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return key;
}

/**
 * Streaming call to the Responses API; returns the accumulated output text.
 * `schema` (when given) forces strict JSON output.
 */
export async function askModel(
  prompt: string,
  schema?: { name: string; schema: Record<string, unknown> },
): Promise<string> {
  const body: Record<string, unknown> = {
    model: "openai/gpt-6-astra",
    input: prompt,
    stream: true,
    reasoning: { effort: "low", summary: "auto" },
    include: ["reasoning.encrypted_content"],
  };
  if (schema) {
    body["text"] = {
      format: { type: "json_schema", name: schema.name, strict: true, schema: schema.schema },
    };
  }

  const res = await fetch(`${GATEWAY}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey(),
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    throw new Error(`AI request failed: ${res.status} ${await res.text().catch(() => "")}`);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let out = "";
  let final = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      for (const line of part.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;
        let evt: { type?: string; delta?: string; response?: { output_text?: string } };
        try {
          evt = JSON.parse(raw);
        } catch {
          continue;
        }
        if (evt.type === "response.output_text.delta" && evt.delta) out += evt.delta;
        if (evt.type === "response.completed" && evt.response?.output_text) {
          final = evt.response.output_text;
        }
      }
    }
  }
  return (out || final).trim();
}

/** Transcribe a single audio segment. Returns plain text. */
export async function transcribeAudio(bytes: Uint8Array, language?: string): Promise<string> {
  const form = new FormData();
  form.append("model", "google/gemini-3.5-transcribe");
  form.append("file", new Blob([bytes as BlobPart], { type: "audio/wav" }), "segment.wav");
  if (language) form.append("language", language);

  const res = await fetch(`${GATEWAY}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Transcription failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}

/** Text-to-speech. Returns WAV bytes. */
export async function synthesizeSpeech(prompt: string, voice: string): Promise<Uint8Array> {
  const res = await fetch(`${GATEWAY}/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      model: "google/gemini-3.1-flash-tts-preview",
      stream_format: "audio",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Voice generation failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

/** Duration in milliseconds of a PCM WAV buffer. */
export function wavDurationMs(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let byteRate = 0;
  while (offset + 8 <= bytes.byteLength) {
    const id = String.fromCharCode(
      bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!,
    );
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt ") byteRate = view.getUint32(offset + 16, true);
    if (id === "data" && byteRate > 0) return Math.round((size / byteRate) * 1000);
    offset += 8 + size + (size % 2);
  }
  return 0;
}
