import json
import asyncio
from ollama import AsyncClient

from config import LLMConfig
from common.logging_service import Logger


logger = Logger(__name__).get_logger()

conversations = {
    "SIDEBAR_CHAT": [],
    "CH001": []
}


class LLMClient():
    def __init__(self) -> None:
        self.client = AsyncClient()
        self.model_name = LLMConfig.LLM_MODEL
        self.temperature = LLMConfig.temperature
        self._client_pool = None
        
        logger.info(f"LLM client initialised with model: {self.model_name}")

    def _add_msg(self, text: str, role: str, messages: list) -> list:
        messages.append({'role': role, 'content': text})
        return messages

    def _add_sys_prompt(self, text: str, messages: list) -> list:
        self._add_msg(text, 'system', messages)

    def _add_user_msg(self, text: str, messages: list) -> list:
        self._add_msg(text, 'user', messages)

    def _add_assistant_msg(self, text: str, messages: list) -> list:
        self._add_msg(text, 'assistant', messages)

    async def stream_processor(self, messages: list):
        """
        messages = [{'role': 'user', 'content': text}]
        """
        full_response = ""

        async for part in await self.client.chat(
            model=self.model_name,
            messages=messages,
            stream=True,
            options={
                'stop': ["```"],
                'temperature': self.temperature,
                "num_predict": 512
            },
        ):

            if not part['done']:
                content = part['message']['content']
                if content:
                    full_response += content
                    yield {"partial": content}

        yield {"complete": full_response}

    def _save_conversation(self, conversation_id: str, messages: list) -> bool
        conversations[conversation_id] = messages

        try:
            with open('store/conversations.json', 'r') as f:
                all_conversations = json.load(f)

        except (FileNotFoundError, json.JSONDecodeError):
            all_conversations = {}
            
        all_conversations[conversation_id] = messages

        with open('store/conversations.json', 'w') as f:
            json.dump(all_conversations, f)

        logger.info(f"[save_conversation] Status: Done")


if __name__ == "__main__":
    llm = LLMClient()

    hist = conversations['CH001']

    sys_prompt = "You are a Expert Coding asssisant."
    llm._add_sys_prompt(sys_prompt, hist)

    user_query = "Add doctring in Google style to this code: def hello():\n    print('Hello World')"
    llm._add_user_msg(user_query, hist)

    assisant_prefill = """```python"""
    llm._add_assistant_msg(assisant_prefill, hist)

    async def test_response():
        async for chunk in llm.stream_processor(hist):
            if "partial" in chunk:
                print(chunk.get('partial'), end="", flush=True)
            elif "complete" in chunk:
                full = chunk.get('complete')
                llm._add_assistant_msg(full, hist)

        llm._save_conversation('CH001', hist)
        
    asyncio.run(test_response())
