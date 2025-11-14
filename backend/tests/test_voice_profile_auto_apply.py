"""Tests for voice profile auto-apply service."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from services.voice_profiles.auto_apply import VoiceProfileAutoApply
from services.voice_profiles.manager import VoiceProfileManager
from shared.models import TTSRequest, VoiceProfile, VoiceProfileRequest
from datetime import datetime, UTC


@pytest.fixture
def mock_profile_manager():
    """Create a mock voice profile manager."""
    manager = AsyncMock(spec=VoiceProfileManager)
    manager.list_profiles = AsyncMock(return_value=[])
    manager.get_preferred_settings = AsyncMock(return_value=None)
    manager.set_preferred_settings = AsyncMock()
    manager.create_profile = AsyncMock()
    manager.apply_profile = AsyncMock()
    return manager


@pytest.fixture
def auto_apply_service(mock_profile_manager):
    """Create voice profile auto-apply service with mock manager."""
    return VoiceProfileAutoApply(mock_profile_manager)


@pytest.fixture
def sample_profile():
    """Create a sample voice profile."""
    return VoiceProfile(
        id="profile-123",
        name="Test Profile",
        description="Test voice profile",
        voice="en-US-AriaNeural",
        language="en-US",
        speed=1.0,
        pitch=0.0,
        volume=1.0,
        sample_text="Test sample",
        tags=["test"],
        created_at=datetime.now(UTC),
        updated_at=None,
        last_used_at=None
    )


class TestVoiceProfileAutoApply:
    """Test cases for VoiceProfileAutoApply."""

    @pytest.mark.asyncio
    async def test_get_or_create_default_profile_existing(self, auto_apply_service, mock_profile_manager, sample_profile):
        """Test getting existing default profile."""
        mock_profile_manager.list_profiles.return_value = [sample_profile]
        
        result = await auto_apply_service.get_or_create_default_profile("en-US")
        
        assert result == sample_profile
        mock_profile_manager.list_profiles.assert_called_once()
        mock_profile_manager.create_profile.assert_not_called()

    @pytest.mark.asyncio
    async def test_get_or_create_default_profile_new(self, auto_apply_service, mock_profile_manager):
        """Test creating new default profile."""
        mock_profile_manager.list_profiles.return_value = []
        mock_profile_manager.create_profile.return_value = VoiceProfile(
            id="new-profile",
            name="Default en-US Voice",
            description="Default voice profile for en-US presentations",
            voice="en-US-AriaNeural",
            language="en-US",
            speed=1.0,
            pitch=0.0,
            volume=1.0,
            sample_text="Welcome to this presentation. We'll explore key concepts and insights together.",
            tags=["default", "en-US", "auto-generated"],
            created_at=datetime.now(UTC),
            updated_at=None,
            last_used_at=None
        )
        
        result = await auto_apply_service.get_or_create_default_profile("en-US")
        
        assert result.name == "Default en-US Voice"
        assert result.language == "en-US"
        assert result.voice == "en-US-AriaNeural"
        mock_profile_manager.create_profile.assert_called_once()

    def test_get_default_voice_for_language(self, auto_apply_service):
        """Test getting default voice for different languages."""
        assert auto_apply_service._get_default_voice_for_language("en-US") == "en-US-AriaNeural"
        assert auto_apply_service._get_default_voice_for_language("el-GR") == "el-GR-AthinaNeural"
        assert auto_apply_service._get_default_voice_for_language("unknown") == "en-US-AriaNeural"

    @pytest.mark.asyncio
    async def test_apply_profile_for_context_with_preferred_settings(self, auto_apply_service, mock_profile_manager):
        """Test applying profile with preferred settings."""
        preferred_settings = {
            "voice": "en-US-AriaNeural",
            "speed": 1.2,
            "pitch": -5.0,
            "volume": 0.9,
            "language": "en-US"
        }
        mock_profile_manager.get_preferred_settings.return_value = preferred_settings
        
        result = await auto_apply_service.apply_profile_for_context(
            text="Test text",
            language="en-US",
            owner_id="user-123",
            presentation_id="pres-456"
        )
        
        assert isinstance(result, TTSRequest)
        assert result.text == "Test text"
        assert result.voice == "en-US-AriaNeural"
        assert result.speed == 1.2
        assert result.pitch == -5.0
        assert result.volume == 0.9
        assert result.language == "en-US"

    @pytest.mark.asyncio
    async def test_apply_profile_for_context_with_matching_profile(self, auto_apply_service, mock_profile_manager, sample_profile):
        """Test applying profile with matching language profile."""
        mock_profile_manager.get_preferred_settings.return_value = None
        mock_profile_manager.list_profiles.return_value = [sample_profile]
        mock_profile_manager.apply_profile.return_value = TTSRequest(
            text="Test text",
            voice=sample_profile.voice,
            speed=sample_profile.speed,
            pitch=sample_profile.pitch,
            volume=sample_profile.volume,
            language=sample_profile.language
        )
        
        result = await auto_apply_service.apply_profile_for_context(
            text="Test text",
            language="en-US",
            owner_id="user-123",
            presentation_id="pres-456"
        )
        
        assert isinstance(result, TTSRequest)
        assert result.text == "Test text"
        assert result.voice == sample_profile.voice
        mock_profile_manager.apply_profile.assert_called_once()

    @pytest.mark.asyncio
    async def test_apply_profile_for_context_with_fallback(self, auto_apply_service, mock_profile_manager):
        """Test applying profile with fallback settings."""
        mock_profile_manager.get_preferred_settings.return_value = None
        mock_profile_manager.list_profiles.return_value = []
        
        fallback_settings = {
            "voice": "en-US-AriaNeural",
            "speed": 1.1,
            "pitch": 2.0,
            "volume": 0.8,
            "language": "en-US"
        }
        
        result = await auto_apply_service.apply_profile_for_context(
            text="Test text",
            language="en-US",
            owner_id="user-123",
            presentation_id="pres-456",
            fallback_settings=fallback_settings
        )
        
        assert isinstance(result, TTSRequest)
        assert result.text == "Test text"
        assert result.voice == "en-US-AriaNeural"
        assert result.speed == 1.1
        assert result.pitch == 2.0
        assert result.volume == 0.8

    @pytest.mark.asyncio
    async def test_apply_profile_for_context_default_fallback(self, auto_apply_service, mock_profile_manager):
        """Test applying profile with system defaults."""
        mock_profile_manager.get_preferred_settings.return_value = None
        mock_profile_manager.list_profiles.return_value = []
        
        result = await auto_apply_service.apply_profile_for_context(
            text="Test text",
            language="en-US",
            owner_id="user-123",
            presentation_id="pres-456"
        )
        
        assert isinstance(result, TTSRequest)
        assert result.text == "Test text"
        assert result.voice == "en-US-AriaNeural"
        assert result.speed == 1.0
        assert result.pitch == 0.0
        assert result.volume == 1.0
        assert result.language == "en-US"

    @pytest.mark.asyncio
    async def test_save_preferred_settings(self, auto_apply_service, mock_profile_manager):
        """Test saving preferred settings."""
        settings = {
            "voice": "en-US-AriaNeural",
            "speed": 1.1,
            "pitch": -2.0,
            "volume": 0.9
        }
        
        await auto_apply_service.save_preferred_settings(
            owner_id="user-123",
            presentation_id="pres-456",
            settings=settings
        )
        
        mock_profile_manager.set_preferred_settings.assert_called_once_with(
            owner_id="user-123",
            presentation_id="pres-456",
            settings=settings
        )

    @pytest.mark.asyncio
    async def test_get_recommended_profile_with_tone(self, auto_apply_service, mock_profile_manager, sample_profile):
        """Test getting recommended profile with tone preference."""
        sample_profile.tags = ["professional", "business"]
        mock_profile_manager.list_profiles.return_value = [sample_profile]
        
        result = await auto_apply_service.get_recommended_profile(
            language="en-US",
            tone="professional"
        )
        
        assert result == sample_profile

    @pytest.mark.asyncio
    async def test_get_recommended_profile_with_style(self, auto_apply_service, mock_profile_manager, sample_profile):
        """Test getting recommended profile with style preference."""
        sample_profile.description = "Narration style voice for presentations"
        mock_profile_manager.list_profiles.return_value = [sample_profile]
        
        result = await auto_apply_service.get_recommended_profile(
            language="en-US",
            style="narration"
        )
        
        assert result == sample_profile

    @pytest.mark.asyncio
    async def test_get_recommended_profile_most_recent(self, auto_apply_service, mock_profile_manager):
        """Test getting most recently used profile when no specific match."""
        old_profile = VoiceProfile(
            id="old-profile",
            name="Old Profile",
            description="Old profile",
            voice="en-US-AriaNeural",
            language="en-US",
            speed=1.0,
            pitch=0.0,
            volume=1.0,
            tags=[],
            created_at=datetime.now(UTC),
            updated_at=None,
            last_used_at=datetime(2023, 1, 1, tzinfo=UTC)
        )
        
        recent_profile = VoiceProfile(
            id="recent-profile",
            name="Recent Profile",
            description="Recent profile",
            voice="en-US-AriaNeural",
            language="en-US",
            speed=1.0,
            pitch=0.0,
            volume=1.0,
            tags=[],
            created_at=datetime.now(UTC),
            updated_at=None,
            last_used_at=datetime.now(UTC)
        )
        
        mock_profile_manager.list_profiles.return_value = [old_profile, recent_profile]
        
        result = await auto_apply_service.get_recommended_profile(language="en-US")
        
        assert result == recent_profile

    @pytest.mark.asyncio
    async def test_get_recommended_profile_no_match(self, auto_apply_service, mock_profile_manager):
        """Test getting recommended profile when no match exists."""
        mock_profile_manager.list_profiles.return_value = []
        
        result = await auto_apply_service.get_recommended_profile(language="en-US")
        
        assert result is None

    @pytest.mark.asyncio
    async def test_create_profile_from_settings(self, auto_apply_service, mock_profile_manager):
        """Test creating profile from settings."""
        settings = {
            "voice": "en-US-AriaNeural",
            "language": "en-US",
            "speed": 1.1,
            "pitch": -2.0,
            "volume": 0.9,
            "sample_text": "Custom sample text"
        }
        
        expected_profile = VoiceProfile(
            id="new-profile",
            name="Custom Profile",
            description="Custom voice profile",
            voice="en-US-AriaNeural",
            language="en-US",
            speed=1.1,
            pitch=-2.0,
            volume=0.9,
            sample_text="Custom sample text",
            tags=["custom"],
            created_at=datetime.now(UTC),
            updated_at=None,
            last_used_at=None
        )
        
        mock_profile_manager.create_profile.return_value = expected_profile
        
        result = await auto_apply_service.create_profile_from_settings(
            name="Custom Profile",
            settings=settings,
            description="Custom voice profile",
            tags=["custom"]
        )
        
        assert result == expected_profile
        mock_profile_manager.create_profile.assert_called_once()

    def test_create_tts_request_from_settings(self, auto_apply_service):
        """Test creating TTS request from settings."""
        settings = {
            "voice": "en-US-AriaNeural",
            "speed": 1.2,
            "pitch": -5.0,
            "volume": 0.8,
            "language": "en-US"
        }
        
        result = auto_apply_service._create_tts_request_from_settings("Test text", settings)
        
        assert isinstance(result, TTSRequest)
        assert result.text == "Test text"
        assert result.voice == "en-US-AriaNeural"
        assert result.speed == 1.2
        assert result.pitch == -5.0
        assert result.volume == 0.8
        assert result.language == "en-US"

    @pytest.mark.asyncio
    async def test_error_handling_in_get_or_create_default(self, auto_apply_service, mock_profile_manager):
        """Test error handling when creating default profile fails."""
        mock_profile_manager.list_profiles.side_effect = Exception("List failed")
        mock_profile_manager.create_profile.side_effect = Exception("Create failed")
        
        result = await auto_apply_service.get_or_create_default_profile("en-US")
        
        # Should return fallback profile
        assert result.id == "fallback-default"
        assert result.name == "Fallback Default en-US"
        assert result.voice == "en-US-AriaNeural"

    @pytest.mark.asyncio
    async def test_error_handling_in_apply_profile(self, auto_apply_service, mock_profile_manager):
        """Test error handling in apply_profile_for_context."""
        mock_profile_manager.get_preferred_settings.side_effect = Exception("Settings failed")
        mock_profile_manager.list_profiles.side_effect = Exception("List failed")
        
        result = await auto_apply_service.apply_profile_for_context(
            text="Test text",
            language="en-US",
            fallback_settings={"voice": "fallback-voice"}
        )
        
        # Should use fallback settings
        assert isinstance(result, TTSRequest)
        assert result.voice == "fallback-voice"