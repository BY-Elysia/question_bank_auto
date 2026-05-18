from __future__ import annotations

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles

from .config import AppConfig
from .errors import PendingActionError
from .harness import AgentHarness, build_harness
from .schemas import (
    ChatRequest,
    ChatResponse,
    ConfirmActionRequest,
    ConfirmActionResponse,
    DeleteSessionResponse,
    HealthResponse,
    IdentityResponse,
    SessionDetailResponse,
    SessionListResponse,
    VoiceRequest,
    VoiceResponse,
)
from .voice import VoiceSynthesizer, VoiceSynthesisError


def build_service(config: AppConfig) -> AgentHarness:
    return build_harness(config)


def build_voice_synthesizer(config: AppConfig) -> VoiceSynthesizer:
    return VoiceSynthesizer(
        space_name=config.tts_space,
        api_name=config.tts_api_name,
        output_dir=config.tts_output_dir,
        speaker=config.tts_speaker,
        language=config.tts_language,
        speed=config.tts_speed,
        is_symbol=config.tts_is_symbol,
        hf_token=config.tts_hf_token or None,
    )


def create_app(config: AppConfig | None = None) -> FastAPI:
    app_config = config or AppConfig.from_env()
    harness = build_service(app_config)
    voice_synthesizer = build_voice_synthesizer(app_config)
    app = FastAPI(title="Feishu Agent", version="0.1.0")
    app.state.config = app_config
    app.state.harness = harness
    app.state.service = harness
    app.state.voice_synthesizer = voice_synthesizer
    app_config.tts_output_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/generated-audio", StaticFiles(directory=str(app_config.tts_output_dir)), name="generated-audio")

    @app.get("/healthz", response_model=HealthResponse)
    def healthcheck() -> HealthResponse:
        runtime_harness: AgentHarness = app.state.harness
        return runtime_harness.healthcheck()

    @app.get("/identity", response_model=IdentityResponse)
    def identity() -> IdentityResponse:
        runtime_harness: AgentHarness = app.state.harness
        whoami = runtime_harness.whoami()
        return IdentityResponse(
            persona=whoami.persona,
            model=whoami.model,
            skills=list(whoami.skills),
        )

    @app.get("/sessions", response_model=SessionListResponse)
    def list_sessions() -> SessionListResponse:
        runtime_harness: AgentHarness = app.state.harness
        return SessionListResponse(sessions=runtime_harness.list_session_summaries())

    @app.get("/sessions/{session_id}", response_model=SessionDetailResponse)
    def get_session(session_id: str) -> SessionDetailResponse:
        runtime_harness: AgentHarness = app.state.harness
        detail = runtime_harness.get_session_detail(session_id)
        if detail is None:
            raise HTTPException(status_code=404, detail=f"session not found: {session_id}")
        return SessionDetailResponse(**detail)

    @app.delete("/sessions/{session_id}", response_model=DeleteSessionResponse)
    def delete_session(session_id: str) -> DeleteSessionResponse:
        runtime_harness: AgentHarness = app.state.harness
        deleted = runtime_harness.delete_session(session_id)
        if not deleted:
            raise HTTPException(status_code=404, detail=f"session not found: {session_id}")
        return DeleteSessionResponse(ok=True, session_id=session_id)

    @app.post("/voice", response_model=VoiceResponse)
    def synthesize_voice(request: VoiceRequest) -> VoiceResponse:
        synthesizer: VoiceSynthesizer = app.state.voice_synthesizer
        try:
            audio_path = synthesizer.synthesize(request.text)
        except VoiceSynthesisError as exc:
            raise HTTPException(status_code=503, detail=f"Voice synthesis is temporarily unavailable: {exc}") from exc
        return VoiceResponse(
            audio_url=f"/generated-audio/{audio_path.name}",
            file_name=audio_path.name,
        )

    @app.post("/chat", response_model=ChatResponse)
    def chat(
        request: ChatRequest,
        x_ark_api_key: str | None = Header(default=None, alias="X-Ark-Api-Key"),
    ) -> ChatResponse:
        if app_config.validate():
            raise HTTPException(status_code=500, detail={"config_errors": app_config.validate()})
        runtime_harness: AgentHarness = app.state.harness
        return runtime_harness.handle_message(
            request.session_id,
            request.message,
            source="http",
            ark_api_key_override=(x_ark_api_key or "").strip() or None,
        )

    @app.post("/chat/attachments", response_model=ChatResponse)
    async def chat_with_attachments(
        session_id: str = Form(min_length=1, max_length=128),
        message: str = Form(min_length=1, max_length=10000),
        attachments: list[UploadFile] | None = File(default=None),
        x_ark_api_key: str | None = Header(default=None, alias="X-Ark-Api-Key"),
    ) -> ChatResponse:
        if app_config.validate():
            raise HTTPException(status_code=500, detail={"config_errors": app_config.validate()})
        runtime_harness: AgentHarness = app.state.harness
        persisted_attachments = []
        try:
            for upload_file in attachments or []:
                content = await upload_file.read()
                persisted_attachments.append(
                    runtime_harness.persist_attachment(
                        session_id,
                        original_name=upload_file.filename or "attachment.bin",
                        content_type=upload_file.content_type or "",
                        content=content,
                    )
                )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        return runtime_harness.handle_message(
            session_id,
            message,
            source="http",
            message_metadata={"attachments": persisted_attachments},
            ark_api_key_override=(x_ark_api_key or "").strip() or None,
        )

    @app.post("/actions/{action_id}/confirm", response_model=ConfirmActionResponse)
    def confirm_action(
        action_id: str,
        request: ConfirmActionRequest,
        x_ark_api_key: str | None = Header(default=None, alias="X-Ark-Api-Key"),
    ) -> ConfirmActionResponse:
        try:
            runtime_harness: AgentHarness = app.state.harness
            return runtime_harness.confirm_action(
                action_id,
                request.confirm,
                ark_api_key_override=(x_ark_api_key or "").strip() or None,
            )
        except PendingActionError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    return app


def run() -> None:
    import uvicorn

    uvicorn.run("feishu_agent.app:create_app", factory=True, host="127.0.0.1", port=8000, reload=False)
