// Browser-side audio helpers: decode a video's audio, find real speech
// segments from the waveform, and encode them as WAV for transcription.

export type Segment = { start_ms: number; end_ms: number; wavBase64: string };

const TARGET_RATE = 16000;

function toMono16k(buffer: AudioBuffer): Float32Array {
  const channels = buffer.numberOfChannels;
  const src = buffer.getChannelData(0);
  const mixed = new Float32Array(src.length);
  mixed.set(src);
  for (let c = 1; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < mixed.length; i++) mixed[i] = (mixed[i]! + data[i]!) / 2;
  }
  const ratio = buffer.sampleRate / TARGET_RATE;
  const outLength = Math.floor(mixed.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) out[i] = mixed[Math.floor(i * ratio)]!;
  return out;
}

function encodeWav(samples: Float32Array): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, TARGET_RATE, true);
  view.setUint32(28, TARGET_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Split the audio into speech segments using measured loudness, so every
 * segment start and end comes from the waveform, never a guess.
 */
export async function extractSpeechSegments(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<{ segments: Segment[]; durationSec: number }> {
  onProgress?.("Reading the video's audio…");
  const ctx = new OfflineAudioContext(1, 1, TARGET_RATE);
  const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
  const samples = toMono16k(decoded);
  const durationSec = samples.length / TARGET_RATE;

  onProgress?.("Measuring where speech starts and stops…");
  const frame = Math.round(TARGET_RATE * 0.02); // 20ms
  const frames: number[] = [];
  for (let i = 0; i + frame <= samples.length; i += frame) {
    let sum = 0;
    for (let j = 0; j < frame; j++) {
      const v = samples[i + j]!;
      sum += v * v;
    }
    frames.push(Math.sqrt(sum / frame));
  }
  const sorted = [...frames].sort((a, b) => a - b);
  const noise = sorted[Math.floor(sorted.length * 0.2)] ?? 0;
  const peak = sorted[Math.floor(sorted.length * 0.95)] ?? 0.1;
  const threshold = Math.max(noise * 2.5, peak * 0.08, 0.004);

  const minGapFrames = Math.round(0.35 / 0.02);
  const raw: { s: number; e: number }[] = [];
  let start = -1;
  let quiet = 0;
  for (let i = 0; i < frames.length; i++) {
    if (frames[i]! > threshold) {
      if (start < 0) start = i;
      quiet = 0;
    } else if (start >= 0) {
      quiet++;
      if (quiet >= minGapFrames) {
        raw.push({ s: start, e: i - quiet });
        start = -1;
        quiet = 0;
      }
    }
  }
  if (start >= 0) raw.push({ s: start, e: frames.length - 1 });

  // Merge into cue-sized groups: gaps under 0.4s, max 7s each.
  const groups: { s: number; e: number }[] = [];
  for (const seg of raw) {
    const last = groups[groups.length - 1];
    const gap = last ? (seg.s - last.e) * 0.02 : Infinity;
    const span = last ? (seg.e - last.s) * 0.02 : 0;
    if (last && gap < 0.4 && span <= 7) last.e = seg.e;
    else groups.push({ ...seg });
  }

  onProgress?.(`Found ${groups.length} spoken parts. Preparing them…`);
  const segments: Segment[] = groups
    .filter((g) => (g.e - g.s) * 0.02 >= 0.25)
    .map((g) => {
      const startMs = Math.max(0, g.s * 20 - 80);
      const endMs = Math.min(durationSec * 1000, g.e * 20 + 180);
      const from = Math.floor((startMs / 1000) * TARGET_RATE);
      const to = Math.min(samples.length, Math.floor((endMs / 1000) * TARGET_RATE));
      return {
        start_ms: Math.round(startMs),
        end_ms: Math.round(endMs),
        wavBase64: base64(encodeWav(samples.slice(from, to))),
      };
    });

  return { segments, durationSec };
}

function stamp(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const h = String(Math.floor(total / 3600000)).padStart(2, "0");
  const m = String(Math.floor((total % 3600000) / 60000)).padStart(2, "0");
  const s = String(Math.floor((total % 60000) / 1000)).padStart(2, "0");
  const msPart = String(total % 1000).padStart(3, "0");
  return `${h}:${m}:${s},${msPart}`;
}

export function buildSrt(
  lines: { start_ms: number; end_ms: number; text: string; speaker?: string | null }[],
  withSpeakers = false,
): string {
  return lines
    .map((l, i) => {
      const label = withSpeakers && l.speaker ? `[${l.speaker}] ` : "";
      return `${i + 1}\n${stamp(l.start_ms)} --> ${stamp(l.end_ms)}\n${label}${l.text}\n`;
    })
    .join("\n");
}

export function downloadText(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
