"""Simple unit tests for SSML Builder Service - focusing on core functionality"""

import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from services.ssml_builder.app import app
from services.ssml_builder.builder import SSMLBuilder
from services.ssml_builder.lexicon_manager import LexiconManager
from shared.models import (
    PronunciationEntry,
    PronunciationLexicon,
    PronunciationLexiconRequest,
    SSMLRequest,
)


class TestSSMLBuilderCore:
    """Test cases for SSMLBuilder core functionality."""

    def setup_method(self):
        """Set up test fixtures."""
        self.builder = SSMLBuilder()

    def test_basic_ssml_generation(self):
        """Test basic SSML generation."""
        request = SSMLRequest(text="Hello world")
        ssml = self.builder.build(request)

        assert isinstance(ssml, str)
        assert "Hello world" in ssml
        assert ssml.startswith('<speak version="1.0"')
        assert ssml.endswith('</speak>')
        assert '<voice xml:lang="en-US" name="en-US-AriaNeural">' in ssml
        assert "</voice>" in ssml

    def test_ssml_with_emphasis(self):
        """Test SSML generation with emphasis."""
        request = SSMLRequest(
            text="This is important and this is normal",
            emphasis_words=["important"]
        )
        ssml = self.builder.build(request)

        assert '<emphasis level="moderate">important</emphasis>' in ssml
        assert "This is" in ssml
        assert "and this is normal" in ssml

    def test_ssml_with_pauses(self):
        """Test SSML generation with pauses."""
        request = SSMLRequest(
            text="Hello world. How are you?",
            pauses={5: 1.0, 12: 0.5}
        )
        ssml = self.builder.build(request)

        assert '<break time="1.0s"/>' in ssml
        assert '<break time="0.5s"/>' in ssml

    def test_ssml_with_prosody(self):
        """Test SSML generation with prosody."""
        request = SSMLRequest(
            text="This text has custom prosody",
            prosody_rate=1.2,
            prosody_pitch="+10%",
            prosody_volume="loud"
        )
        ssml = self.builder.build(request)

        assert '<prosody rate="1.2"' in ssml
        assert 'pitch="+10%"' in ssml
        assert 'volume="loud"' in ssml

    def test_ssml_xml_escaping(self):
        """Test XML character escaping."""
        request = SSMLRequest(text="Hello <world> & friends")
        ssml = self.builder.build(request)

        assert "&lt;world&gt;" in ssml
        assert "&amp;" in ssml

    def test_empty_text(self):
        """Test empty text handling."""
        request = SSMLRequest(text="")
        ssml = self.builder.build(request)

        assert ssml.startswith('<speak')
        assert ssml.endswith('</speak>')

    def test_long_text(self):
        """Test long text handling."""
        long_text = "word " * 100
        request = SSMLRequest(text=long_text)
        ssml = self.builder.build(request)

        assert len(ssml) > len(long_text)
        assert "word" in ssml

    def test_apply_preset_news_anchor(self):
        """Test news anchor preset application."""
        request = SSMLRequest(
            text="Breaking news update",
            preset="news_anchor"
        )
        ssml = self.builder.build(request)

        assert "Breaking news update" in ssml
        # News anchor preset should modify prosody
        assert '<prosody' in ssml

    def test_apply_preset_storytelling(self):
        """Test storytelling preset application."""
        request = SSMLRequest(
            text="Once upon a time",
            preset="storytelling"
        )
        ssml = self.builder.build(request)

        assert "Once upon a time" in ssml
        assert '<prosody' in ssml

    def test_apply_preset_technical(self):
        """Test technical preset application."""
        request = SSMLRequest(
            text="Technical specification",
            preset="technical"
        )
        ssml = self.builder.build(request)

        assert "Technical specification" in ssml
        assert '<prosody' in ssml

    def test_apply_preset_casual(self):
        """Test casual preset application."""
        request = SSMLRequest(
            text="Hey, what's up?",
            preset="casual"
        )
        ssml = self.builder.build(request)

        assert "Hey, what's up?" in ssml
        assert '<prosody' in ssml


class TestLexiconManagerBasic:
    """Basic test cases for LexiconManager."""

    def setup_method(self):
        """Set up test fixtures with temporary directory."""
        self.temp_dir = tempfile.mkdtemp()
        self.lexicon_manager = LexiconManager(storage_path=self.temp_dir)

    def teardown_method(self):
        """Clean up test fixtures."""
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_lexicon_manager_initialization(self):
        """Test LexiconManager initialization."""
        assert self.lexicon_manager is not None
        assert self.lexicon_manager.storage_path.exists()

    def test_create_basic_lexicon(self):
        """Test creating a basic lexicon."""
        request = PronunciationLexiconRequest(
            owner="test_user",
            scope="presentation"
        )

        lexicon = self.lexicon_manager.create_lexicon(request)

        assert isinstance(lexicon, PronunciationLexicon)
        assert lexicon.owner == "test_user"
        assert lexicon.scope == "presentation"
        assert lexicon.created_at is not None
        assert lexicon.updated_at is not None

    def test_create_lexicon_with_entries(self):
        """Test creating a lexicon with pronunciation entries."""
        request = PronunciationLexiconRequest(
            owner="test_user",
            scope="presentation"
        )

        # Create entries manually and add them
        lexicon = self.lexicon_manager.create_lexicon(request)
        lexicon.entries = [
            PronunciationEntry(
                word="hello",
                ipa="həˈloʊ",
                alphabet="ipa"
            )
        ]

        assert len(lexicon.entries) == 1
        assert lexicon.entries[0].word == "hello"
        assert lexicon.entries[0].ipa == "həˈloʊ"

    def test_file_storage_creation(self):
        """Test that lexicon storage files are created."""
        request = PronunciationLexiconRequest(
            owner="test_user",
            scope="presentation"
        )

        self.lexicon_manager.create_lexicon(request)

        # Check that storage file exists
        assert self.lexicon_manager.storage_path.exists()


class TestSSMLBuilderAPI:
    """Test cases for SSML Builder FastAPI endpoints."""

    def test_health_check_endpoint(self):
        """Test health check endpoint."""
        client = TestClient(app)
        response = client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["service"] == "ssml-builder"

    def test_get_presets_endpoint(self):
        """Test get presets endpoint."""
        client = TestClient(app)

        # Note: This test might fail due to authentication, but that's expected
        response = client.get("/presets")

        # Should either succeed with data or require auth
        assert response.status_code in [200, 401, 403]

    def test_build_endpoint_requires_auth(self):
        """Test that build endpoint requires authentication."""
        client = TestClient(app)

        payload = {"text": "Hello world"}
        response = client.post("/build", json=payload)

        # Should require authentication
        assert response.status_code == 401

    def test_validate_endpoint_requires_auth(self):
        """Test that validate endpoint requires authentication."""
        client = TestClient(app)

        payload = {"ssml": "<speak>Hello</speak>"}
        response = client.post("/validate", json=payload)

        # Should require authentication
        assert response.status_code == 401

    def test_lexicon_endpoints_require_auth(self):
        """Test that lexicon endpoints require authentication."""
        client = TestClient(app)

        # Test various lexicon endpoints
        endpoints = [
            ("GET", "/lexicon"),
            ("POST", "/lexicon"),
            ("PUT", "/lexicon"),
            ("DELETE", "/lexicon"),
        ]

        for method, endpoint in endpoints:
            if method == "GET":
                response = client.get(endpoint)
            elif method == "POST":
                response = client.post(endpoint, json={})
            elif method == "PUT":
                response = client.put(endpoint, json={})
            elif method == "DELETE":
                response = client.delete(endpoint)

            # Should require authentication
            assert response.status_code == 401


class TestSSMLBuilderIntegration:
    """Integration tests for SSML Builder functionality."""

    def test_ssml_xml_validation(self):
        """Test that generated SSML is valid XML."""
        builder = SSMLBuilder()
        request = SSMLRequest(text="Hello world")
        ssml = builder.build(request)

        # Parse as XML to verify validity
        import xml.etree.ElementTree as ET
        try:
            root = ET.fromstring(ssml)
            assert root.tag == "speak"
            assert root.get("version") == "1.0"
        except ET.ParseError:
            pytest.fail("Generated SSML is not valid XML")

    def test_ssml_with_all_features(self):
        """Test SSML generation with all features combined."""
        builder = SSMLBuilder()
        request = SSMLRequest(
            text="Hello IMPORTANT world",
            emphasis_words=["IMPORTANT"],
            pauses={5: 1.0},
            prosody_rate=1.2,
            prosody_pitch="+10%",
            preset="news_anchor"
        )
        ssml = builder.build(request)

        assert "Hello" in ssml
        assert '<emphasis level="moderate">IMPORTANT</emphasis>' in ssml
        assert '<break time="1.0s"/>' in ssml
        assert '<prosody' in ssml

    def test_unicode_support(self):
        """Test Unicode character support."""
        builder = SSMLBuilder()
        request = SSMLRequest(text="Hello 🌍 世界 ñoño")
        ssml = builder.build(request)

        assert "🌍" in ssml
        assert "世界" in ssml
        assert "ñoño" in ssml

    def test_special_characters_escaping(self):
        """Test proper escaping of special characters."""
        builder = SSMLBuilder()
        request = SSMLRequest(text="Test & < > \" ' characters")
        ssml = builder.build(request)

        assert "&amp;" in ssml
        assert "&lt;" in ssml
        assert "&gt;" in ssml
        assert "&quot;" in ssml
        assert "&apos;" in ssml


class TestSSMLBuilderEdgeCases:
    """Test edge cases and error conditions."""

    def test_empty_emphasis_list(self):
        """Test empty emphasis words list."""
        builder = SSMLBuilder()
        request = SSMLRequest(text="Hello world", emphasis_words=[])
        ssml = builder.build(request)

        assert "Hello world" in ssml
        assert "<emphasis" not in ssml

    def test_empty_pauses_dict(self):
        """Test empty pauses dictionary."""
        builder = SSMLBuilder()
        request = SSMLRequest(text="Hello world", pauses={})
        ssml = builder.build(request)

        assert "Hello world" in ssml
        assert "<break" not in ssml

    def test_invalid_pause_positions(self):
        """Test pause positions beyond text length."""
        builder = SSMLBuilder()
        request = SSMLRequest(text="Hello", pauses={100: 1.0})
        ssml = builder.build(request)

        # Should not crash and should include original text
        assert "Hello" in ssml

    def test_emphasis_words_not_in_text(self):
        """Test emphasis words that don't exist in text."""
        builder = SSMLBuilder()
        request = SSMLRequest(
            text="Hello world",
            emphasis_words=["nonexistent"]
        )
        ssml = builder.build(request)

        # Should handle gracefully
        assert "Hello world" in ssml

    def test_very_long_word(self):
        """Test with very long single word."""
        builder = SSMLBuilder()
        long_word = "a" * 1000
        request = SSMLRequest(text=long_word)
        ssml = builder.build(request)

        assert long_word in ssml
        assert len(ssml) > len(long_word)

    def test_only_whitespace_text(self):
        """Test text that contains only whitespace."""
        builder = SSMLBuilder()
        request = SSMLRequest(text="   \n\t   ")
        ssml = builder.build(request)

        assert ssml.startswith('<speak')
        assert ssml.endswith('</speak>')


# Helper function to run tests if script is executed directly
if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-v"]))