import httpx
import json
import uuid
import base64
import yaml
import os

class TTSService:
    def __init__(self):
        self.config = self._load_config()
        tts_config = self.config.get('tts', {})
        
        self.appid = tts_config.get('appid', "")
        self.access_token = tts_config.get('access_token', "")
        self.cluster = tts_config.get('cluster', "volcano_tts")
        self.host = "openspeech.bytedance.com"
        self.api_url = f"https://{self.host}/api/v1/tts"
        
        self.default_voice = tts_config.get('voice_type', "zh_female_meilinvyou_moon_bigtts")

    def _load_config(self):
        config_path = "config.yaml"
        if os.path.exists(config_path):
            with open(config_path, 'r', encoding='utf-8') as f:
                return yaml.safe_load(f)
        return {}

    async def synthesize(self, text: str, voice_type: str = None) -> bytes:
        """
        Synthesize text to audio using Volcano Engine HTTP API.
        Returns audio bytes (WAV/MP3).
        """
        if not voice_type:
            voice_type = self.default_voice

        # Construct request body
        # Note: Volcano HTTP API structure might differ slightly from WebSocket
        # Common structure for Volcano HTTP TTS:
        request_json = {
            "app": {
                "appid": self.appid,
                "token": self.access_token,
                "cluster": self.cluster
            },
            "user": {
                "uid": str(uuid.uuid4())
            },
            "audio": {
                "voice_type": voice_type,
                "encoding": "mp3", # Use MP3 for web playback
                "speed_ratio": 1.4,
                "volume_ratio": 1.0,
                "pitch_ratio": 1.0,
            },
            "request": {
                "reqid": str(uuid.uuid4()),
                "text": text,
                "operation": "query", # 'query' for HTTP usually
                "with_timestamp": 0
            }
        }

        headers = {
            "Authorization": f"Bearer; {self.access_token}",
            "Content-Type": "application/json"
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    self.api_url,
                    json=request_json,
                    headers=headers,
                    timeout=10.0
                )
                
                if response.status_code != 200:
                    print(f"TTS Request Payload: {json.dumps(request_json, ensure_ascii=False)}")
                    print(f"TTS Error {response.status_code}: {response.text}")
                    raise Exception(f"TTS API returned {response.status_code}: {response.text}")

                # Response structure check
                # Volcano HTTP API usually returns JSON with "data" field containing base64 audio
                # OR raw binary if headers specified. 
                # Let's assume standard JSON response with base64 'data'
                
                resp_data = response.json()
                if "data" in resp_data:
                    return base64.b64decode(resp_data["data"])
                else:
                    # Some endpoints return raw audio if content-type is audio
                    # But Volcano usually wraps in JSON.
                    # Let's check for error message
                    if "message" in resp_data and resp_data["message"] != "Success":
                         raise Exception(f"TTS API Error: {resp_data['message']}")
                    
                    # Fallback if structure is different
                    raise Exception("Unexpected response format from TTS API")

            except Exception as e:
                print(f"TTS Exception: {e}")
                raise e

# Global instance
tts_service = TTSService()
