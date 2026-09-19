"""sync_provider.py — Universal Synchronization Engine, provider boundary
(Phase 0 — Universal Synchronization Foundation).

Defines the provider "interface" by convention (this codebase does not use
typing.Protocol/ABC elsewhere — register_*_routes modules take plain
injected functions instead, e.g. server.py's
`run_elevenlabs_for_chapter=run_elevenlabs_for_chapter`; providers here
follow the same duck-typed convention: `category`, `provider_version`,
async `synthesize(text, voice_id)`, async `align(audio_bytes, transcript)`,
each returning a dict shaped `{"sync": <sync_schema.py document>, ...}`.

Per tech spec §3, a provider is identified by CAPABILITY CATEGORY, never a
vendor name — nothing outside a provider implementation ever sees ElevenLabs
(or any future vendor) directly. `category` is one of
sync_schema.VALID_PROVIDER_CATEGORIES.

ElevenLabsProvider below wraps server.py's existing, already-shipping
`_elevenlabs_generate` (verified at server.py:505 — returns
`{audio_base64, word_timestamps}`) by RESHAPING its output into the
canonical schema at the boundary. It is injected the underlying function,
matching this codebase's existing DI convention, rather than importing
server.py directly (server.py imports its siblings, never the reverse —
importing it back would be circular).

`ElevenLabsProvider` remains the existing TTS adapter. Uploaded media uses
the separate `ScribeAlignmentProvider`, which performs one authoring-time
Scribe v2 transcription and normalizes measured words into the canonical
sync schema. Student playback never calls either provider.
"""
from __future__ import annotations

import datetime as _dt
import math

from sync_schema import build_confidence, build_paragraph, build_sentence, build_sync_document, build_word


def _utc_now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def reshape_elevenlabs_word_timestamps(word_timestamps: list[dict]) -> dict:
    """Pure reshape: server.py's existing `word_timestamps` list
    (`[{word, start, end}, ...]`, produced today by both
    `_elevenlabs_generate` and `_elevenlabs_generate_line`) into the
    canonical schema. A free function (not a method) so both
    ElevenLabsProvider.synthesize() and a backfill route in
    sync_studio_tools.py (adapting ALREADY-generated narration into a sync
    document, per tech spec §11's "thin adapter at read time") can call it
    without needing a live provider instance.
    """
    words = [
        build_word(
            w.get("word", ""), w.get("start", 0.0), w.get("end", 0.0),
            # transcript=1.0 is honest here, not fabricated: this is the
            # exact author-authored text ElevenLabs was told to speak, not a
            # speech-recognition guess. alignment=None because the
            # ElevenLabs API returns no alignment-quality score at all —
            # None is the honest "unknown", never defaulted to 1.0.
            confidence=build_confidence(transcript=1.0, alignment=None),
        )
        for w in (word_timestamps or [])
        if w.get("word")
    ]
    # Phase 0 does not attempt sentence/paragraph segmentation (that is
    # Phase 3 of the roadmap, per smart-books-engine-architecture-study
    # §10) — server.py's existing narration data carries no sentence
    # boundaries, so wrapping every word in one sentence/paragraph is the
    # accurate reflection of what data actually exists today, rather than
    # fabricating split points from punctuation guesses.
    sentence = build_sentence("s1", words)
    paragraph = build_paragraph("p1", [sentence])
    duration = words[-1]["end"] if words else 0.0
    return build_sync_document(
        media_ref="",  # filled in by the caller once the audio itself is stored (R2/GridFS)
        provider_category="synthesis",
        provider_version=ElevenLabsProvider.provider_version,
        paragraphs=[paragraph],
        generated_at=_utc_now_iso(),
        duration_sec=duration,
    )


class ElevenLabsProvider:
    """Reshaping adapter over the existing, working ElevenLabs TTS pipeline.
    Not a new vendor integration — every network call still happens inside
    the injected `elevenlabs_generate` function exactly as it does today."""

    category = "synthesis"
    provider_version = "elevenlabs-tts-with-timestamps"

    def __init__(self, elevenlabs_generate):
        if elevenlabs_generate is None:
            raise ValueError("ElevenLabsProvider requires elevenlabs_generate")
        self._generate = elevenlabs_generate

    async def synthesize(self, text: str, voice_id: str) -> dict:
        """Generate audio FROM text — what server.py's Book Factory
        narration path already does. Returns
        {"audio_base64": str, "sync": <canonical schema, sync_schema.py>}."""
        raw = await self._generate(text, voice_id)
        return {
            "audio_base64": raw.get("audio_base64", ""),
            "sync": reshape_elevenlabs_word_timestamps(raw.get("word_timestamps")),
        }

    async def align(self, audio_bytes: bytes, transcript: str | None = None) -> dict:
        raise NotImplementedError(
            "ElevenLabsProvider wraps the TTS-with-timestamps endpoint only "
            "and cannot force-align pre-existing/uploaded audio. Native "
            "audio/video upload requires a separate Speech Recognition + "
            "Alignment provider — vendor deliberately not yet chosen "
            "(tech spec §12)."
        )


def _group_by_speaker_turn(word_entries: list[tuple[dict, str | None]]) -> list[dict]:
    """Group measured words at speaker changes and terminal punctuation."""
    sentences: list[dict] = []
    current_words: list[dict] = []
    current_speaker: object = object()  # sentinel, unequal to any real id or None
    turn_index = 0

    def _flush():
        nonlocal turn_index
        if not current_words:
            return
        turn_index += 1
        sentences.append(build_sentence(f"s{turn_index}", list(current_words), speaker_id=current_speaker))

    for word, speaker_id in word_entries:
        speaker_changed = speaker_id != current_speaker and current_words
        previous_ended_sentence = bool(current_words) and str(current_words[-1].get("word") or "").rstrip().endswith(
            (".", "?", "!", "。", "៕")
        )
        if speaker_changed or previous_ended_sentence:
            _flush()
            current_words = []
        current_speaker = speaker_id
        current_words.append(word)
    _flush()
    return sentences


class ScribeAlignmentProvider:
    """Production uploaded-media speech and timing provider using Scribe v2.

    Confirmed response shape: {"language_code", "language_probability",
    "text", "words": [{"text","start","end","type","speaker_id","logprob"}]}.
    Two real, confirmed capability gaps versus the SyncProvider interface's
    ideal — surfaced here, not hidden:
      1. Confidence arrives as `logprob` (a LOG-probability, range -inf..0),
         never a 0-1 score. Converted via math.exp(logprob) at the boundary
         so the canonical schema's confidence contract (0-1 float or None)
         never leaks a vendor-specific unit to any consumer.
      2. Scribe's endpoint always performs full speech recognition; it does
         NOT accept a reference transcript for forced alignment, so the
         `transcript` parameter (present for interface compatibility with
         a future forced-alignment-capable provider) is accepted but unused.
    """

    category = "speech_recognition"
    provider_version = "elevenlabs-scribe-v2"

    def __init__(self, api_key: str, *, model_id: str = "scribe_v2", http_post=None):
        if not api_key:
            raise ValueError("ScribeAlignmentProvider requires an ElevenLabs api_key")
        self._api_key = api_key
        self._model_id = model_id
        # Injectable for testing — no real network call in unit tests.
        # Defaults to a real httpx call, matching server.py's own
        # _elevenlabs_generate pattern (raw REST, no vendor SDK dependency).
        self._uses_default_http = http_post is None
        self._http_post = http_post or self._real_http_post

    async def _real_http_post(self, audio_bytes: bytes, language_code: str | None,
                              content_type: str | None = None) -> dict:
        import httpx

        headers = {"xi-api-key": self._api_key}
        data = {
            "model_id": self._model_id,
            "diarize": "true",
            "tag_audio_events": "true",
        }
        if language_code:
            data["language_code"] = language_code
        mime = content_type or "audio/mpeg"
        extension = "mp4" if "mp4" in mime else "webm" if "webm" in mime else "wav" if "wav" in mime else "mp3"
        files = {"file": (f"media.{extension}", audio_bytes, mime)}
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0)) as cli:
            r = await cli.post(
                "https://api.elevenlabs.io/v1/speech-to-text",
                headers=headers, data=data, files=files,
            )
            if r.status_code != 200:
                raise RuntimeError(f"ElevenLabs Scribe error {r.status_code}: {r.text[:300]}")
            return r.json()

    async def synthesize(self, text: str, voice_id: str) -> dict:
        raise NotImplementedError(
            "ScribeAlignmentProvider is speech-recognition/alignment only "
            "and has no text-to-speech capability."
        )

    async def align(self, audio_bytes: bytes, transcript: str | None = None, *,
                    language_code: str | None = None, content_type: str | None = None) -> dict:
        if not audio_bytes:
            raise ValueError("ScribeAlignmentProvider requires non-empty audio")
        raw = await (
            self._http_post(audio_bytes, language_code, content_type)
            if self._uses_default_http else self._http_post(audio_bytes, language_code)
        )
        return {
            "raw": raw,
            "sync": self._reshape(raw),
            "transcriptText": str(raw.get("text") or "").strip(),
            "languageCode": raw.get("language_code"),
            "languageProbability": raw.get("language_probability"),
        }

    def _reshape(self, raw: dict) -> dict:
        word_entries: list[tuple[dict, str | None]] = []
        last_start = -1.0
        for w in raw.get("words") or []:
            if w.get("type") != "word":
                continue  # skip "spacing"/"audio_event" entries — not text content
            text = str(w.get("text") or "").strip()
            try:
                start = float(w.get("start"))
                end = float(w.get("end"))
            except (TypeError, ValueError):
                continue
            if not text or start < 0 or end < start or start < last_start - 0.01:
                continue
            last_start = start
            logprob = w.get("logprob")
            transcript_confidence = math.exp(logprob) if isinstance(logprob, (int, float)) else None
            word = build_word(text, start, end, confidence=build_confidence(transcript=transcript_confidence))
            word["measured"] = True
            word_entries.append((word, w.get("speaker_id") or w.get("speaker")))

        sentences = _group_by_speaker_turn(word_entries)
        speaker_ids = sorted({sid for _, sid in word_entries if sid})
        speakers = [{"id": sid, "label": sid} for sid in speaker_ids] or None
        paragraph = build_paragraph("p1", sentences)
        all_words = [w for w, _ in word_entries]
        duration = all_words[-1]["end"] if all_words else 0.0

        return build_sync_document(
            media_ref="",
            provider_category=self.category,
            provider_version=self.provider_version,
            paragraphs=[paragraph],
            generated_at=_utc_now_iso(),
            duration_sec=duration,
            speakers=speakers,
        )
