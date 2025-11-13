"""Subtitle validation utilities for overlap detection, ordering, and formatting checks."""

from __future__ import annotations

from typing import Any

from shared.models import SubtitleEntry
from shared.utils import setup_logging

logger = setup_logging("subtitle-validator")


class SubtitleValidationError(Exception):
    """Raised when subtitle validation fails."""

    def __init__(self, message: str, violations: list[dict[str, Any]]):
        super().__init__(message)
        self.violations = violations


class SubtitleValidator:
    """Validate subtitle entries for common issues."""

    def __init__(
        self,
        min_duration: float = 0.5,
        max_duration: float = 10.0,
        max_chars_per_subtitle: int = 100,
        min_gap_between_subtitles: float = 0.1,
    ):
        """
        Initialize validator with configurable thresholds.

        Args:
            min_duration: Minimum subtitle display duration in seconds
            max_duration: Maximum subtitle display duration in seconds
            max_chars_per_subtitle: Maximum characters allowed per subtitle
            min_gap_between_subtitles: Minimum gap between consecutive subtitles
        """
        self.min_duration = min_duration
        self.max_duration = max_duration
        self.max_chars_per_subtitle = max_chars_per_subtitle
        self.min_gap_between_subtitles = min_gap_between_subtitles

    def validate(
        self, subtitles: list[SubtitleEntry], strict: bool = True
    ) -> dict[str, Any]:
        """
        Validate a list of subtitles and return validation results.

        Args:
            subtitles: List of subtitle entries to validate
            strict: If True, raise exception on violations. If False, return warnings.

        Returns:
            Dict with keys: valid (bool), violations (list), warnings (list)

        Raises:
            SubtitleValidationError: If strict=True and violations found
        """
        if not subtitles:
            return {"valid": True, "violations": [], "warnings": []}

        violations: list[dict[str, Any]] = []
        warnings: list[dict[str, Any]] = []

        # Check 1: Ordering
        ordering_violations = self._check_ordering(subtitles)
        violations.extend(ordering_violations)

        # Check 2: Overlaps
        overlap_violations = self._check_overlaps(subtitles)
        violations.extend(overlap_violations)

        # Check 3: Duration constraints
        duration_violations = self._check_durations(subtitles)
        violations.extend(duration_violations)

        # Check 4: Text length
        length_warnings = self._check_text_length(subtitles)
        warnings.extend(length_warnings)

        # Check 5: Gaps between subtitles (warning only)
        gap_warnings = self._check_gaps(subtitles)
        warnings.extend(gap_warnings)

        # Check 6: Negative or zero durations
        negative_violations = self._check_negative_durations(subtitles)
        violations.extend(negative_violations)

        is_valid = len(violations) == 0

        result = {
            "valid": is_valid,
            "violations": violations,
            "warnings": warnings,
            "total_subtitles": len(subtitles),
            "total_duration": subtitles[-1].end_time if subtitles else 0.0,
        }

        if strict and not is_valid:
            raise SubtitleValidationError(
                f"Subtitle validation failed with {len(violations)} violation(s)",
                violations,
            )

        return result

    def _check_ordering(self, subtitles: list[SubtitleEntry]) -> list[dict[str, Any]]:
        """Check if subtitles are properly ordered by start time and index."""
        violations = []

        for i in range(len(subtitles) - 1):
            current = subtitles[i]
            next_sub = subtitles[i + 1]

            # Check index ordering
            if current.index >= next_sub.index:
                violations.append(
                    {
                        "type": "ordering",
                        "severity": "error",
                        "message": f"Subtitle index {current.index} is not less than {next_sub.index}",
                        "subtitle_index": current.index,
                        "details": {
                            "current_index": current.index,
                            "next_index": next_sub.index,
                        },
                    }
                )

            # Check time ordering
            if current.start_time > next_sub.start_time:
                violations.append(
                    {
                        "type": "ordering",
                        "severity": "error",
                        "message": f"Subtitle {current.index} starts after subtitle {next_sub.index}",
                        "subtitle_index": current.index,
                        "details": {
                            "current_start": current.start_time,
                            "next_start": next_sub.start_time,
                        },
                    }
                )

        return violations

    def _check_overlaps(self, subtitles: list[SubtitleEntry]) -> list[dict[str, Any]]:
        """Check for overlapping subtitles."""
        violations = []

        for i in range(len(subtitles) - 1):
            current = subtitles[i]
            next_sub = subtitles[i + 1]

            # Check if current subtitle ends after next subtitle starts
            if current.end_time > next_sub.start_time:
                overlap_duration = current.end_time - next_sub.start_time
                violations.append(
                    {
                        "type": "overlap",
                        "severity": "error",
                        "message": f"Subtitles {current.index} and {next_sub.index} overlap by {overlap_duration:.2f}s",
                        "subtitle_index": current.index,
                        "details": {
                            "current_end": current.end_time,
                            "next_start": next_sub.start_time,
                            "overlap_duration": round(overlap_duration, 3),
                        },
                    }
                )

        return violations

    def _check_durations(self, subtitles: list[SubtitleEntry]) -> list[dict[str, Any]]:
        """Check if subtitle durations are within acceptable range."""
        violations = []

        for subtitle in subtitles:
            duration = subtitle.end_time - subtitle.start_time

            if duration < self.min_duration:
                violations.append(
                    {
                        "type": "duration_too_short",
                        "severity": "error",
                        "message": f"Subtitle {subtitle.index} duration {duration:.2f}s is below minimum {self.min_duration}s",
                        "subtitle_index": subtitle.index,
                        "details": {
                            "duration": round(duration, 3),
                            "min_duration": self.min_duration,
                        },
                    }
                )

            if duration > self.max_duration:
                violations.append(
                    {
                        "type": "duration_too_long",
                        "severity": "warning",  # Warning, not error
                        "message": f"Subtitle {subtitle.index} duration {duration:.2f}s exceeds maximum {self.max_duration}s",
                        "subtitle_index": subtitle.index,
                        "details": {
                            "duration": round(duration, 3),
                            "max_duration": self.max_duration,
                        },
                    }
                )

        return violations

    def _check_text_length(self, subtitles: list[SubtitleEntry]) -> list[dict[str, Any]]:
        """Check if subtitle text length is reasonable."""
        warnings = []

        for subtitle in subtitles:
            text_length = len(subtitle.text)

            if text_length > self.max_chars_per_subtitle:
                warnings.append(
                    {
                        "type": "text_too_long",
                        "severity": "warning",
                        "message": f"Subtitle {subtitle.index} has {text_length} characters (recommended max: {self.max_chars_per_subtitle})",
                        "subtitle_index": subtitle.index,
                        "details": {
                            "text_length": text_length,
                            "max_chars": self.max_chars_per_subtitle,
                            "text_preview": subtitle.text[:50] + "..."
                            if text_length > 50
                            else subtitle.text,
                        },
                    }
                )

        return warnings

    def _check_gaps(self, subtitles: list[SubtitleEntry]) -> list[dict[str, Any]]:
        """Check for unusually large gaps between subtitles."""
        warnings = []

        for i in range(len(subtitles) - 1):
            current = subtitles[i]
            next_sub = subtitles[i + 1]

            gap = next_sub.start_time - current.end_time

            # Warn if gap is negative (overlap - should be caught by overlap check)
            if gap < 0:
                continue  # Skip, handled by overlap check

            # Warn if gap is suspiciously small
            if 0 < gap < self.min_gap_between_subtitles:
                warnings.append(
                    {
                        "type": "small_gap",
                        "severity": "warning",
                        "message": f"Small gap of {gap:.2f}s between subtitles {current.index} and {next_sub.index}",
                        "subtitle_index": current.index,
                        "details": {
                            "gap_duration": round(gap, 3),
                            "min_recommended_gap": self.min_gap_between_subtitles,
                        },
                    }
                )

            # Warn if gap is unusually large (> 3 seconds)
            if gap > 3.0:
                warnings.append(
                    {
                        "type": "large_gap",
                        "severity": "info",
                        "message": f"Large gap of {gap:.2f}s between subtitles {current.index} and {next_sub.index}",
                        "subtitle_index": current.index,
                        "details": {"gap_duration": round(gap, 3)},
                    }
                )

        return warnings

    def _check_negative_durations(
        self, subtitles: list[SubtitleEntry]
    ) -> list[dict[str, Any]]:
        """Check for negative or zero durations."""
        violations = []

        for subtitle in subtitles:
            duration = subtitle.end_time - subtitle.start_time

            if duration <= 0:
                violations.append(
                    {
                        "type": "negative_duration",
                        "severity": "error",
                        "message": f"Subtitle {subtitle.index} has non-positive duration: {duration:.2f}s",
                        "subtitle_index": subtitle.index,
                        "details": {
                            "start_time": subtitle.start_time,
                            "end_time": subtitle.end_time,
                            "duration": round(duration, 3),
                        },
                    }
                )

        return violations

    def auto_fix(
        self, subtitles: list[SubtitleEntry], in_place: bool = False
    ) -> tuple[list[SubtitleEntry], dict[str, Any]]:
        """
        Automatically fix common subtitle issues.

        Args:
            subtitles: List of subtitles to fix
            in_place: If True, modify subtitles in place. If False, return new list.

        Returns:
            Tuple of (fixed_subtitles, fix_report)
        """
        if not in_place:
            subtitles = [
                SubtitleEntry(
                    index=sub.index,
                    start_time=sub.start_time,
                    end_time=sub.end_time,
                    text=sub.text,
                )
                for sub in subtitles
            ]

        fixes_applied = []

        # Fix 1: Reindex subtitles
        for i, subtitle in enumerate(subtitles, start=1):
            if subtitle.index != i:
                fixes_applied.append(
                    {
                        "type": "reindex",
                        "subtitle": i,
                        "old_index": subtitle.index,
                        "new_index": i,
                    }
                )
                subtitle.index = i

        # Fix 2: Sort by start time
        subtitles.sort(key=lambda s: s.start_time)

        # Fix 3: Fix overlaps by adjusting end times
        for i in range(len(subtitles) - 1):
            current = subtitles[i]
            next_sub = subtitles[i + 1]

            if current.end_time > next_sub.start_time:
                old_end = current.end_time
                # End current subtitle slightly before next one starts
                current.end_time = max(
                    current.start_time + self.min_duration,
                    next_sub.start_time - self.min_gap_between_subtitles,
                )
                fixes_applied.append(
                    {
                        "type": "fix_overlap",
                        "subtitle": current.index,
                        "old_end": round(old_end, 3),
                        "new_end": round(current.end_time, 3),
                    }
                )

        # Fix 4: Ensure minimum duration
        for subtitle in subtitles:
            duration = subtitle.end_time - subtitle.start_time
            if duration < self.min_duration:
                old_end = subtitle.end_time
                subtitle.end_time = subtitle.start_time + self.min_duration
                fixes_applied.append(
                    {
                        "type": "extend_duration",
                        "subtitle": subtitle.index,
                        "old_duration": round(duration, 3),
                        "new_duration": self.min_duration,
                        "new_end": round(subtitle.end_time, 3),
                    }
                )

        fix_report = {
            "fixes_applied": len(fixes_applied),
            "details": fixes_applied,
            "subtitles_processed": len(subtitles),
        }

        return subtitles, fix_report
