from pydantic import BaseModel
from typing import ClassVar

class LLMConfig(BaseModel):
    LLM_MODEL: ClassVar[str] = "llama3.2" # hermes3:3b
    temperature: ClassVar[float] = 0.7