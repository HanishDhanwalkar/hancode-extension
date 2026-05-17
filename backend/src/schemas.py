from pydantic import BaseModel
from typing import Optional


class ChatRequest(BaseModel):
    prompt: str
    conversation_id: Optional[str] = "CH001"

class AutoCompleteRequest(BaseModel):
    # code_window: str
    pre_cursor: str = ""
    post_cursor: str = ""