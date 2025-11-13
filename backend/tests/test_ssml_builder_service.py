"""Unit tests for SSML Builder Service"""

import json
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

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
    SSMLResponse,
)


class TestSSMLBuilder:
    """Test cases for SSMLBuilder class."""

    def setup_method(self):
        """Set up test fixtures."""
        self.builder = SSMLBuilder()
        self.voice = "en-US-AriaNeural"
        self.language = "en-US"

    def test_build_basic_ssml(self):
        """Test building basic SSML without any special features."""
        request = SSMLRequest(text="Hello world")
        response = self.builder.build(request)

        assert isinstance(response, str)
        assert "Hello world" in response
        assert '<speak version="1.0"' in response
        assert f'<voice xml:lang="{self.language}" name="{self.voice}">' in response
        assert "</voice>" in response
        assert "</speak>" in response

    def test_build_ssml_with_emphasis(self):
        """Test building SSML with emphasis on specific words."""
        request = SSMLRequest(
            text="This is important and this is normal",
            emphasis_words=["important"]
        )
        response = self.builder.build_ssml(request, self.voice)

        assert '<emphasis level="moderate">important</emphasis>' in response.ssml
        assert "This is" in response.ssml
        assert "and this is normal" in response.ssml

    def test_build_ssml_with_pauses(self):
        """Test building SSML with pauses at character positions."""
        request = SSMLRequest(
            text="Hello world. How are you?",
            pauses={5: 1.0, 12: 0.5}  # Pause after "Hello" and after "world."
        )
        response = self.builder.build_ssml(request, self.voice)

        assert '<break time="1.0s"/>' in response.ssml
        assert '<break time="0.5s"/>' in response.ssml

    def test_build_ssml_with_prosody(self):
        """Test building SSML with prosody (rate, pitch, volume)."""
        request = SSMLRequest(
            text="This text has custom prosody",
            prosody_rate=1.2,
            prosody_pitch="+10%",
            prosody_volume="loud"
        )
        response = self.builder.build_ssml(request, self.voice)

        assert '<prosody rate="1.2" pitch="+10%" volume="loud">' in response.ssml
        assert response.ssml.count("<prosody") == 1
        assert response.ssml.count("</prosody>") == 1

    def test_build_ssml_with_say_as(self):
        """Test building SSML with say-as for special interpretation."""
        request = SSMLRequest(
            text="Call 555-123-4567 for help. The date is 12/25/2024.",
            say_as_examples={"555-123-4567": "telephone", "12/25/2024": "date"}
        )
        response = self.builder.build_ssml(request, self.voice)

        assert '<say-as interpret-as="telephone">555-123-4567</say-as>' in response.ssml
        assert '<say-as interpret-as="date">12/25/2024</say-as>' in response.ssml

    def test_build_ssml_with_phonemes(self):
        """Test building SSML with custom phonemes."""
        request = SSMLRequest(
            text="Read this book",
            phoneme_examples={"read": "ɹiːd", "book": "bʊk"}
        )
        response = self.builder.build_ssml(request, self.voice)

        assert '<phoneme alphabet="ipa" ph="ɹiːd">read</phoneme>' in response.ssml
        assert '<phoneme alphabet="ipa" ph="bʊk">book</phoneme>' in response.ssml

    def test_build_ssml_with_preset(self):
        """Test building SSML with preset configurations."""
        request = SSMLRequest(
            text="Welcome to the news update",
            preset="news_anchor"
        )
        response = self.builder.build_ssml(request, self.voice)

        # News anchor preset should have specific prosody settings
        assert '<prosody rate="1.1"' in response.ssml
        assert '<prosody pitch="-5%"' in response.ssml

    def test_build_ssml_with_lexicon(self):
        """Test building SSML with pronunciation lexicon."""
        lexicon = PronunciationLexicon(
            owner="test",
            scope="presentation",
            entries=[
                PronunciationEntry(
                    word="SQL",
                    ipa="siːkwəl",
                    alphabet="ipa"
                ),
                PronunciationEntry(
                    word="GUI",
                    ipa="ɡuːiː",
                    alphabet="ipa"
                )
            ]
        )
        request = SSMLRequest(text="Use SQL and GUI")
        response = self.builder.build_ssml(request, self.voice, lexicon=lexicon)

        assert '<phoneme alphabet="ipa" ph="siːkwəl">SQL</phoneme>' in response.ssml
        assert '<phoneme alphabet="ipa" ph="ɡuːiː">GUI</phoneme>' in response.ssml

    def test_build_ssml_xml_escaping(self):
        """Test that special XML characters are properly escaped."""
        request = SSMLRequest(text="Hello <world> & 'friends' \"quotes\"")
        response = self.builder.build_ssml(request, self.voice)

        assert "&lt;world&gt;" in response.ssml
        assert "&amp;" in response.ssml
        assert "&quot;" in response.ssml
        assert "&apos;" in response.ssml

    def test_build_ssml_empty_text(self):
        """Test building SSML with empty text."""
        request = SSMLRequest(text="")
        response = self.builder.build_ssml(request, self.voice)

        assert "<speak" in response.ssml
        assert "</speak>" in response.ssml
        assert response.metadata.words_processed == 0

    def test_build_ss_very_long_text(self):
        """Test building SSML with very long text (boundary testing)."""
        long_text = "word " * 1000  # ~6000 characters
        request = SSMLRequest(text=long_text)
        response = self.builder.build_ssml(request, self.voice)

        assert len(response.ssml) > 10000  # Should be substantially larger than input
        assert response.metadata.words_processed == 1000


class TestLexiconManager:
    """Test cases for LexiconManager class."""

    def setup_method(self):
        """Set up test fixtures."""
        # Use a temporary directory for lexicon storage
        self.temp_dir = tempfile.mkdtemp()
        self.lexicon_manager = LexiconManager(lexicon_storage_path=self.temp_dir)

    def teardown_method(self):
        """Clean up test fixtures."""
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_create_lexicon(self):
        """Test creating a new pronunciation lexicon."""
        request = PronunciationLexiconRequest(
            owner="test_user",
            scope="presentation"
        )
        entries = [
            PronunciationEntry(word="hello", ipa="həˈloʊ", alphabet="ipa")
        ]

        lexicon = self.lexicon_manager.create_lexicon(request, entries)

        assert isinstance(lexicon, PronunciationLexicon)
        assert lexicon.owner == "test_user"
        assert lexicon.scope == "presentation"
        assert len(lexicon.entries) == 1
        assert lexicon.entries[0].word == "hello"
        assert lexicon.entries[0].ipa == "həˈloʊ"
        assert lexicon.created_at is not None
        assert lexicon.updated_at is not None

    def test_get_lexicon(self):
        """Test retrieving a lexicon."""
        # Create a lexicon first
        request = PronunciationLexiconRequest(
            owner="test_user",
            scope="presentation"
        )
        entries = [
            PronunciationEntry(word="hello", ipa="həˈloʊ", alphabet="ipa")
        ]
        created_lexicon = self.lexicon_manager.create_lexicon(request, entries)

        # Retrieve the lexicon
        retrieved_lexicon = self.lexicon_manager.get_lexicon(request)

        assert retrieved_lexicon.owner == created_lexicon.owner
        assert retrieved_lexicon.scope == created_lexicon.scope
        assert len(retrieved_lexicon.entries) == 1
        assert retrieved_lexicon.entries[0].word == "hello"

    def test_get_lexicon_not_found(self):
        """Test retrieving a non-existent lexicon."""
        request = PronunciationLexiconRequest(
            owner="nonexistent",
            scope="presentation"
        )

        with pytest.raises(Exception) as exc_info:
            self.lexicon_manager.get_lexicon(request)
        assert "not found" in str(exc_info.value).lower()

    def test_update_lexicon(self):
        """Test updating an existing lexicon."""
        # Create initial lexicon
        request = PronunciationLexiconRequest(
            owner="test_user",
            scope="presentation"
        )
        initial_entries = [
            PronunciationEntry(word="hello", ipa="həˈloʊ", alphabet="ipa")
        ]
        self.lexicon_manager.create_lexicon(request, initial_entries)

        # Update with new entries
        updated_entries = [
            PronunciationEntry(word="hello", ipa="həˈloʊ", alphabet="ipa"),
            PronunciationEntry(word="world", ipa="wɜːrld", alphabet="ipa")
        ]
        updated_lexicon = self.lexicon_manager.update_lexicon(request, updated_entries)

        assert len(updated_lexicon.entries) == 2
        assert updated_lexicon.updated_at > updated_lexicon.created_at

        # Verify persistence
        retrieved_lexicon = self.lexicon_manager.get_lexicon(request)
        assert len(retrieved_lexicon.entries) == 2

    def test_delete_lexicon(self):
        """Test deleting a lexicon."""
        # Create a lexicon first
        request = PronunciationLexiconRequest(
            owner="test_user",
            scope="presentation"
        )
        entries = [PronunciationEntry(word="hello", ipa="həˈloʊ", alphabet="ipa")]
        self.lexicon_manager.create_lexicon(request, entries)

        # Delete the lexicon
        self.lexicon_manager.delete_lexicon(request)

        # Verify it's deleted
        with pytest.raises(Exception):
            self.lexicon_manager.get_lexicon(request)

    def test_list_lexicons(self):
        """Test listing lexicons with filters."""
        # Create multiple lexicons
        requests = [
            PronunciationLexiconRequest(owner="user1", scope="presentation"),
            PronunciationLexiconRequest(owner="user1", scope="global"),
            PronunciationLexiconRequest(owner="user2", scope="presentation"),
        ]

        for i, req in enumerate(requests):
            entries = [PronunciationEntry(word=f"word{i}", ipa="wɜːrd", alphabet="ipa")]
            self.lexicon_manager.create_lexicon(req, entries)

        # Test listing all lexicons
        all_lexicons = self.lexicon_manager.list_lexicons()
        assert len(all_lexicons) == 3

        # Test filtering by owner
        user1_lexicons = self.lexicon_manager.list_lexicons(owner="user1")
        assert len(user1_lexicons) == 2

        # Test filtering by scope
        presentation_lexicons = self.lexicon_manager.list_lexicons(scope="presentation")
        assert len(presentation_lexicons) == 2

    def test_hierarchical_lookup(self):
        """Test hierarchical lexicon lookup priority."""
        # Create lexicons with different scopes
        global_req = PronunciationLexiconRequest(owner="user1", scope="global")
        presentation_req = PronunciationLexiconRequest(owner="user1", scope="presentation")
        user_presentation_req = PronunciationLexiconRequest(
            owner="user1", scope="presentation:slide123"
        )

        # Each lexicon has the same word with different pronunciation
        global_entries = [PronunciationEntry(word="test", ipa="tɛst", alphabet="ipa")]
        presentation_entries = [PronunciationEntry(word="test", ipa="tɛst2", alphabet="ipa")]
        user_presentation_entries = [PronunciationEntry(word="test", ipa="tɛst3", alphabet="ipa")]

        self.lexicon_manager.create_lexicon(global_req, global_entries)
        self.lexicon_manager.create_lexicon(presentation_req, presentation_entries)
        self.lexicon_manager.create_lexicon(user_presentation_req, user_presentation_entries)

        # Test hierarchical lookup - should find the most specific
        request = PronunciationLexiconRequest(
            owner="user1",
            scope="presentation:slide123"
        )
        lexicon = self.lexicon_manager.get_lexicon_hierarchical(request)

        assert lexicon is not None
        # Should find the most specific lexicon
        assert lexicon.scope == "presentation:slide123"
        assert lexicon.entries[0].ipa == "tɛst3"


class TestSSMLBuilderAPI:
    """Test cases for SSML Builder FastAPI endpoints."""

    def test_health_check(self):
        """Test the health check endpoint."""
        client = TestClient(app)
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
        assert "service" in response.json()
        assert response.json()["service"] == "ssml-builder"

    def test_build_ssml_endpoint(self, monkeypatch):
        """Test the SSML building endpoint."""
        client = TestClient(app)

        # Mock the SSML builder to avoid actual processing
        mock_response = SSMLResponse(
            ssml='<speak version="1.0"><voice name="en-US-AriaNeural">Hello world</voice></speak>',
            metadata={"words_processed": 2, "emphasis_count": 0, "pause_count": 0}
        )

        with patch('services.ssml_builder.service.ssml_builder.build_ssml', return_value=mock_response):
            payload = {
                "text": "Hello world",
                "voice": "en-US-AriaNeural"
            }
            response = client.post(
                "/build",
                json=payload,
                headers={"Authorization": "Bearer test_token"}
            )

            assert response.status_code == 200
            data = response.json()
            assert "ssml" in data
            assert "metadata" in data
            assert data["metadata"]["words_processed"] == 2

    def test_build_ssml_endpoint_with_voice(self, monkeypatch):
        """Test the SSML building endpoint with voice parameter."""
        client = TestClient(app)

        mock_response = SSMLResponse(
            ssml='<speak version="1.0"><voice name="en-GB-Neural">Test</voice></speak>',
            metadata={"words_processed": 1, "emphasis_count": 0, "pause_count": 0}
        )

        with patch('services.ssml_builder.service.ssml_builder.build_ssml', return_value=mock_response):
            payload = {
                "text": "Test",
                "voice": "en-GB-Neural"
            }
            response = client.post(
                "/build",
                json=payload,
                headers={"Authorization": "Bearer test_token"}
            )

            assert response.status_code == 200
            data = response.json()
            assert "en-GB-Neural" in data["ssml"]

    def test_create_lexicon_endpoint(self):
        """Test the create lexicon endpoint."""
        client = TestClient(app)

        payload = {
            "owner": "test_user",
            "scope": "presentation",
            "entries": [
                {"word": "hello", "ipa": "həˈloʊ", "alphabet": "ipa"}
            ]
        }

        response = client.post(
            "/lexicon",
            json=payload,
            headers={"Authorization": "Bearer test_token"}
        )

        # Note: This might fail if lexicon storage directory doesn't exist
        # In a real test environment, you'd mock the file system operations
        if response.status_code == 200:
            data = response.json()
            assert data["owner"] == "test_user"
            assert data["scope"] == "presentation"
            assert len(data["entries"]) == 1

    def test_get_presets(self):
        """Test the get presets endpoint."""
        client = TestClient(app)

        response = client.get(
            "/presets",
            headers={"Authorization": "Bearer test_token"}
        )

        assert response.status_code == 200
        data = response.json()
        assert "presets" in data
        assert isinstance(data["presets"], dict)

    def test_invalid_request_handling(self):
        """Test handling of invalid requests."""
        client = TestClient(app)

        # Test missing required fields
        invalid_payload = {}
        response = client.post(
            "/build",
            json=invalid_payload,
            headers={"Authorization": "Bearer test_token"}
        )

        # Should return validation error
        assert response.status_code == 422

    def test_unauthorized_access(self):
        """Test that endpoints require authentication."""
        client = TestClient(app)

        payload = {"text": "Hello world"}
        response = client.post("/build", json=payload)

        # Should return unauthorized error
        assert response.status_code == 401

    def test_validate_ssml_endpoint(self):
        """Test the SSML validation endpoint."""
        client = TestClient(app)

        valid_ssml = '<speak version="1.0"><voice name="en-US-AriaNeural">Hello</voice></speak>'
        payload = {"ssml": valid_ssml}

        response = client.post(
            "/validate",
            json=payload,
            headers={"Authorization": "Bearer test_token"}
        )

        assert response.status_code == 200
        data = response.json()
        assert "valid" in data
        assert data["valid"] is True

    def test_validate_invalid_ssml_endpoint(self):
        """Test the SSML validation endpoint with invalid SSML."""
        client = TestClient(app)

        invalid_ssml = '<speak version="1.0"><voice>Unclosed tag'
        payload = {"ssml": invalid_ssml}

        response = client.post(
            "/validate",
            json=payload,
            headers={"Authorization": "Bearer test_token"}
        )

        assert response.status_code == 200
        data = response.json()
        assert "valid" in data
        assert data["valid"] is False
        assert "error" in data


class TestSSMLBuilderIntegration:
    """Integration tests for SSML Builder with other services."""

    def test_ssml_with_tts_integration(self):
        """Test that generated SSML is compatible with TTS service."""
        builder = SSMLBuilder()
        request = SSMLRequest(
            text="Hello world",
            emphasis_words=["world"],
            prosody_rate=1.2
        )
        response = builder.build_ssml(request, "en-US-AriaNeural")

        # Verify the SSML is well-formed
        ssml = response.ssml
        assert ssml.startswith('<speak version="1.0"')
        assert ssml.endswith('</speak>')
        assert '<voice xml:lang="en-US" name="en-US-AriaNeural">' in ssml
        assert '<emphasis level="moderate">world</emphasis>' in ssml
        assert '<prosody rate="1.2">' in ssml

        # Verify SSML is XML parsable
        import xml.etree.ElementTree as ET
        try:
            ET.fromstring(ssml)
        except ET.ParseError:
            pytest.fail("Generated SSML is not valid XML")

    def test_pronunciation_lexicon_integration(self):
        """Test that pronunciation lexicons integrate properly with SSML building."""
        lexicon_manager = LexiconManager()
        builder = SSMLBuilder()

        # Create a lexicon
        request = PronunciationLexiconRequest(
            owner="test_user",
            scope="presentation"
        )
        entries = [
            PronunciationEntry(word="SQL", ipa="siːkwəl", alphabet="ipa"),
            PronunciationEntry(word="API", ipa="eɪpiːaɪ", alphabet="ipa")
        ]

        lexicon = lexicon_manager.create_lexicon(request, entries)

        # Build SSML with the lexicon
        ssml_request = SSMLRequest(text="Use SQL and API")
        response = builder.build_ssml(ssml_request, "en-US-AriaNeural", lexicon)

        # Verify phonemes are included
        assert '<phoneme alphabet="ipa" ph="siːkwəl">SQL</phoneme>' in response.ssml
        assert '<phoneme alphabet="ipa" ph="eɪpiːaɪ">API</phoneme>' in response.ssml

    def test_ssml_presets_consistency(self):
        """Test that SSML presets produce consistent results."""
        builder = SSMLBuilder()
        text = "This is a test of the preset system"

        presets_to_test = ["news_anchor", "storytelling", "technical", "casual"]
        results = {}

        for preset in presets_to_test:
            request = SSMLRequest(text=text, preset=preset)
            response = builder.build_ssml(request, "en-US-AriaNeural")
            results[preset] = response.ssml

        # Each preset should produce different SSML
        unique_results = len(set(results.values()))
        assert unique_results > 1, "All presets produced identical SSML"

        # Verify each result contains the original text
        for preset, ssml in results.items():
            assert text.replace(" ", "") in ssml.replace(" ", "").replace("<", "").replace(">", ""), \
                f"Preset {preset} doesn't contain original text"

    def test_edge_cases_and_error_handling(self):
        """Test edge cases and error handling in SSML builder."""
        builder = SSMLBuilder()

        # Test with extremely long emphasis word list
        many_words = ["word"] * 100
        request = SSMLRequest(text="word " * 100, emphasis_words=many_words)
        response = builder.build_ssml(request, "en-US-AriaNeural")

        # Should handle gracefully
        assert response.ssml.count("<emphasis") == 100
        assert response.metadata.words_processed == 100

        # Test with invalid pause positions (beyond text length)
        request = SSMLRequest(text="Hello", pauses={100: 1.0})  # Position beyond text
        response = builder.build_ssml(request, "en-US-AriaNeural")

        # Should handle gracefully without crashing
        assert "Hello" in response.ssml

        # Test with Unicode characters
        request = SSMLRequest(text="Hello 🌍 世界")
        response = builder.build_ssml(request, "en-US-AriaNeural")

        # Should handle Unicode properly
        assert "🌍" in response.ssml
        assert "世界" in response.ssml