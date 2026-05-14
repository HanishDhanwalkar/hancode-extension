from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional

from common.llm import LLMClient
from common.knowledge_graph import build_python_slice, empty_slice

app = FastAPI()
llm = LLMClient()

# Updated to match the extension's request structure
class GenerateRequest(BaseModel):
    prompt: str
    mode: str  # 'chat' or 'complete'
    conversation_id: Optional[str] = "CH001"
    workspace_context: Optional[str] = None


class KnowledgeBuildRequest(BaseModel):
    fileFsPath: str
    content: str
    languageId: str


@app.post("/knowledge/build")
async def knowledge_build(request: KnowledgeBuildRequest):
    """AST-backed knowledge slice (nodes/edges/digest). Python is native; other languages return a stub slice."""
    if request.languageId == "python":
        return build_python_slice(request.fileFsPath, request.content)
    return empty_slice(
        request.fileFsPath,
        request.languageId,
        "server-side AST graph is implemented for Python; TS/JS is indexed in the editor extension",
    )


@app.post("/generate")
async def generate(request: GenerateRequest):
    try:
        messages = []
        
        # 1. System Prompt based on Mode
        if request.mode == "complete":
            sys_msg = "You are a code completion engine. Continue the code provided. Return ONLY the code completion."
        else:
            sys_msg = "You are a helpful AI coding assistant. Answer questions or explain code clearly."

        if request.workspace_context:
            sys_msg += (
                "\n\nYou may receive a WORKSPACE_MAP summarizing symbols and imports "
                "from saved workspace files (TypeScript/JavaScript via the editor, Python via the knowledge API). "
                "Use it to avoid duplicating existing helpers, to name things consistently, "
                "and to reference real file paths and symbols when suggesting edits."
            )

        llm._add_sys_prompt(sys_msg, messages)

        user_prompt = request.prompt
        if request.workspace_context and request.mode != "complete":
            user_prompt = (
                "WORKSPACE_MAP (from AST index on save; may be partial):\n"
                f"{request.workspace_context}\n\n---\nUSER:\n{request.prompt}"
            )

        llm._add_user_msg(user_prompt, messages)
        
        # 3. Stream from your existing LLM client
        full_response = ""
        async for chunk in llm.stream_processor(messages):
            # Checking for 'complete' key based on your original server.py logic
            if isinstance(chunk, dict) and "complete" in chunk:
                full_response = chunk["complete"]
            elif isinstance(chunk, str):
                full_response += chunk

        # 4. Post-processing
        # Remove markdown artifacts if the model returns them
        clean_response = full_response.replace("```python", "").replace("```", "").strip()
        
        # 5. Save History
        llm._save_conversation(request.conversation_id, messages)
        
        # Return the key "text" as expected by api.ts
        return {"text": clean_response}

    except Exception as e:
        print(f"Server Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # Using 127.0.0.1 to match the extension's call
    uvicorn.run(app, host="127.0.0.1", port=8000)