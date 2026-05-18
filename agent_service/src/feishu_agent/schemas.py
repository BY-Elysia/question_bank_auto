from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=128)
    message: str = Field(min_length=1, max_length=10000)


class VoiceRequest(BaseModel):
    text: str = Field(min_length=1, max_length=10000)


class VoiceResponse(BaseModel):
    audio_url: str = Field(min_length=1)
    file_name: str = Field(min_length=1)


class TraceEvent(BaseModel):
    step: int
    kind: str
    status: str
    summary: str
    skill_name: str | None = None
    tool_name: str | None = None
    args_preview: dict[str, Any] | None = None
    result_preview: Any | None = None


class PendingActionView(BaseModel):
    action_id: str
    tool_name: str
    summary: str
    args_preview: dict[str, Any]


class SessionSummaryView(BaseModel):
    session_id: str
    title: str
    preview: str = ""
    message_count: int = 0
    created_at: str
    updated_at: str
    has_pending_action: bool = False
    origin: str = "unknown"
    origin_label: str = ""
    participant_label: str = ""
    participant_id: str = ""


class SessionMessageView(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    created_at: str
    status: Literal["message", "pending_action", "error"] = "message"
    pending_action: PendingActionView | None = None


class SessionListResponse(BaseModel):
    sessions: list[SessionSummaryView] = Field(default_factory=list)


class SessionDetailResponse(BaseModel):
    session_id: str
    title: str
    created_at: str
    updated_at: str
    origin: str = "unknown"
    origin_label: str = ""
    participant_label: str = ""
    participant_id: str = ""
    messages: list[SessionMessageView] = Field(default_factory=list)
    pending_action: PendingActionView | None = None


class DeleteSessionResponse(BaseModel):
    ok: bool
    session_id: str


class ChatResponse(BaseModel):
    status: Literal["message", "pending_action", "error"]
    session_id: str
    message: str | None = None
    pending_action: PendingActionView | None = None
    trace: list[TraceEvent] = Field(default_factory=list)


class ConfirmActionRequest(BaseModel):
    confirm: bool


class ConfirmActionResponse(BaseModel):
    status: Literal["executed", "cancelled", "error"]
    action_id: str
    message: str
    result: dict[str, Any] | None = None
    trace: list[TraceEvent] = Field(default_factory=list)


class HealthResponse(BaseModel):
    ok: bool
    config_errors: list[str]
    lark_cli_bin: str
    db_path: str


class IdentityResponse(BaseModel):
    persona: str
    model: str
    skills: list[str]

