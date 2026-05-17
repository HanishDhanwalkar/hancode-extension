from pydantic import BaseModel, Field, field_validator
from typing import Optional


class ChatRequest(BaseModel):
    prompt: str
    conversation_id: Optional[str] = "CH001"


class AutoCompleteRequest(BaseModel):
    # code_window: str

    pre_cursor: str = Field(default="", max_length=10000)
    post_cursor: str = Field(default="", max_length=10000)

    @field_validator("pre_cursor", "post_cursor")
    @classmethod
    def sanitize(cls, v: str) -> str:
        return v.replace("\x00", "").strip()
