import asyncio
from common.llm import LLMClient
from config import AutoCompleteConfig


def test1():
    converstion_id = "TEST1"
    conversations = {}
    conversations[converstion_id] = []
    llm = LLMClient()

    hist = conversations['TEST1']

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

        llm._save_conversation(converstion_id, hist)

    asyncio.run(test_response())


def test2():
    llm = LLMClient()

    async def test_response():
        async for chunk in llm.invoke_stream(
            prompt="```python\n" + "def hello():\n    print('Hello Wor" + "",
            sys_prompt=AutoCompleteConfig.sys_prompt
        ):
            print(chunk, end="", flush=True)

    asyncio.run(test_response())


if __name__ == "__main__":
    # # Test 1: Chat
    # test1()

    # Test 2: LLM 1 time invoke
    test2()
