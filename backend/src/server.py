import json
import asyncio
from typing import AsyncGenerator
from fastapi import FastAPI, Request, HTTPException, Depends
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
                    response_json = json.dumps({"type": "partial", "content": chunk.get('partial'), "done": False})
                    yield f"data: {response_json}\n\n"

                elif "complete" in chunk:
                    full_res += chunk.get('complete')
                    # yield {"text": full_res, "done": True}

            sidechatllm._add_assistant_msg(full_res, messages)
            sidechatllm._save_conversation(request.conversation_id, messages)

            response_json = json.dumps(
                {'type': "complete", "content": full_res,  "done": True}
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
async def autocomplete_stream(request: AutoCompleteRequest, http_request: Request):
    """
    Fast SSE streaming endpoint for in-line autocomplete
    """
    logger.info(f"Autocomplete request received: pre_len={len(request.pre_cursor)}, post_len={len(request.post_cursor)}")
    prompt = ("Complete the code:"
        f"<PREFIX>\n{request.pre_cursor}</PREFIX>\n"
        f"<POST>\n{request.post_cursor}</POST>\n\n"
        "<MIDDLE>\n"
    )

    # logging_str = f"{request.pre_cursor[:100] if len(request.pre_cursor) > 100 else request.pre_cursor}..."
    # logging_str = "\\n".join(logging_str.split("\n"))
    # logger.info(
    #     f"Received autocomplete stream request:" +
    #     logging_str
    # )

    async def event_generator()->AsyncGenerator[str, None]:
        try:
            async with asyncio.timeout(30): # prevents hanging
                async for chunk in autocompletellm.invoke_stream(
                    prompt=prompt,
                    sys_prompt=AutoCompleteConfig.sys_prompt
                ):
                    # yield {"text": chunk}
                    if await http_request.is_disconnected():
                        logger.info("Client disconnected, stopping streaming")
                    
                    response_json = json.dumps(
                        {'type': "token", "content": chunk}
                    )    
                    yield f"data: {response_json}\n\n"
                    
        except asyncio.TimeoutError:
            logger.warning("Request Stream timed out")
            response_json = json.dumps({'type': 'error', 'content': 'Request timed out'})
            yield f"data: {response_json}\n\n"                    
        except Exception as e:
            logger.error(
                f"Error processing autocomplete stream request: {e}", exc_info=True)
            response_json = json.dumps(
                {'type': "error", "content": str(e)}
            )
            yield f"data: {response_json}\n\n"
        finally:
            yield f"data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(), 
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no", # Disable Nginx buffering if used
            "Connection": "keep-alive"
        }
    )


if __name__ == "__main__":
    import uvicorn
    # Using 127.0.0.1 to match the extension's call
    uvicorn.run(app, host="127.0.0.1", port=8000)
