import json
from fastapi import FastAPI
from fastapi.responses import StreamingResponse

from src.schemas import ChatRequest, AutoCompleteRequest
from common.llm import LLMClient
from common.logging_service import Logger
from config import SideChatConfig, AutoCompleteConfig


logger = Logger(__name__).get_logger()

app = FastAPI()
sidechatllm = LLMClient()
autocompletellm = LLMClient(
    model_name=AutoCompleteConfig.LLM_MODEL,
    llm_options=AutoCompleteConfig.llm_options
)


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """
    SSE streaming endpoint for chat - streams response chunks to client
    """
    logger.info(
        f"Received chat stream request:"
        f"{request.prompt[:50] if len(request.prompt) > 50 else request.prompt}..."
    )

    async def event_generator():
        try:
            messages = []
            sys_msg = SideChatConfig.sys_prompt
            sidechatllm._add_sys_prompt(sys_msg, messages)
            sidechatllm._add_user_msg(request.prompt, messages)

            full_res = ""
            async for chunk in sidechatllm.stream_processor(messages):
                if "partial" in chunk:
                    full_res += chunk.get('partial')
                    yield {"text": chunk.get('partial'), "done": False}
                elif "complete" in chunk:
                    full_res += chunk.get('complete')
                    # yield {"text": full_res, "done": True}

            sidechatllm._add_assistant_msg(full_res, messages)
            sidechatllm._save_conversation(request.conversation_id, messages)

            response_json = json.dumps(
                {'type': "complete", "content": full_res}
            )
            yield f"data: {response_json}\n\n"

        except Exception as e:
            logger.error(
                f"Error processing chat stream request: {e}", exc_info=True)
            response_json = json.dumps(
                {'type': "error", "content": str(e)}
            )
            yield f"data: {response_json}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/autocomplete/stream")
async def autocomplete_stream(request: AutoCompleteRequest):
    """
    Fast SSE streaming endpoint for in-line autocomplete
    """
    prompt = """Complete the code:
"<PREFIX>\n {pre_code}</PREFIX>\n"
"<POST>\n {post_code}</POST>\n\n"
"<MIDDLE>\n"
"""
    prompt = prompt.format(
        pre_code=request.pre_cursor,
        post_code=request.post_cursor
    )

    logging_str = f"{request.pre_cursor[:100] if len(request.pre_cursor) > 100 else request.pre_cursor}..."
    logging_str = "\\n".join(logging_str.split("\n"))
    logger.info(
        f"Received autocomplete stream request:" +
        logging_str
    )

    async def event_generator():
        try:
            async for chunk in autocompletellm.invoke_stream(
                prompt="```python\n" + request.code_window + "\n```",
                sys_prompt=AutoCompleteConfig.sys_prompt
            ):
                yield {"text": chunk}
        except Exception as e:
            logger.error(
                f"Error processing autocomplete stream request: {e}", exc_info=True)
            response_json = json.dumps(
                {'type': "error", "content": str(e)}
            )
            yield f"data: {response_json}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    # Using 127.0.0.1 to match the extension's call
    uvicorn.run(app, host="127.0.0.1", port=8000)
