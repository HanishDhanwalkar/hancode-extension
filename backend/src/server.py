import json
import asyncio
from typing import AsyncGenerator
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse

from config import SideChatConfig, AutoCompleteConfig
from src.schemas import ChatRequest, AutoCompleteRequest
from common.llm import LLMClient
from common.logging_service import Logger


logger = Logger(__name__).get_logger()

app = FastAPI()
sidechatllm = LLMClient(
    model_name=SideChatConfig.LLM_MODEL,
    llm_options=SideChatConfig.llm_options
)
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
                    response_json = json.dumps({
                        "type": "partial",
                        "content": chunk.get('partial'),
                        "done": False
                    })
                    yield f"data: {response_json}\n\n"

                elif "complete" in chunk:
                    full_res += chunk.get('complete')

            sidechatllm._add_assistant_msg(full_res, messages)
            sidechatllm._save_conversation(request.conversation_id, messages)

            response_json = json.dumps(
                {'type': "complete", "content": full_res,  "done": True}
            )
            yield f"data: {response_json}\n\n"

        except Exception as e:
            logger.error(
                f"Error processing chat stream request: {e}",
                exc_info=True
            )
            response_json = json.dumps({
                'type': "error",
                "content": str(e)
            })
            yield f"data: {response_json}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/autocomplete/stream")
async def autocomplete_stream(request: AutoCompleteRequest, http_request: Request):
    """
    Fast SSE streaming endpoint for in-line autocomplete
    """
    logger.info(
        "Autocomplete request received: pre_len=%s, post_len=%s",
        len(request.pre_cursor),
        len(request.post_cursor)
    )
    prompt = AutoCompleteConfig.prompt_template.format(
        prefix_code=request.pre_cursor,
        post_code=request.post_cursor
    )
    
    logger.debug("Autocomplete prompt preview: %s", prompt[:400])

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            async with asyncio.timeout(30):  # prevents hanging
                full_res = ""
                async for chunk in autocompletellm.invoke_stream(
                    prompt=prompt,
                    sys_prompt=AutoCompleteConfig.sys_prompt
                ):
                    if await http_request.is_disconnected():
                        logger.info("Client disconnected, stopping streaming")
                        break
                    full_res += chunk
                    response_json = json.dumps({
                        'type': "token",
                        "content": chunk
                    })
                    yield f"data: {response_json}\n\n"

        except asyncio.TimeoutError:
            logger.warning("Request Stream timed out")
            response_json = json.dumps({
                'type': 'error',
                'content': 'Request timed out'
            })
            yield f"data: {response_json}\n\n"
        except Exception as e:
            logger.error(
                "Error processing autocomplete stream request: %s",
                str(e),
                exc_info=True
            )
            response_json = json.dumps({
                'type': "error",
                "content": str(e)
            })
            yield f"data: {response_json}\n\n"
        finally:
            logger.info(f"Autocomplete stream completed: {full_res[:100]}")
            response_json = json.dumps({
                'type': "done"
            })
            yield f"data: {response_json}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Disable Nginx buffering if used
            "Connection": "keep-alive"
        }
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
