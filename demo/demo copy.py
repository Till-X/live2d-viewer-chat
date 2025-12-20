import asyncio
import os
import random
import queue
import threading
import subprocess
import wave
import tempfile
from typing import AsyncIterator
from volc_tts_client import VolcEngineTTS

# 模拟一个流式输出的 LLM
async def mock_llm_stream(full_text: str) -> AsyncIterator[str]:
    for char in full_text:
        yield char
        # 模拟 LLM 生成延迟
        await asyncio.sleep(random.uniform(0.05, 0.1))

class AudioPlayer:
    def __init__(self):
        self.queue = queue.Queue()
        self.is_playing = False
        self.stop_event = threading.Event()
        self.thread = threading.Thread(target=self._play_loop, daemon=True)
        self.thread.start()

    def _play_loop(self):
        while not self.stop_event.is_set():
            try:
                # 获取音频文件路径
                file_path = self.queue.get(timeout=0.1)
                self.is_playing = True
                
                # 调用系统播放器 (macOS 使用 afplay)
                try:
                    subprocess.run(["afplay", file_path], check=True)
                except Exception as e:
                    print(f"\n播放出错: {e}")
                finally:
                    # 播放完删除临时文件
                    if os.path.exists(file_path):
                        os.unlink(file_path)
                    self.queue.task_done()
                    self.is_playing = False
            except queue.Empty:
                continue

    def add_audio(self, pcm_data: bytes):
        """将 PCM 数据包装成 WAV 文件并添加到播放队列"""
        if not pcm_data:
            return
            
        # 创建临时 WAV 文件
        fd, path = tempfile.mkstemp(suffix=".wav")
        os.close(fd)
        
        with wave.open(path, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)  # 16-bit
            wf.setframerate(24000) # 火山引擎通常是 24k，如果不同需要调整
            wf.writeframes(pcm_data)
            
        self.queue.put(path)

    def wait_done(self):
        self.queue.join()

    def stop(self):
        self.stop_event.set()
        self.thread.join()

async def main():
    # 请替换为您的真实 AppID 和 Access Token
    APP_ID = "5858061796"
    ACCESS_TOKEN = "r3NpcuEDSkGyrv_dBBaTkv3f3CiApQCI"
    
    client = VolcEngineTTS(APP_ID, ACCESS_TOKEN)
    player = AudioPlayer()
    
    llm_text = "你好！这是一个模拟的流式 LLM 输出。我们通过分句合成的方式，实现了边生成边播放的效果。这样不仅解决了文件头的问题，还能让体验更加丝滑。现在，你应该能听到连续的语音了。"
    voice_type = "zh_female_meilinvyou_moon_bigtts"
    output_file = "final_output.wav"
    
    print("开始模拟流式 LLM 对接 TTS (带播放)...")
    print(f"输入文本: {llm_text}\n")
    
    # 用于收集所有 PCM 数据以便最后保存
    full_pcm_data = bytearray()
    
    try:
        llm_stream = mock_llm_stream(llm_text)
        
        # 手动实现分句逻辑，以便按句子播放
        buffer = ""
        punctuations = {"，", "。", "！", "？", "；", ",", ".", "!", "?", ";", "\n"}
        
        async for char in llm_stream:
            buffer += char
            print(char, end="", flush=True)
            
            # 检查标点
            if char in punctuations:
                sentence = buffer.strip()
                if sentence:
                    # 合成该句子 (请求 PCM 格式)
                    sentence_pcm = bytearray()
                    async for chunk in client.synthesize_stream(sentence, voice_type, encoding="pcm"):
                        sentence_pcm.extend(chunk)
                    
                    if sentence_pcm:
                        # 1. 添加到播放队列
                        player.add_audio(sentence_pcm)
                        # 2. 收集到总数据
                        full_pcm_data.extend(sentence_pcm)
                
                buffer = ""
        
        # 处理剩余文本
        if buffer.strip():
            sentence_pcm = bytearray()
            async for chunk in client.synthesize_stream(buffer.strip(), voice_type, encoding="pcm"):
                sentence_pcm.extend(chunk)
            if sentence_pcm:
                player.add_audio(sentence_pcm)
                full_pcm_data.extend(sentence_pcm)

        print("\n\n等待播放完成...")
        # 在异步环境中等待队列清空有点麻烦，简单起见我们用循环检查
        while not player.queue.empty() or player.is_playing:
            await asyncio.sleep(0.5)
            
        # 保存最终的完整 WAV 文件
        with wave.open(output_file, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2) # 16-bit
            wf.setframerate(24000) # 假设 24k，如果声音变快或变慢，请改为 16000
            wf.writeframes(full_pcm_data)
            
        print(f"播放结束。完整音频已保存至: {os.path.abspath(output_file)}")

    except Exception as e:
        print(f"\n发生错误: {e}")
    finally:
        player.stop()

if __name__ == "__main__":
    asyncio.run(main())
