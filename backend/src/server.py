from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from common.llm import LLMClient

app = FastAPI()
llm = LLMClient()

class CodeQuery(BaseModel):
    code: str
    instruction: str
    conversation_id: str = "CH001"

@app.post("/process")
async def process_code(query: CodeQuery):
    try:
        messages = []
        llm._add_sys_prompt("You are an Expert Coding Assistant. Modify the provided code based on the instructions. Return ONLY the code.", messages)
        
        # Combine user instruction and code
        prompt = f"Instruction: {query.instruction}\n\nCode:\n{query.code}"
        llm._add_user_msg(prompt, messages)
        
        # Optional: Add assistant prefill to encourage code blocks
        llm._add_assistant_msg("```python\n", messages)

        full_response = ""
        async for chunk in llm.stream_processor(messages):
            if "complete" in chunk:
                full_response = chunk["complete"]
        
        # Clean up the response (remove markdown backticks if any)
        clean_code = full_response.replace("```python", "").replace("```", "").strip()
        
        # Save history as per your llm.py logic
        llm._save_conversation(query.conversation_id, messages)
        
        return {"result": clean_code}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)