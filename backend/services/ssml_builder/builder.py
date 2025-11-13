"""SSML builder for generating Speech Synthesis Markup Language."""

from __future__ import annotations

import html
import re

from shared.models import PronunciationLexicon, SSMLRequest


class SSMLBuilder:
    """Build SSML markup for Azure Speech Service."""

    def __init__(self, language: str = "en-US", voice: str = "en-US-AriaNeural"):
        """Initialize SSML builder with language and voice settings."""
        self.language = language
        self.voice = voice

    def build(
        self, request: SSMLRequest, lexicon: PronunciationLexicon | None = None
    ) -> str:
        """
        Build SSML markup from request.

        Args:
            request: SSML request with text and markup hints
            lexicon: Optional pronunciation lexicon to apply

        Returns:
            Complete SSML markup string
        """
        # Escape text for XML
        text = html.escape(request.text)

        # Apply pronunciation lexicon
        if lexicon:
            text = self._apply_lexicon(text, lexicon)

        # Apply emphasis to specific words
        if request.emphasis_words:
            text = self._apply_emphasis(text, request.emphasis_words)

        # Apply say-as hints
        if request.say_as_hints:
            text = self._apply_say_as(text, request.say_as_hints)

        # Apply pauses at specific positions
        if request.pauses:
            text = self._apply_pauses(text, request.pauses)

        # Wrap in prosody if rate, pitch, or volume specified
        if request.prosody_rate or request.prosody_pitch or request.prosody_volume:
            text = self._apply_prosody(
                text, request.prosody_rate, request.prosody_pitch, request.prosody_volume
            )

        # Wrap in voice and speak tags
        ssml = (
            f"<speak version='1.0' xml:lang='{self.language}' "
            f"xmlns='http://www.w3.org/2001/10/synthesis' "
            f"xmlns:mstts='https://www.w3.org/2001/mstts'>"
            f"<voice name='{self.voice}'>"
            f"{text}"
            f"</voice>"
            f"</speak>"
        )

        return ssml

    def _apply_lexicon(self, text: str, lexicon: PronunciationLexicon) -> str:
        """Apply pronunciation lexicon to text."""
        for entry in lexicon.entries:
            if entry.alias:
                # Simple text replacement
                text = text.replace(entry.grapheme, entry.alias)
            elif entry.phoneme:
                # Use phoneme tag for IPA pronunciation
                pattern = re.compile(re.escape(entry.grapheme), re.IGNORECASE)
                replacement = f"<phoneme alphabet='ipa' ph='{entry.phoneme}'>{entry.grapheme}</phoneme>"
                text = pattern.sub(replacement, text)
        return text

    def _apply_emphasis(self, text: str, emphasis_words: list[str]) -> str:
        """Apply emphasis to specific words."""
        for word in emphasis_words:
            pattern = re.compile(rf"\b{re.escape(word)}\b", re.IGNORECASE)
            replacement = f"<emphasis level='strong'>{word}</emphasis>"
            text = pattern.sub(replacement, text)
        return text

    def _apply_say_as(self, text: str, say_as_hints: dict[str, str]) -> str:
        """Apply say-as hints to text fragments."""
        for fragment, interpret_as in say_as_hints.items():
            escaped_fragment = re.escape(fragment)
            pattern = re.compile(rf"\b{escaped_fragment}\b", re.IGNORECASE)
            replacement = f"<say-as interpret-as='{interpret_as}'>{fragment}</say-as>"
            text = pattern.sub(replacement, text)
        return text

    def _apply_pauses(self, text: str, pauses: dict[int, float]) -> str:
        """Insert pauses at specific character positions."""
        # Sort pauses by position (reverse order to maintain indices)
        sorted_pauses = sorted(pauses.items(), reverse=True)
        text_list = list(text)

        for position, duration_seconds in sorted_pauses:
            if 0 <= position <= len(text_list):
                # Convert seconds to milliseconds
                duration_ms = int(duration_seconds * 1000)
                break_tag = f"<break time='{duration_ms}ms'/>"
                text_list.insert(position, break_tag)

        return "".join(text_list)

    def _apply_prosody(
        self, text: str, rate: float | None, pitch: str | None, volume: str | None
    ) -> str:
        """Wrap text in prosody tag with rate, pitch, volume adjustments."""
        attributes = []

        if rate is not None:
            # Convert rate to percentage (1.0 = 100%)
            rate_pct = f"{int(rate * 100)}%"
            attributes.append(f"rate='{rate_pct}'")

        if pitch is not None:
            attributes.append(f"pitch='{pitch}'")

        if volume is not None:
            attributes.append(f"volume='{volume}'")

        if attributes:
            attrs_str = " ".join(attributes)
            return f"<prosody {attrs_str}>{text}</prosody>"

        return text

    @staticmethod
    def create_preset(preset_name: str, text: str) -> SSMLRequest:
        """
        Create SSML request from preset.

        Available presets:
        - "news_anchor": Professional news delivery with emphasis and pauses
        - "storytelling": Engaging narrative with varied prosody
        - "technical": Clear technical explanation with slower pace
        - "casual": Conversational tone with natural pauses
        """
        presets = {
            "news_anchor": SSMLRequest(
                text=text,
                prosody_rate=1.1,
                prosody_volume="loud",
                emphasis_words=[],
            ),
            "storytelling": SSMLRequest(
                text=text,
                prosody_rate=0.95,
                prosody_pitch="+5%",
                emphasis_words=[],
            ),
            "technical": SSMLRequest(
                text=text,
                prosody_rate=0.9,
                prosody_pitch="-3%",
                prosody_volume="medium",
            ),
            "casual": SSMLRequest(
                text=text,
                prosody_rate=1.0,
                pauses={},
            ),
        }

        if preset_name not in presets:
            raise ValueError(f"Unknown preset: {preset_name}. Available: {list(presets.keys())}")

        return presets[preset_name]
