from pydantic import BaseModel
from typing import ClassVar


class LLMConfig(BaseModel):
    LLM_MODEL: ClassVar[str] = "llama3.2"  # hermes3:3b
    llm_options: ClassVar[dict] = {
        'temperature': 0.7,
        'num_predict': 512,
        'repeat_penalty': 1.2,  # Prevents repetition loops
    }


class SideChatConfig(BaseModel):
    LLM_MODEL: ClassVar[str] = "llama3.2"
    sys_prompt: ClassVar[str] = "You are a coding assistant. Provide concise and relevant code suggestions and explanations in response to user queries."
    llm_options: ClassVar[dict] = {
        'temperature': 0.7,
        'num_predict': 512,
        'repeat_penalty': 1.2,
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
    sys_prompt: ClassVar[str] = """You are an IDE tab-autocomplete engine (fill-in-the-middle).
Rules:
- Output ONLY the new code to insert at the cursor
- Never repeat, rewrite, or refactor code from PREFIX or POST
- No markdown, explanations, or code fences
- Continue naturally from the end of PREFIX
- If POST is non-empty, stop before duplicating POST
- Keep the completion short (a few lines unless clearly needed)
"""

    prompt_template: ClassVar[str] = """
The developer's cursor is between PREFIX and POST.
Output ONLY the text to insert at the cursor. Do not output PREFIX or POST.

<PREFIX>
{prefix_code}
</PREFIX>

<POST>
{post_code}
</POST>

Insertion only:
"""
