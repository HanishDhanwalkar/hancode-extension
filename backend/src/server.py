from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional

from common.llm import LLMClient

app = FastAPI()
llm = LLMClient()

# Updated to match the extension's request structure
class GenerateRequest(BaseModel):
    prompt: str
    mode: str  # 'chat' or 'complete'
    conversation_id: Optional[str] = "CH001"

@app.post("/generate")
async def generate(request: GenerateRequest):
    try:
        messages = []
        
        # 1. System Prompt based on Mode
        if request.mode == "complete":
            sys_msg = "You are a code completion engine. Continue the code provided. Return ONLY the code completion."
        else:
            sys_msg = "You are a helpful AI coding assistant. Answer questions or explain code clearly."
            
        llm._add_sys_prompt(sys_msg, messages)
        
        # 2. Add the User Prompt
        llm._add_user_msg(request.prompt, messages)
        
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