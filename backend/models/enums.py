from enum import Enum

class VoiceGender(str, Enum):
    MALE = "male"
    FEMALE = "female"
    NEUTRAL = "neutral"

class TextRefinementType(str, Enum):
    GRAMMAR = "grammar"
    STYLE = "style"
    TONE = "tone"
    CLARITY = "clarity"
    FORMALITY = "formality"

class ExportFormat(str, Enum):
    MP4 = "mp4"
    PPTX = "pptx"
    AUDIO_MP3 = "mp3"
    AUDIO_WAV = "wav"
