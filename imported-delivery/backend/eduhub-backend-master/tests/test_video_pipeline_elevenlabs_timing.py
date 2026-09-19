"""tests/test_video_pipeline_elevenlabs_timing.py
=================================================
Covers the three defects found by the independent audit of the
ElevenLabs precision-karaoke upgrade, all caused by the ElevenLabs
branch running its OWN hand-written alignment logic instead of the
tested, provider-agnostic run_word_alignment path:

1. the VIDEO_ALIGNMENT_MAX_SECONDS duration guard was bypassed, so an
   over-long lesson was still uploaded to the paid timing provider;
2. the provider's own segmentation replaced the canonical Gemini
   paragraph/sentence structure, breaking the sentence identity the
   educational analysis (grammar, translation, keywords) is keyed to;
3. a provider failure re-ran a full second transcription call — an
   undocumented extra cost.

The fix routes EVERY provider through run_word_alignment, so measured
words are merged onto the canonical structure. These tests fail against
the pre-fix direct branch.
"""
from __future__ import annotations

import pytest

import video_pipeline_tools as vpt
import video_word_alignment as vwa

from tests.test_video_pipeline_provider_tag import _run_real_pipeline, _measured_word


class _Scribe:
    provider_version = "elevenlabs-scribe-v2 (scribe_v2, measured-words)"

    def __init__(self, *, fail: bool = False):
        self.fail = fail
        self.calls = 0

    async def align(self, audio_bytes, content_type=None, **kwargs):
        self.calls += 1
        if self.fail:
            raise RuntimeError("scribe unavailable")
        return {"sync": {"paragraphs": [{"sentences": [{"words": [_measured_word("hi", 0.02, 0.38)]}]}]}}


@pytest.mark.asyncio
async def test_elevenlabs_timing_runs_through_the_guarded_merge_path(monkeypatch):
    provider = _Scribe()
    doc = await _run_real_pipeline(monkeypatch, alignment_provider=provider)
    assert provider.calls == 1
    assert "elevenlabs-scribe-v2" in doc["pipeline"]["provider"]


@pytest.mark.asyncio
async def test_elevenlabs_failure_does_not_trigger_a_second_transcription_call(monkeypatch):
    provider = _Scribe(fail=True)
    doc = await _run_real_pipeline(monkeypatch, alignment_provider=provider)
    # exactly one attempt, and the lesson still completes on interpolated timing
    assert provider.calls == 1
    assert "alignment failed" in doc["pipeline"]["provider"]


@pytest.mark.asyncio
async def test_duration_guard_applies_to_elevenlabs_too(monkeypatch):
    """An over-long lesson must never be uploaded to the paid provider."""
    provider = _Scribe()
    monkeypatch.setattr(vwa, "MAX_ALIGNMENT_AUDIO_SECONDS", 1)
    gemini_sync = {"durationSec": 9000.0, "paragraphs": []}
    sync, telemetry = await vwa.run_word_alignment(
        b"audio", "hi", gemini_sync, "audio/mpeg", provider=provider,
    )
    assert provider.calls == 0
    assert telemetry["status"] == "skipped"
    assert sync is gemini_sync


@pytest.mark.asyncio
async def test_measured_words_are_merged_onto_the_canonical_sentence_structure():
    """Sentence ids / structure the educational analysis is keyed to must
    survive; only the word timings come from the measuring provider."""
    gemini_sync = {
        "durationSec": 1.0,
        "paragraphs": [
            {
                "id": "p1",
                "sentences": [
                    {
                        "id": "s1",
                        "speakerId": "spk_1",
                        "words": [
                            {"word": "hello", "start": 0.0, "end": 0.5},
                            {"word": "world", "start": 0.5, "end": 1.0},
                        ],
                    }
                ],
            }
        ],
    }
    merged, telemetry = vwa.merge_real_word_timing(
        gemini_sync,
        [_measured_word("hello", 0.11, 0.42), _measured_word("world", 0.55, 0.93)],
        provider_version=_Scribe.provider_version,
    )
    sentence = merged["paragraphs"][0]["sentences"][0]
    assert merged["paragraphs"][0]["id"] == "p1"
    assert sentence["id"] == "s1" and sentence["speakerId"] == "spk_1"
    assert sentence["words"][0]["start"] == pytest.approx(0.11)
    assert telemetry["status"] == "complete"
