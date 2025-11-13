"""Pronunciation lexicon manager for SSML builder."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from shared.models import PronunciationLexicon, PronunciationLexiconRequest
from shared.utils import config, generate_hash, setup_logging

logger = setup_logging("lexicon-manager")


class LexiconManager:
    """Manage pronunciation lexicons with hierarchical scoping."""

    def __init__(self, storage_path: str | None = None):
        """Initialize lexicon manager with storage path."""
        self.storage_path = Path(
            storage_path or config.get("lexicon_storage_path", "./temp/lexicons.json")
        )
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)

    def create_lexicon(self, request: PronunciationLexiconRequest) -> PronunciationLexicon:
        """Create a new pronunciation lexicon."""
        lexicon_id = generate_hash(
            f"{request.presentation_id or '*'}_{request.owner_id or '*'}_{request.name}"
        )

        lexicon = PronunciationLexicon(
            lexicon_id=lexicon_id,
            presentation_id=request.presentation_id,
            owner_id=request.owner_id,
            name=request.name,
            entries=request.entries,
            language=request.language,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

        self._save_lexicon(lexicon)
        logger.info(f"Created lexicon {lexicon_id} for presentation={request.presentation_id}")
        return lexicon

    def get_lexicon(self, lexicon_id: str) -> PronunciationLexicon | None:
        """Get lexicon by ID."""
        lexicons = self._load_lexicons()
        return lexicons.get(lexicon_id)

    def update_lexicon(
        self, lexicon_id: str, updates: dict
    ) -> PronunciationLexicon:
        """Update existing lexicon."""
        lexicon = self.get_lexicon(lexicon_id)
        if not lexicon:
            raise ValueError(f"Lexicon {lexicon_id} not found")

        # Update fields
        if "name" in updates:
            lexicon.name = updates["name"]
        if "entries" in updates:
            lexicon.entries = updates["entries"]
        if "language" in updates:
            lexicon.language = updates["language"]

        lexicon.updated_at = datetime.now(timezone.utc)

        self._save_lexicon(lexicon)
        logger.info(f"Updated lexicon {lexicon_id}")
        return lexicon

    def delete_lexicon(self, lexicon_id: str) -> bool:
        """Delete lexicon by ID."""
        lexicons = self._load_lexicons()
        if lexicon_id in lexicons:
            del lexicons[lexicon_id]
            self._save_all_lexicons(lexicons)
            logger.info(f"Deleted lexicon {lexicon_id}")
            return True
        return False

    def list_lexicons(
        self, presentation_id: str | None = None, owner_id: str | None = None
    ) -> list[PronunciationLexicon]:
        """List lexicons filtered by presentation_id and/or owner_id."""
        lexicons = self._load_lexicons()
        results = []

        for lexicon in lexicons.values():
            # Filter by presentation_id if specified
            if presentation_id and lexicon.presentation_id != presentation_id:
                continue
            # Filter by owner_id if specified
            if owner_id and lexicon.owner_id != owner_id:
                continue
            results.append(lexicon)

        return results

    def get_applicable_lexicon(
        self, presentation_id: str | None = None, owner_id: str | None = None
    ) -> PronunciationLexicon | None:
        """
        Get most specific applicable lexicon using hierarchical lookup.

        Lookup order:
        1. owner:presentation (most specific)
        2. owner:* (all presentations for owner)
        3. *:presentation (all owners for presentation)
        4. *:* (global)
        """
        lexicons = self._load_lexicons()

        # Try owner:presentation
        for lexicon in lexicons.values():
            if (
                lexicon.owner_id == owner_id
                and lexicon.presentation_id == presentation_id
            ):
                return lexicon

        # Try owner:*
        if owner_id:
            for lexicon in lexicons.values():
                if lexicon.owner_id == owner_id and lexicon.presentation_id is None:
                    return lexicon

        # Try *:presentation
        if presentation_id:
            for lexicon in lexicons.values():
                if lexicon.owner_id is None and lexicon.presentation_id == presentation_id:
                    return lexicon

        # Try *:* (global)
        for lexicon in lexicons.values():
            if lexicon.owner_id is None and lexicon.presentation_id is None:
                return lexicon

        return None

    def _load_lexicons(self) -> dict[str, PronunciationLexicon]:
        """Load all lexicons from storage."""
        if not self.storage_path.exists():
            return {}

        try:
            with open(self.storage_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return {
                    lex_id: PronunciationLexicon(**lex_data)
                    for lex_id, lex_data in data.items()
                }
        except (json.JSONDecodeError, ValueError) as e:
            logger.error(f"Failed to load lexicons: {e}")
            return {}

    def _save_lexicon(self, lexicon: PronunciationLexicon):
        """Save single lexicon to storage."""
        lexicons = self._load_lexicons()
        lexicons[lexicon.lexicon_id] = lexicon
        self._save_all_lexicons(lexicons)

    def _save_all_lexicons(self, lexicons: dict[str, PronunciationLexicon]):
        """Save all lexicons to storage."""
        data = {lex_id: lex.model_dump() for lex_id, lex in lexicons.items()}

        with open(self.storage_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, default=str)
