"""
File and text processing utilities.
"""
import hashlib
from pathlib import Path
from typing import List, Dict, Any


def generate_hash(text: str) -> str:
    """
    Generate MD5 hash for caching purposes.
    
    Args:
        text: Text to hash
        
    Returns:
        MD5 hash as hexadecimal string
    """
    return hashlib.md5(text.encode()).hexdigest()


def sanitize_filename(filename: str) -> str:
    """
    Sanitize filename for safe storage.
    
    Args:
        filename: Original filename
        
    Returns:
        Sanitized filename safe for filesystem
    """
    invalid_chars = '<>:"/\\|?*'
    for char in invalid_chars:
        filename = filename.replace(char, '_')
    return filename


def ensure_directory(path: str) -> None:
    """
    Ensure directory exists, create if not.
    
    Args:
        path: Directory path to create
    """
    Path(path).mkdir(parents=True, exist_ok=True)


def validate_text_length(text: str, max_length: int = 10000) -> str:
    """
    Validate and truncate text if necessary.
    
    Args:
        text: Input text
        max_length: Maximum allowed length
        
    Returns:
        Validated/truncated text
    """
    if len(text) > max_length:
        return text[:max_length]
    return text


def extract_text_from_slide(slide_data: Dict[str, Any]) -> str:
    """
    Extract text content from slide data.
    
    Args:
        slide_data: Dictionary containing slide information
        
    Returns:
        Concatenated text from slide
    """
    text_parts: List[str] = []
    
    if slide_data.get('title'):
        text_parts.append(str(slide_data['title']))
    
    if slide_data.get('content'):
        text_parts.append(str(slide_data['content']))
    
    if slide_data.get('notes'):
        text_parts.append(str(slide_data['notes']))
    
    return ' '.join(text_parts)


def chunk_text(text: str, max_length: int = 500) -> List[str]:
    """
    Split text into chunks for processing, preserving all characters.
    
    Args:
        text: Text to split
        max_length: Maximum length per chunk
        
    Returns:
        List of text chunks
    """
    if len(text) <= max_length:
        return [text]
    
    chunks: List[str] = []
    start = 0
    while start < len(text):
        end = min(start + max_length, len(text))
        chunks.append(text[start:end])
        start = end
    
    return chunks
