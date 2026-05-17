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
    sys_prompt: ClassVar[str] = """You are an IDE autocomplete engine.
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

    prompt_template: ClassVar[str] = """
Given the code context, provide the COMPLETE corrected/improved code for the section between PREFIX and POST.
You can refactor, rename variables (short and meaningful), add/remove lines, fix bugs -whateever improves the code.
Return ONLY the code that replaces the MIDDLE section. Do NOT include PREFIX or POST in the response.

<PREFIX>
{prefix_code}
</PREFIX>

<MIDDLE>
[user_cursor_here]
</MIDDLE>

<POST>
{post_code}
</POST>

Respond with the complete improved code:\n
"""
