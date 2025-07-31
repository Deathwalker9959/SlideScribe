import aiohttp
import os
from .base import TTSEngine
from typing import Dict, Any

class AzureTTSEngine(TTSEngine):
    """Azure Cognitive Services TTS implementation."""
    def __init__(self, api_key: str, region: str):
        self.api_key = api_key
        self.region = region
        self.endpoint = f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"

    async def synthesize(self, text: str, voice: str = "en-US-AriaNeural", speed: float = 1.0, pitch: float = 0, output_format: str = "mp3", **kwargs: Any) -> Dict[str, Any]:
        headers = {
            "Ocp-Apim-Subscription-Key": self.api_key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": output_format,
            "User-Agent": "pptx-tts-service"
        }
        ssml = f'''<speak version='1.0' xml:lang='en-US'><voice name='{voice}'><prosody rate='{speed}' pitch='{pitch}'>{text}</prosody></voice></speak>'''
        async with aiohttp.ClientSession() as session:
            async with session.post(self.endpoint, data=ssml.encode('utf-8'), headers=headers) as resp:
                if resp.status != 200:
                    raise Exception(f"Azure TTS failed: {resp.status} {await resp.text()}")
                audio_data = await resp.read()
                # Save audio to file (in production, use a better storage solution)
                output_dir = os.environ.get("MEDIA_ROOT", "/app/media")
                os.makedirs(output_dir, exist_ok=True)
                import uuid
                filename = f"tts_{uuid.uuid4().hex}.{output_format}"
                file_path = os.path.join(output_dir, filename)
                with open(file_path, "wb") as f:
                    f.write(audio_data)
                return {
                    "audio_url": f"/media/{filename}",
                    "file_path": file_path,
                    "voice_used": voice,
                    "output_format": output_format
                }
