"""
SSML Builder Service

Service for generating SSML markup with pronunciation lexicons,
prosody control, and voice customization for Azure Speech Services.
"""

from .builder import SSMLBuilder
from .lexicon_manager import LexiconManager

__all__ = ["SSMLBuilder", "LexiconManager"]