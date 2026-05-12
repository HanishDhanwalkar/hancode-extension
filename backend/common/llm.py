import json
import asyncio
from ollama import AsyncClient

conversations = {
    "CH001": []
}


class LLMClient():
    def __init__(self) -> None:
        self.client = AsyncClient()
        self.model_name = 'llama3.2'
        self.temperature = 0.7

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
                'temperature': self.temperature
            }
        ):

            if not part['done']:
                content = part['message']['content']
                if content:
                    full_response += content
                    yield {"partial": content}

        yield {"complete": full_response}

    def _save_conversation(self, conversation_id: str, messages: list) -> None:
        conversations[conversation_id] = messages

        with open('store/conversations.json', 'r') as f:
            all_conversations = json.load(f)

        all_conversations[conversation_id] = messages

        with open('store/conversations.json', 'w') as f:
            f.write(json.dumps(all_conversations))


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
            print(chunk.get('partial'), end='', flush=True)

        llm._add_assistant_msg(chunk.get('complete'), hist)

    asyncio.run(test_response())

    llm._save_conversation('CH001', hist)
