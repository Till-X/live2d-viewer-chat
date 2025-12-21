#coding=utf-8

import asyncio
import base64
import gzip
import hmac
import json
import logging
import uuid
import wave
from enum import Enum
from hashlib import sha256
from io import BytesIO
from urllib.parse import urlparse
import websockets
import yaml
import os

# --- Protocol Constants ---
PROTOCOL_VERSION = 0b0001
DEFAULT_HEADER_SIZE = 0b0001

PROTOCOL_VERSION_BITS = 4
HEADER_BITS = 4
MESSAGE_TYPE_BITS = 4
MESSAGE_TYPE_SPECIFIC_FLAGS_BITS = 4
MESSAGE_SERIALIZATION_BITS = 4
MESSAGE_COMPRESSION_BITS = 4
RESERVED_BITS = 8

# Message Type:
CLIENT_FULL_REQUEST = 0b0001
CLIENT_AUDIO_ONLY_REQUEST = 0b0010
SERVER_FULL_RESPONSE = 0b1001
SERVER_ACK = 0b1011
SERVER_ERROR_RESPONSE = 0b1111

# Message Type Specific Flags
NO_SEQUENCE = 0b0000
POS_SEQUENCE = 0b0001
NEG_SEQUENCE = 0b0010
NEG_SEQUENCE_1 = 0b0011

# Message Serialization
NO_SERIALIZATION = 0b0000
JSON = 0b0001
THRIFT = 0b0011
CUSTOM_TYPE = 0b1111

# Message Compression
NO_COMPRESSION = 0b0000
GZIP = 0b0001
CUSTOM_COMPRESSION = 0b1111

def generate_header(
    version=PROTOCOL_VERSION,
    message_type=CLIENT_FULL_REQUEST,
    message_type_specific_flags=NO_SEQUENCE,
    serial_method=JSON,
    compression_type=NO_COMPRESSION, # Default to NO_COMPRESSION for stability
    reserved_data=0x00,
    extension_header=bytes()
):
    header = bytearray()
    header_size = int(len(extension_header) / 4) + 1
    header.append((version << 4) | header_size)
    header.append((message_type << 4) | message_type_specific_flags)
    header.append((serial_method << 4) | compression_type)
    header.append(reserved_data)
    header.extend(extension_header)
    return header

def generate_full_default_header():
    return generate_header()

def generate_audio_default_header():
    return generate_header(
        message_type=CLIENT_AUDIO_ONLY_REQUEST
    )

def generate_last_audio_default_header():
    return generate_header(
        message_type=CLIENT_AUDIO_ONLY_REQUEST,
        message_type_specific_flags=NEG_SEQUENCE
    )

def parse_response(res):
    if isinstance(res, str):
        # If we receive a text frame, it might be a plain JSON error from Volcano
        try:
            return {"payload_msg": json.loads(res), "payload_size": len(res)}
        except:
            print(f"Received non-JSON text frame: {res}")
            return {}
            
    protocol_version = res[0] >> 4
    header_size = res[0] & 0x0f
    message_type = res[1] >> 4
    message_type_specific_flags = res[1] & 0x0f
    serialization_method = res[2] >> 4
    message_compression = res[2] & 0x0f
    reserved = res[3]
    header_extensions = res[4:header_size * 4]
    payload = res[header_size * 4:]
    result = {}
    payload_msg = None
    payload_size = 0
    if message_type == SERVER_FULL_RESPONSE:
        payload_size = int.from_bytes(payload[:4], "big", signed=True)
        payload_msg = payload[4:]
    elif message_type == SERVER_ACK:
        seq = int.from_bytes(payload[:4], "big", signed=True)
        result['seq'] = seq
        if len(payload) >= 8:
            payload_size = int.from_bytes(payload[4:8], "big", signed=False)
            payload_msg = payload[8:]
    elif message_type == SERVER_ERROR_RESPONSE:
        code = int.from_bytes(payload[:4], "big", signed=False)
        result['code'] = code
        payload_size = int.from_bytes(payload[4:8], "big", signed=False)
        payload_msg = payload[8:]
    if payload_msg is None:
        return result
    if message_compression == GZIP:
        payload_msg = gzip.decompress(payload_msg)
    if serialization_method == JSON:
        payload_msg = json.loads(str(payload_msg, "utf-8"))
    elif serialization_method != NO_SERIALIZATION:
        payload_msg = str(payload_msg, "utf-8")
    result['payload_msg'] = payload_msg
    result['payload_size'] = payload_size
    return result

class ASRService:
    def __init__(self):
        self.config = self._load_config()
        asr_config = self.config.get('asr', {})
        
        self.appid = asr_config.get('appid', "")
        self.token = asr_config.get('token', "")
        self.cluster = asr_config.get('cluster', "volcengine_streaming_common")
        self.ws_url = "wss://openspeech.bytedance.com/api/v2/asr"
        self.uid = "live2d_viewer_asr"
        self.workflow = "audio_in,resample,partition,vad,fe,decode,itn,nlu_punctuate"
        self.format = "pcm" # Front-end sends raw PCM, so use 'pcm' or 'raw'
        self.rate = 16000
        self.bits = 16
        self.channel = 1
        self.codec = "raw" 
        self.secret = "access_secret"
        self.auth_method = "token"

    def _load_config(self):
        config_path = "config.yaml"
        if os.path.exists(config_path):
            with open(config_path, 'r', encoding='utf-8') as f:
                return yaml.safe_load(f)
        return {}

    def construct_request(self, reqid):
        return {
            'app': {
                'appid': self.appid,
                'cluster': self.cluster,
                'token': self.token,
            },
            'user': {
                'uid': self.uid
            },
            'request': {
                'reqid': reqid,
                'nbest': 1,
                'workflow': self.workflow,
                'show_language': False,
                'show_utterances': False,
                'result_type': "full",
                'sequence': 1
            },
            'audio': {
                'format': self.format,
                'rate': self.rate,
                'language': "zh-CN",
                'bits': self.bits,
                'channel': self.channel,
                'codec': self.codec
            }
        }

    def token_auth(self):
        return {'Authorization': 'Bearer; {}'.format(self.token)}

    async def stream_asr(self, audio_stream):
        """
        Processes an incoming audio stream and yields transcription results.
        :param audio_stream: An async iterator yielding bytes
        """
        reqid = str(uuid.uuid4())
        request_params = self.construct_request(reqid)
        payload_bytes = str.encode(json.dumps(request_params))
        # payload_bytes = gzip.compress(payload_bytes) # Disable GZIP
        
        full_client_request = bytearray(generate_full_default_header())
        full_client_request.extend((len(payload_bytes)).to_bytes(4, 'big'))
        full_client_request.extend(payload_bytes)
        
        header = self.token_auth()

        try:
            # Note: websockets 14.0+ changed extra_headers to additional_headers
            # But checking installed version 15.0.1, it should be additional_headers.
            # However, older versions used extra_headers.
            # Let's try to adapt or use the correct one based on version, but since we know it's 15.0.1+
            # Use additional_headers
            
            # Refactored Logic with Concurrency:
            async with websockets.connect(self.ws_url, additional_headers=header, max_size=1000000000) as ws:
                # 1. Send Handshake
                await ws.send(full_client_request)
                
                # 2. Define Sender and Receiver
                async def sender():
                    async for chunk in audio_stream:
                        # payload_bytes = gzip.compress(chunk) # Disable GZIP if NO_COMPRESSION
                        payload_bytes = chunk # Send raw PCM
                        audio_only_request = bytearray(generate_audio_default_header())
                        audio_only_request.extend((len(payload_bytes)).to_bytes(4, 'big'))
                        audio_only_request.extend(payload_bytes)
                        await ws.send(audio_only_request)
                    
                    # Send Last Audio Packet
                    last_request = bytearray(generate_last_audio_default_header())
                    last_request.extend((0).to_bytes(4, 'big')) 
                    await ws.send(last_request)

                # Run concurrently
                sender_task = asyncio.create_task(sender())
                
                # Receiver Loop with Timeout Control
                try:
                    while True:
                        # Determine timeout: if sender is done, wait briefly for final results then exit
                        # If sender is running, wait indefinitely (None)
                        # Adjusted timeout to 0.5s to balance latency and tail-end audio processing
                        timeout = 0.5 if sender_task.done() else None
                        
                        try:
                            msg = await asyncio.wait_for(ws.recv(), timeout=timeout)
                            
                            result = parse_response(msg)
                            if 'payload_msg' in result and result['payload_msg']['message'] == 'Success':
                                    payload = result['payload_msg']
                                    if 'result' in payload and len(payload['result']) > 0:
                                        text = payload['result'][0]['text']
                                        yield {"text": text, "is_final": False}
                            elif 'payload_msg' in result and result['payload_msg']['code'] != 1000:
                                    print(f"ASR Error: {result['payload_msg']}")
                                    
                        except asyncio.TimeoutError:
                            # If timeout occurs and sender is done, assume transmission is complete
                            if sender_task.done():
                                break
                            else:
                                continue # Should not happen with timeout=None
                                
                except websockets.exceptions.ConnectionClosed:
                    print("ASR Connection Closed by Server")
                except Exception as e:
                    print(f"Receiver Error: {e}")
                
                try:
                    if not sender_task.done():
                        sender_task.cancel()
                    await sender_task
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                     print(f"Sender Error: {e}")

        except Exception as e:
            print(f"ASR Connection Error: {e}")
            yield {"error": str(e)}

# Global instance
asr_service = ASRService()
