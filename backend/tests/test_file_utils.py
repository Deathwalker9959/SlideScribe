"""Tests for file utilities module."""

from unittest.mock import patch
from typing import Dict, Any
from backend.shared.file_utils import (
    generate_hash, sanitize_filename, ensure_directory,
    validate_text_length, extract_text_from_slide, chunk_text
)


class TestFileUtils:
    """Test file utility functions."""
    
    def test_generate_hash(self) -> None:
        """Test MD5 hash generation."""
        text = "Hello, World!"
        hash_result = generate_hash(text)
        
        # MD5 hash should be 32 characters long
        assert len(hash_result) == 32
        assert isinstance(hash_result, str)
        
        # Same input should produce same hash
        assert generate_hash(text) == hash_result
        
        # Different input should produce different hash
        assert generate_hash("Different text") != hash_result
    
    def test_sanitize_filename_basic(self) -> None:
        """Test basic filename sanitization."""
        filename = "My Document.txt"
        result = sanitize_filename(filename)
        assert result == "My Document.txt"
    
    def test_sanitize_filename_invalid_chars(self) -> None:
        """Test sanitizing filename with invalid characters."""
        filename = 'bad/file\\name:with*invalid"chars<>|?.txt'
        result = sanitize_filename(filename)
        
        invalid_chars = '<>:"/\\|?*'
        for char in invalid_chars:
            assert char not in result
        
        assert result.endswith(".txt")
        assert "_" in result  # Invalid chars should be replaced with underscores
    
    def test_sanitize_filename_empty(self) -> None:
        """Test sanitizing empty filename."""
        result = sanitize_filename("")
        assert result == ""
    
    def test_ensure_directory(self) -> None:
        """Test directory creation."""
        with patch('pathlib.Path.mkdir') as mock_mkdir:
            ensure_directory("/test/path")
            mock_mkdir.assert_called_once_with(parents=True, exist_ok=True)
    
    def test_validate_text_length_within_limit(self) -> None:
        """Test text validation when within length limit."""
        text = "This is a short text."
        result = validate_text_length(text, max_length=100)
        assert result == text
    
    def test_validate_text_length_exceeds_limit(self) -> None:
        """Test text validation when exceeding length limit."""
        text = "A" * 200
        result = validate_text_length(text, max_length=100)
        assert len(result) == 100
        assert result == "A" * 100
    
    def test_validate_text_length_default_limit(self) -> None:
        """Test text validation with default limit."""
        text = "Short text"
        result = validate_text_length(text)
        assert result == text
        
        # Test with text exceeding default limit
        long_text = "A" * 15000
        result = validate_text_length(long_text)
        assert len(result) == 10000
    
    def test_extract_text_from_slide_complete(self) -> None:
        """Test text extraction from slide with all fields."""
        slide_data: Dict[str, Any] = {
            "title": "Slide Title",
            "content": "Main slide content",
            "notes": "Speaker notes"
        }
        
        result = extract_text_from_slide(slide_data)
        expected = "Slide Title Main slide content Speaker notes"
        assert result == expected
    
    def test_extract_text_from_slide_partial(self) -> None:
        """Test text extraction from slide with only some fields."""
        slide_data: Dict[str, Any] = {
            "title": "Only Title",
            "content": None,
            "notes": ""
        }
        
        result = extract_text_from_slide(slide_data)
        assert "Only Title" in result
    
    def test_extract_text_from_slide_empty(self) -> None:
        """Test text extraction from empty slide."""
        slide_data: Dict[str, Any] = {}
        result = extract_text_from_slide(slide_data)
        assert result == ""
    
    def test_chunk_text_short_text(self) -> None:
        """Test text chunking with text shorter than max length."""
        text = "Short text"
        result = chunk_text(text, max_length=100)
        assert result == [text]
        assert len(result) == 1
    
    def test_chunk_text_long_text(self) -> None:
        """Test text chunking with text longer than max length."""
        text = "A" * 1000
        result = chunk_text(text, max_length=300)
        
        # Should produce 4 chunks (300, 300, 300, 100)
        assert len(result) == 4
        assert len(result[0]) == 300
        assert len(result[1]) == 300
        assert len(result[2]) == 300
        assert len(result[3]) == 100
        assert "".join(result) == text
    
    def test_chunk_text_exact_length(self) -> None:
        """Test text chunking with text exactly at max length."""
        text = "A" * 500
        result = chunk_text(text, max_length=500)
        assert result == [text]
        assert len(result) == 1
    
    def test_chunk_text_empty(self) -> None:
        """Test text chunking with empty text."""
        result = chunk_text("", max_length=100)
        assert result == [""]
        assert len(result) == 1
