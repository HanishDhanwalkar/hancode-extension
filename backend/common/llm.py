import json
import asyncio
from ollama import AsyncClient

from common.logging_service import Logger
from config import LLMConfig


logger = Logger(__name__).get_logger()

conversations = {
    "SIDEBAR_CHAT": [],
    "CH001": []
}


class LLMClient():
    def __init__(self, model_name: str = LLMConfig.LLM_MODEL, llm_options: dict = LLMConfig.llm_options) -> None:
        self.client = AsyncClient()
        self.model_name = model_name
        self.llm_options = llm_options
        self._client_pool = None
        self.conversions = conversations

        logger.info(f"LLM client initialised with model: {self.model_name}")

    async def invoke_stream(self, prompt: str, sys_prompt: str):
        """
        One time invocation, no message history passed

        TODO: Save invocation history
        """
        messages = []
        self._add_sys_prompt(sys_prompt, messages)
        self._add_user_msg(prompt, messages)

        # Yield from the async generator
        async for chunk in self.stream_processor(messages):
            if "partial" in chunk:
                yield chunk.get('partial')

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
        full_response = ""

        async for part in await self.client.chat(
            model=self.model_name,
            messages=messages,
            stream=True,
            options=self.llm_options
        ):
            if not part['done']:
                content = part['message']['content']
                if content:
                    full_response += content
                    yield {"partial": content}

        yield {"complete": full_response}

    def _save_conversation(self, conversation_id: str, messages: list) -> bool:
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
