"""Subtitle generator with speech-to-text timing alignment."""

import re
import time
from pathlib import Path

import aiohttp

from shared.config import config
from shared.models import SubtitleEntry
from shared.utils import ensure_directory, setup_logging

logger = setup_logging("subtitle-generator")


class SubtitleGenerator:
    """Generate subtitles with accurate timing using speech-to-text alignment."""

    def __init__(self):
        # Configuration for subtitle generation
        self.max_chars_per_line = config.get("subtitle_max_chars_per_line", 50)
        self.max_lines_per_subtitle = config.get("subtitle_max_lines_per_subtitle", 2)
        self.min_subtitle_duration = config.get("subtitle_min_duration", 1.0)
        self.max_subtitle_duration = config.get("subtitle_max_duration", 7.0)

        # Speech-to-text service configuration
        self.stt_provider = config.get("stt_provider", "azure")  # azure, openai, whisper
        self.azure_speech_key = config.get("azure_speech_key")
        self.azure_speech_region = config.get("azure_speech_region")

        # Temp directory for processing
        self.temp_dir = Path(config.get("temp_dir", "./temp"))
        ensure_directory(str(self.temp_dir))

    async def generate_from_audio(self, audio_data: bytes, text: str,
                                 language: str = "en-US") -> list[SubtitleEntry]:
        """Generate subtitles from audio data using speech-to-text alignment."""
        try:
            logger.info(f"Generating subtitles for {len(text)} characters of text")

            # Step 1: Get word-level timing from speech-to-text
            word_timings = await self._get_word_timings(audio_data, language)

            if not word_timings:
                # Fallback to simple timing distribution
                return self._generate_fallback_subtitles(text)

            # Step 2: Align text with word timings
            aligned_subtitles = await self._align_text_with_timings(text, word_timings)

            # Step 3: Apply subtitle formatting rules
            formatted_subtitles = self._apply_formatting_rules(aligned_subtitles)

            logger.info(f"Generated {len(formatted_subtitles)} subtitle entries")
            return formatted_subtitles

        except Exception as e:
            logger.error(f"Failed to generate subtitles from audio: {e}")
            # Return fallback subtitles
            return self._generate_fallback_subtitles(text)

    async def generate_from_text_only(self, text: str, estimated_duration: float,
                                    language: str = "en-US") -> list[SubtitleEntry]:
        """Generate subtitles from text only (no audio) with estimated timing."""
        try:
            logger.info(f"Generating text-only subtitles for {len(text)} characters")

            # Calculate word count and estimate speaking rate
            words = text.split()
            word_count = len(words)

            # Average speaking rate: 150-160 words per minute
            speaking_rate = config.get("speaking_rate_wpm", 150)
            estimated_speaking_duration = (word_count / speaking_rate) * 60

            # Use the longer of estimated or provided duration
            duration = max(estimated_duration, estimated_speaking_duration)

            # Generate subtitles with distributed timing
            subtitles = self._distribute_timing_across_text(text, duration)

            logger.info(f"Generated {len(subtitles)} text-only subtitle entries")
            return subtitles

        except Exception as e:
            logger.error(f"Failed to generate text-only subtitles: {e}")
            raise

    async def sync_with_slides(self, subtitles: list[SubtitleEntry],
                             slide_duration: float, slide_number: int) -> list[SubtitleEntry]:
        """Synchronize subtitle timing with slide transitions."""
        try:
            logger.info(f"Synchronizing {len(subtitles)} subtitles with slide {slide_number} duration {slide_duration}")

            if not subtitles:
                return []

            # Adjust subtitle timing to fit within slide duration
            synchronized_subtitles = []
            total_subtitle_duration = subtitles[-1].end_time if subtitles else 0

            # Calculate scaling factor if subtitles exceed slide duration
            if total_subtitle_duration > slide_duration:
                scale_factor = slide_duration / total_subtitle_duration
                logger.info(f"Scaling subtitle timing by factor {scale_factor:.3f}")

                for subtitle in subtitles:
                    synchronized_subtitle = SubtitleEntry(
                        index=subtitle.index,
                        start_time=subtitle.start_time * scale_factor,
                        end_time=subtitle.end_time * scale_factor,
                        text=subtitle.text,
                    )
                    synchronized_subtitles.append(synchronized_subtitle)
            else:
                # Subtitles fit within slide duration, use as-is
                synchronized_subtitles = subtitles.copy()

            # Ensure minimum spacing between subtitles
            synchronized_subtitles = self._ensure_minimum_spacing(synchronized_subtitles)

            logger.info(f"Synchronized {len(synchronized_subtitles)} subtitles")
            return synchronized_subtitles

        except Exception as e:
            logger.error(f"Failed to sync subtitles with slides: {e}")
            return subtitles

    async def _get_word_timings(self, audio_data: bytes, language: str) -> list[tuple[str, float, float]]:
        """Get word-level timing from speech-to-text service."""
        try:
            if self.stt_provider == "azure":
                return await self._azure_word_timings(audio_data, language)
            elif self.stt_provider == "openai":
                return await self._openai_word_timings(audio_data, language)
            else:
                logger.warning(f"Unsupported STT provider: {self.stt_provider}")
                return []

        except Exception as e:
            logger.error(f"Failed to get word timings: {e}")
            return []

    async def _azure_word_timings(self, audio_data: bytes, language: str) -> list[tuple[str, float, float]]:
        """Get word-level timing using Azure Speech Service."""
        try:
            if not self.azure_speech_key or not self.azure_speech_region:
                logger.warning("Azure Speech credentials not configured")
                return []

            # Save audio to temporary file
            temp_audio_path = self.temp_dir / f"temp_audio_{int(time.time())}.wav"
            temp_audio_path.write_bytes(audio_data)

            # Use Azure Speech SDK for word-level timing
            # This is a simplified implementation - in production, you'd use the Azure SDK
            headers = {
                "Ocp-Apim-Subscription-Key": self.azure_speech_key,
                "Content-Type": "audio/wav",
            }

            url = f"https://{self.azure_speech_region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1"
            params = {
                "language": language,
                "format": "detailed",
                "profanity": "raw",
            }

            async with aiohttp.ClientSession() as session:
                async with session.post(url, headers=headers, params=params, data=audio_data) as response:
                    if response.status == 200:
                        result = await response.json()
                        return self._parse_azure_word_timings(result)
                    else:
                        logger.error(f"Azure Speech API error: {response.status}")
                        return []

        except Exception as e:
            logger.error(f"Azure word timings failed: {e}")
            return []

    async def _openai_word_timings(self, audio_data: bytes, language: str) -> list[tuple[str, float, float]]:
        """Get word-level timing using OpenAI Whisper."""
        try:
            # For now, return empty list as OpenAI Whisper word timing requires additional setup
            # In a full implementation, you would use the OpenAI API with timestamp response format
            logger.info("OpenAI word timings not fully implemented")
            return []

        except Exception as e:
            logger.error(f"OpenAI word timings failed: {e}")
            return []

    def _parse_azure_word_timings(self, azure_result: dict) -> list[tuple[str, float, float]]:
        """Parse Azure Speech detailed result to extract word timings."""
        try:
            word_timings = []

            if azure_result.get("NBest"):
                nbest = azure_result["NBest"][0]  # Take best result

                if "Words" in nbest:
                    for word_info in nbest["Words"]:
                        word = word_info.get("Word", "")
                        start_time = word_info.get("Offset", 0) / 10000000.0  # Convert from 100ns to seconds
                        end_time = start_time + (word_info.get("Duration", 0) / 10000000.0)

                        word_timings.append((word, start_time, end_time))

            return word_timings

        except Exception as e:
            logger.error(f"Failed to parse Azure word timings: {e}")
            return []

    async def _align_text_with_timings(self, text: str, word_timings: list[tuple[str, float, float]]) -> list[SubtitleEntry]:
        """Align original text with word timings from speech-to-text."""
        try:
            # Clean and normalize text for comparison
            clean_text = re.sub(r'[^\w\s]', '', text.lower())
            clean_words = clean_text.split()

            # Extract words from timings
            timing_words = [word.lower().strip() for word, _, _ in word_timings]

            # Find best alignment between text and timing words
            aligned_text = self._align_words(clean_words, timing_words, text)

            # Group aligned words into subtitle chunks
            subtitle_chunks = self._group_words_into_subtitles(aligned_text, word_timings)

            return subtitle_chunks

        except Exception as e:
            logger.error(f"Failed to align text with timings: {e}")
            return self._generate_fallback_subtitles(text)

    def _align_words(self, text_words: list[str], timing_words: list[str], original_text: str) -> list[tuple[str, float, float]]:
        """Align words from original text with timing information."""
        try:
            aligned_words = []
            timing_index = 0

            for word in text_words:
                # Find the best match in timing words
                best_match = None
                best_distance = float('inf')

                for i in range(timing_index, min(timing_index + 5, len(timing_words))):
                    # Simple string similarity (can be improved with more sophisticated algorithms)
                    if timing_words[i] == word:
                        best_match = i
                        best_distance = 0
                        break
                    elif self._word_similarity(word, timing_words[i]) < 0.3:
                        distance = abs(len(word) - len(timing_words[i]))
                        if distance < best_distance:
                            best_distance = distance
                            best_match = i

                if best_match is not None:
                    word_info = word_timings[best_match]
                    aligned_words.append((word, word_info[1], word_info[2]))
                    timing_index = best_match + 1
                else:
                    # Word not found in timings, estimate timing
                    if aligned_words:
                        last_end = aligned_words[-1][2]
                        estimated_duration = 0.3  # Default word duration
                        aligned_words.append((word, last_end, last_end + estimated_duration))
                    else:
                        aligned_words.append((word, 0.0, 0.3))

            return aligned_words

        except Exception as e:
            logger.error(f"Failed to align words: {e}")
            return []

    def _word_similarity(self, word1: str, word2: str) -> float:
        """Calculate similarity between two words."""
        # Simple Levenshtein distance (can be improved)
        if word1 == word2:
            return 0.0

        len1, len2 = len(word1), len(word2)
        if len1 == 0:
            return len2
        if len2 == 0:
            return len1

        # Simple character-based distance
        distance = abs(len1 - len2)
        for i in range(min(len1, len2)):
            if word1[i] != word2[i]:
                distance += 1

        return distance / max(len1, len2)

    def _group_words_into_subtitles(self, aligned_words: list[tuple[str, float, float]],
                                   original_timings: list[tuple[str, float, float]]) -> list[SubtitleEntry]:
        """Group aligned words into subtitle chunks based on timing and formatting rules."""
        try:
            if not aligned_words:
                return []

            subtitles = []
            current_subtitle_words = []
            current_start_time = aligned_words[0][1]

            for i, (word, start_time, end_time) in enumerate(aligned_words):
                current_subtitle_words.append(word)

                # Check if we should break here
                current_text = " ".join(current_subtitle_words)
                current_duration = end_time - current_start_time

                should_break = (
                    len(current_text) > self.max_chars_per_line or
                    len(current_subtitle_words) > 8 or  # Max words per subtitle
                    current_duration > self.max_subtitle_duration or
                    (i == len(aligned_words) - 1)  # Last word
                )

                if should_break and current_subtitle_words:
                    subtitle_text = " ".join(current_subtitle_words)

                    # Ensure minimum duration
                    if current_duration < self.min_subtitle_duration:
                        end_time = current_start_time + self.min_subtitle_duration

                    subtitles.append(SubtitleEntry(
                        index=len(subtitles) + 1,
                        start_time=current_start_time,
                        end_time=end_time,
                        text=subtitle_text,
                    ))

                    # Reset for next subtitle
                    current_subtitle_words = []
                    if i < len(aligned_words) - 1:
                        current_start_time = aligned_words[i + 1][1]

            return subtitles

        except Exception as e:
            logger.error(f"Failed to group words into subtitles: {e}")
            return []

    def _apply_formatting_rules(self, subtitles: list[SubtitleEntry]) -> list[SubtitleEntry]:
        """Apply formatting rules to subtitle entries."""
        try:
            formatted_subtitles = []

            for subtitle in subtitles:
                # Clean up text
                cleaned_text = self._clean_subtitle_text(subtitle.text)

                # Ensure duration constraints
                duration = subtitle.end_time - subtitle.start_time
                if duration < self.min_subtitle_duration:
                    end_time = subtitle.start_time + self.min_subtitle_duration
                elif duration > self.max_subtitle_duration:
                    end_time = subtitle.start_time + self.max_subtitle_duration
                else:
                    end_time = subtitle.end_time

                formatted_subtitle = SubtitleEntry(
                    index=subtitle.index,
                    start_time=subtitle.start_time,
                    end_time=end_time,
                    text=cleaned_text,
                )

                formatted_subtitles.append(formatted_subtitle)

            return formatted_subtitles

        except Exception as e:
            logger.error(f"Failed to apply formatting rules: {e}")
            return subtitles

    def _clean_subtitle_text(self, text: str) -> str:
        """Clean up subtitle text for display."""
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text.strip())

        # Fix common issues
        text = text.replace(' i ', ' I ')  # Capitalize standalone 'i'
        text = re.sub(r'([.!?])\s*([a-z])', lambda m: f"{m.group(1)} {m.group(2).upper()}", text)

        return text

    def _generate_fallback_subtitles(self, text: str) -> list[SubtitleEntry]:
        """Generate simple subtitles with distributed timing when STT fails."""
        try:
            words = text.split()
            if not words:
                return []

            # Estimate total duration based on word count
            estimated_duration = (len(words) / 150) * 60  # 150 WPM

            # Group words into subtitle chunks
            subtitles = []
            words_per_subtitle = 8
            total_subtitles = max(1, (len(words) + words_per_subtitle - 1) // words_per_subtitle)
            duration_per_subtitle = estimated_duration / total_subtitles

            for i in range(0, len(words), words_per_subtitle):
                chunk_words = words[i:i + words_per_subtitle]
                chunk_text = " ".join(chunk_words)
                start_time = (i // words_per_subtitle) * duration_per_subtitle
                end_time = start_time + duration_per_subtitle

                subtitles.append(SubtitleEntry(
                    index=len(subtitles) + 1,
                    start_time=start_time,
                    end_time=end_time,
                    text=chunk_text,
                ))

            return subtitles

        except Exception as e:
            logger.error(f"Failed to generate fallback subtitles: {e}")
            return []

    def _distribute_timing_across_text(self, text: str, total_duration: float) -> list[SubtitleEntry]:
        """Distribute timing across text for text-only subtitle generation."""
        try:
            sentences = re.split(r'[.!?]+', text)
            sentences = [s.strip() for s in sentences if s.strip()]

            if not sentences:
                return []

            # Calculate timing for each sentence based on word count
            total_words = sum(len(sentence.split()) for sentence in sentences)
            subtitles = []
            current_time = 0.0

            for sentence in sentences:
                words = sentence.split()
                word_count = len(words)

                # Distribute time proportionally to word count
                sentence_duration = (word_count / total_words) * total_duration if total_words > 0 else total_duration

                # Ensure minimum duration
                sentence_duration = max(sentence_duration, self.min_subtitle_duration)

                subtitles.append(SubtitleEntry(
                    index=len(subtitles) + 1,
                    start_time=current_time,
                    end_time=current_time + sentence_duration,
                    text=sentence + ('.' if not sentence.endswith(('.', '!', '?')) else ''),
                ))

                current_time += sentence_duration

            return subtitles

        except Exception as e:
            logger.error(f"Failed to distribute timing across text: {e}")
            return []

    def _ensure_minimum_spacing(self, subtitles: list[SubtitleEntry], min_spacing: float = 0.1) -> list[SubtitleEntry]:
        """Ensure minimum spacing between subtitles."""
        if not subtitles:
            return []

        adjusted_subtitles = [subtitles[0]]

        for i in range(1, len(subtitles)):
            prev_subtitle = adjusted_subtitles[-1]
            current_subtitle = subtitles[i]

            # Calculate required adjustment
            spacing_needed = min_spacing - (current_subtitle.start_time - prev_subtitle.end_time)

            if spacing_needed > 0:
                # Shift current subtitle forward
                adjusted_subtitle = SubtitleEntry(
                    index=current_subtitle.index,
                    start_time=current_subtitle.start_time + spacing_needed,
                    end_time=current_subtitle.end_time + spacing_needed,
                    text=current_subtitle.text,
                )
                adjusted_subtitles.append(adjusted_subtitle)
            else:
                adjusted_subtitles.append(current_subtitle)

        return adjusted_subtitles

    def convert_to_srt(self, subtitles: list[SubtitleEntry]) -> str:
        """Convert subtitle entries to SRT format."""
        srt_content = []

        for subtitle in subtitles:
            start_time = self._seconds_to_srt_time(subtitle.start_time)
            end_time = self._seconds_to_srt_time(subtitle.end_time)

            srt_content.append(f"{subtitle.index}")
            srt_content.append(f"{start_time} --> {end_time}")
            srt_content.append(subtitle.text)
            srt_content.append("")  # Empty line between subtitles

        return "\n".join(srt_content)

    def convert_to_vtt(self, subtitles: list[SubtitleEntry]) -> str:
        """Convert subtitle entries to WebVTT format."""
        vtt_content = ["WEBVTT", ""]

        for subtitle in subtitles:
            start_time = self._seconds_to_vtt_time(subtitle.start_time)
            end_time = self._seconds_to_vtt_time(subtitle.end_time)

            vtt_content.append(f"{start_time} --> {end_time}")
            vtt_content.append(subtitle.text)
            vtt_content.append("")  # Empty line between subtitles

        return "\n".join(vtt_content)

    @staticmethod
    def _seconds_to_srt_time(seconds: float) -> str:
        """Convert seconds to SRT timestamp format (HH:MM:SS,mmm)."""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        millis = int((seconds % 1) * 1000)
        return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

    @staticmethod
    def _seconds_to_vtt_time(seconds: float) -> str:
        """Convert seconds to WebVTT timestamp format (HH:MM:SS.mmm)."""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        millis = int((seconds % 1) * 1000)
        return f"{hours:02d}:{minutes:02d}:{secs:02d}.{millis:03d}"
