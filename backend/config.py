from pydantic import BaseModel
from typing import ClassVar


class LLMConfig(BaseModel):
    LLM_MODEL: ClassVar[str] = "llama3.2"  # hermes3:3b
    llm_options: ClassVar[dict] = {
        'temperature': 0.7,
        'num_predict': 512,
        'repeat_penalty': 1.2,  # Prevents repetition loops
        # 'stop': ["```"]       # Removed: was cutting off code blocks
    }
    


class SideChatConfig(BaseModel):
    # LLM_MODEL: ClassVar[str] = "llama3.2"
    # temperature: ClassVar[float] = 0.7
    sys_prompt: ClassVar[str] = "You are a Expert Coding asssisant. Answer questions in very short; Explain only when specifically asked to."
    llm_options: ClassVar[dict] = {
        'temperature': 0.7,
        'num_predict': 512,
        'repeat_penalty': 1.2,  # Prevents repetition loops
    }

class AutoCompleteConfig(BaseModel):
    LLM_MODEL: ClassVar[str] = "llama3.2"
    llm_options: ClassVar[dict] = {
        'temperature': 0.15,
        'num_predict': 128,
        'repeat_penalty': 1.1,
        'stop': [
            "<PREFIX>",
            "<SUFFIX>",
            "<MIDDLE>",
            "```",
        ]
    }
    sys_prompt: ClassVar[str] = ("You are an expert software developer and coder. Follow all the best coding guidelines. Add no explanation or tests; JUST Completed code or next steps. Complete the code:\n"
      
    )
    sys_prompt = """
You are an IDE autocomplete engine.

Rules:
- Output ONLY the code completion
- No markdown
- No explanations
- No code fences
- No comments unless continuing existing comments
- Continue naturally from the cursor
- Keep completion concise
- Stop when completion is finished
"""
