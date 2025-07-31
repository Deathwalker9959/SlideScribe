"""
Media and subtitle processing utilities.
"""
from typing import List, Dict, Any


def format_time_for_subtitle(seconds: float) -> str:
    """
    Format time in seconds to SRT time format (HH:MM:SS,mmm).
    
    Args:
        seconds: Time in seconds
        
    Returns:
        Formatted time string for SRT subtitles
    """
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    milliseconds = int((seconds % 1) * 1000)
    
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{milliseconds:03d}"


def generate_srt_content(subtitles: List[Dict[str, Any]]) -> str:
    """
    Generate SRT subtitle content from subtitle data.
    
    Args:
        subtitles: List of subtitle dictionaries with start_time, end_time, and text
        
    Returns:
        Complete SRT subtitle content as string
    """
    srt_content: List[str] = []
    
    for i, subtitle in enumerate(subtitles, 1):
        start_time = format_time_for_subtitle(subtitle['start_time'])
        end_time = format_time_for_subtitle(subtitle['end_time'])
        text = subtitle['text']
        
        srt_content.append(f"{i}")
        srt_content.append(f"{start_time} --> {end_time}")
        srt_content.append(text)
        srt_content.append("")  # Empty line between subtitles
    
    return '\n'.join(srt_content)


def validate_subtitle_timing(subtitles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Validate and fix subtitle timing issues.
    
    Args:
        subtitles: List of subtitle dictionaries
        
    Returns:
        List of validated subtitle dictionaries
    """
    validated: List[Dict[str, Any]] = []
    
    for subtitle in subtitles:
        # Ensure start time is before end time
        if subtitle['start_time'] >= subtitle['end_time']:
            subtitle['end_time'] = subtitle['start_time'] + 1.0
        
        # Ensure minimum duration of 0.5 seconds
        duration = subtitle['end_time'] - subtitle['start_time']
        if duration < 0.5:
            subtitle['end_time'] = subtitle['start_time'] + 0.5
        
        validated.append(subtitle)
    
    return validated
