from typing import Any, Dict, List

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services import assistant_service

router = APIRouter(prefix="/assistant", tags=["assistant"])


class Question(BaseModel):
    question: str = Field(max_length=500)


@router.post("/ask")
def ask(data: Question) -> Dict[str, Any]:
    """Answers a how-do-I question from the manual (runs inside the application, no outside AI service)."""
    return assistant_service.ask(data.question)


@router.get("/topics")
def topics() -> List[Dict[str, str]]:
    """Every topic the help chat knows (used for the suggestion chips)."""
    return assistant_service.topics()
