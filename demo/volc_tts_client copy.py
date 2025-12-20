import json
import logging
import uuid
import websockets
import asyncio
from typing import Optional, AsyncIterator, List
from protocols.protocols import MsgType, full_client_request, receive_message

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("VolcEngineTTS")

class VolcEngineTTS:
    def __init__(self, appid: str, access_token: str, cluster: str = "volcano_tts", endpoint: str = "wss://openspeech.bytedance.com/api/v1/tts/ws_binary"):
        self.appid = appid
        self.access_token = access_token
        self.cluster = cluster
        self.endpoint = endpoint

    @staticmethod
    def get_cluster(voice: str) -> str:
        if voice.startswith("S_"):
            return "volcano_icl"
        return "volcano_tts"

    async def synthesize_stream(self, text: str, voice_type: str, encoding: str = "wav", speed: float = 1.0, volume: float = 1.0, pitch: float = 1.0) -> AsyncIterator[bytes]:
        """
        合成语音并流式返回音频数据
        
        :param text: 要合成的文本
        :param voice_type: 音色类型
        :param encoding: 音频编码格式 (wav, pcm, mp3 等)
        :param speed: 语速 (0.2 - 3.0)
        :param volume: 音量 (0.2 - 3.0)
        :param pitch: 音高 (0.2 - 3.0)
        :return: 音频数据流 (AsyncIterator[bytes])
        """
        
        # 自动判断 cluster
        current_cluster = self.cluster
        if not current_cluster:
            current_cluster = self.get_cluster(voice_type)

        headers = {
            "Authorization": f"Bearer;{self.access_token}",
        }

        logger.info(f"Connecting to {self.endpoint}")
        
        try:
            async with websockets.connect(self.endpoint, additional_headers=headers, max_size=10 * 1024 * 1024) as websocket:
                logger.info(f"Connected, Logid: {websocket.response.headers.get('x-tt-logid')}")

                # 构造请求参数
                request_params = {
                    "app": {
                        "appid": self.appid,
                        "token": self.access_token,
                        "cluster": current_cluster,
                    },
                    "user": {
                        "uid": str(uuid.uuid4()),
                    },
                    "audio": {
                        "voice_type": voice_type,
                        "encoding": encoding,
                        "speed_ratio": speed,
                        "volume_ratio": volume,
                        "pitch_ratio": pitch,
                    },
                    "request": {
                        "reqid": str(uuid.uuid4()),
                        "text": text,
                        "operation": "submit",
                        "with_timestamp": "1",
                        "extra_param": json.dumps({
                            "disable_markdown_filter": False,
                        }),
                    },
                }

                # 发送请求
                await full_client_request(websocket, json.dumps(request_params).encode())

                # 接收音频数据
                while True:
                    msg = await receive_message(websocket)

                    if msg.type == MsgType.FrontEndResultServer:
                        continue
                    elif msg.type == MsgType.AudioOnlyServer:
                        if msg.payload:
                            yield msg.payload
                        if msg.sequence < 0:  # Last message
                            break
                    else:
                        raise RuntimeError(f"TTS conversion failed: {msg}")

        except Exception as e:
            logger.error(f"Synthesis failed: {e}")
            raise

    async def synthesize(self, text: str, voice_type: str, output_file: str, encoding: str = "wav", speed: float = 1.0, volume: float = 1.0, pitch: float = 1.0):
        """
        合成语音并保存到文件 (兼容旧接口)
        """
        audio_data = bytearray()
        async for chunk in self.synthesize_stream(text, voice_type, encoding, speed, volume, pitch):
            audio_data.extend(chunk)
            
        if not audio_data:
            raise RuntimeError("No audio data received")

        # 保存文件
        with open(output_file, "wb") as f:
            f.write(audio_data)
        logger.info(f"Audio saved to {output_file}, size: {len(audio_data)} bytes")

    async def process_llm_stream(self, text_stream: AsyncIterator[str], voice_type: str, encoding: str = "wav", speed: float = 1.0, volume: float = 1.0, pitch: float = 1.0) -> AsyncIterator[bytes]:
        """
        处理 LLM 的流式文本输入，自动分句并合成语音
        
        :param text_stream: LLM 的文本输出流 (AsyncIterator[str])
        :param voice_type: 音色类型
        :return: 音频数据流 (AsyncIterator[bytes])
        """
        buffer = ""
        # 简单的分句标点
        punctuations = {"，", "。", "！", "？", "；", ",", ".", "!", "?", ";", "\n"}
        
        async for chunk in text_stream:
            buffer += chunk
            
            # 检查是否有标点
            last_punc_index = -1
            for i, char in enumerate(buffer):
                if char in punctuations:
                    # 找到一个完整的句子，发送给 TTS
                    sentence = buffer[:i+1].strip()
                    if sentence:
                        async for audio_chunk in self.synthesize_stream(sentence, voice_type, encoding, speed, volume, pitch):
                            yield audio_chunk
                    
                    # 更新 buffer，保留剩余部分
                    buffer = buffer[i+1:]
                    break # 这里简化处理，每次只处理第一个发现的句子，剩下的留到下一次或者继续循环
            
            # 实际上上面的逻辑有 bug，如果 buffer 里有多个句子，应该一次性处理完
            # 修正逻辑：
            while True:
                found_punc = False
                for i, char in enumerate(buffer):
                    if char in punctuations:
                        sentence = buffer[:i+1].strip()
                        buffer = buffer[i+1:]
                        found_punc = True
                        if sentence:
                             async for audio_chunk in self.synthesize_stream(sentence, voice_type, encoding, speed, volume, pitch):
                                yield audio_chunk
                        break
                if not found_punc:
                    break
        
        # 处理剩余的文本
        if buffer.strip():
             async for audio_chunk in self.synthesize_stream(buffer.strip(), voice_type, encoding, speed, volume, pitch):
                yield audio_chunk
