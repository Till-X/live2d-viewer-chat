from openai import AsyncOpenAI
import yaml
import os

class LLMService:
    def __init__(self):
        self.config = self._load_config()
        llm_config = self.config.get('llm', {})
        
        self.api_key = llm_config.get("api_key", os.environ.get("ARK_API_KEY", "YOUR_API_KEY"))
        self.base_url = llm_config.get("base_url", "https://ark.cn-beijing.volces.com/api/v3")
        self.model = llm_config.get("model", "deepseek-v3-1-terminus")
        
        self.client = AsyncOpenAI(
            base_url=self.base_url,
            api_key=self.api_key
        )
        
        self.system_prompt = llm_config.get("system_prompt", "你是一个可爱的二次元少女，说话语气活泼，喜好嘻嘻嘻。")
        self.history = []

    def _load_config(self):
        config_path = "config.yaml"
        if os.path.exists(config_path):
            with open(config_path, 'r', encoding='utf-8') as f:
                return yaml.safe_load(f)
        return {}

    async def chat_stream(self, user_input: str):
        self.history.append({"role": "user", "content": user_input})
        
        messages = [
            {"role": "system", "content": self.system_prompt}
        ] + self.history
        
        if self.api_key == "YOUR_API_KEY":
            import asyncio
            # Mock streaming
            mock_text = f"This is a mock response because no ARK_API_KEY is set. You said: {user_input} 😸"
            for char in mock_text:
                await asyncio.sleep(0.05)
                yield char
            
            full_response = mock_text
        else:
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                stream=True
            )
            
            full_response = ""
            async for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    full_response += content
                    yield content
        
        # Update history
        self.history.append({"role": "assistant", "content": full_response})
        if len(self.history) > 20:
            self.history = self.history[-20:]

    def update_system_prompt(self, new_prompt: str):
        self.system_prompt = new_prompt

    def clear_history(self):
        self.history = []

# Global instance
llm_service = LLMService()
