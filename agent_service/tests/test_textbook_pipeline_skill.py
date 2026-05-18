from __future__ import annotations

import time
from pathlib import Path

import pytest

from feishu_agent.config import AppConfig
from feishu_agent.errors import ToolExecutionError
from feishu_agent.skills.base import SkillContext
from feishu_agent.skills.textbook_pipeline import TextbookPipelineSkill
from feishu_agent.store import SessionStore
from feishu_agent.tool_executor import summarize_pending_action


def _build_config(tmp_path: Path) -> AppConfig:
    return AppConfig(
        ark_api_key="test-key",
        ark_base_url="https://example.com/api/v3",
        ark_model="test-model",
        lark_cli_bin="lark-cli",
        question_bank_mcp_url="http://127.0.0.1:5001/api/mcp/question-bank",
        question_bank_mcp_timeout_seconds=30,
        app_db_path=tmp_path / "app.db",
        command_timeout_seconds=30,
        max_history_messages=20,
        max_tool_round_trips=6,
        feishu_agent_base_url="http://127.0.0.1:8000",
        attachment_dir=tmp_path / "attachments",
        auto_reply_p2p_only=True,
        group_reply_mode="mention",
        bot_mention_ids=(),
        bot_mention_names=(),
        auto_reply_debug=False,
        auto_reply_event_types=("im.message.receive_v1",),
        auto_reply_polling_enabled=True,
        auto_reply_poll_interval_seconds=5,
        auto_reply_poll_lookback_seconds=180,
        auto_reply_poll_chat_refresh_seconds=60,
        enabled_skills=("textbook_pipeline",),
    )


class FakePipelineClient:
    def create_workspace(self, *, name: str, kind: str = "textbook") -> dict:
        return {"message": "success", "summary": {"workspaceId": "ws_1", "name": name, "kind": kind}}

    def save_textbook_json(self, *, workspace_id: str, payload: dict, file_name: str) -> dict:
        return {"message": "success", "workspaceId": workspace_id, "jsonAssetId": "json_main", "filePath": "main.json"}

    def upload_image_batch(self, *, workspace_id: str, folder_name: str, attachments: list[dict]) -> dict:
        return {
            "message": "success",
            "workspaceId": workspace_id,
            "imageBatchAssetId": "image_batch_1",
            "outputFolder": "D:/tmp/images",
            "totalPages": len(attachments),
            "pages": [{"page": 1}],
        }

    def convert_pdfs(self, *, workspace_id: str, folder_name: str, attachments: list[dict]) -> dict:
        return self.upload_image_batch(workspace_id=workspace_id, folder_name=folder_name, attachments=attachments)

    def init_chapter_session(self, **kwargs) -> dict:
        return {
            "message": "success",
            "sessionId": "chapter_session_1",
            "currentChapterTitle": kwargs["start_chapter"],
            "currentSectionTitle": kwargs["start_section"],
        }

    def stream_auto_run_responses(self, **kwargs):
        yield {"type": "start", "totalCount": 1, "currentChapterTitle": kwargs["start_chapter"], "currentSectionTitle": kwargs["start_section"]}
        yield {"type": "progress", "currentIndex": 1, "totalCount": 1, "fileName": "1.png"}
        yield {"type": "result", "status": "success", "currentIndex": 1, "totalCount": 1, "fileName": "1.png"}
        yield {"type": "done", "totalCount": 1, "successCount": 1, "failedCount": 0}

    def read_textbook_json(self, **kwargs) -> dict:
        return {"message": "success", "text": '{"questions":[]}'}

    def import_workspace_json(self, **kwargs) -> dict:
        return {"message": "success", "schema": "question_bank", "fileCount": 1, "items": []}


def test_textbook_pipeline_tools_are_registered_as_expected(tmp_path: Path) -> None:
    skill = TextbookPipelineSkill(_build_config(tmp_path), client=FakePipelineClient())
    tools = {tool.name: tool for tool in skill.get_tools()}

    assert tools["list_textbook_pipeline_capabilities"].requires_confirmation is False
    assert tools["get_textbook_extraction_status"].requires_confirmation is False
    assert tools["start_textbook_extraction_job"].requires_confirmation is True
    assert tools["cancel_textbook_extraction_job"].requires_confirmation is True


def test_start_job_rejects_missing_metadata(tmp_path: Path) -> None:
    skill = TextbookPipelineSkill(_build_config(tmp_path), client=FakePipelineClient())

    with pytest.raises(ToolExecutionError) as exc_info:
        skill.execute(
            "start_textbook_extraction_job",
            {"attachment_ids": ["att_1"], "courseId": "math"},
            SkillContext(session_id="agent_1", source="test"),
        )

    assert exc_info.value.category == "parameter_error"
    assert "textbookId" in exc_info.value.message


def test_start_job_queues_background_task_and_status(tmp_path: Path) -> None:
    config = _build_config(tmp_path)
    store = SessionStore(config.app_db_path)
    attachment_path = tmp_path / "page.png"
    attachment_path.write_bytes(b"fake image")
    store.create_attachment(
        attachment_id="att_1",
        session_id="agent_1",
        original_name="page.png",
        content_type="image/png",
        size_bytes=attachment_path.stat().st_size,
        file_path=str(attachment_path),
    )
    skill = TextbookPipelineSkill(config, client=FakePipelineClient(), store=store)

    result, record = skill.execute(
        "start_textbook_extraction_job",
        {
            "attachment_ids": ["att_1"],
            "courseId": "math101",
            "textbookId": "tb_1",
            "title": "Demo",
            "startChapter": "第一章",
            "startSection": "习题1.1",
        },
        SkillContext(session_id="agent_1", source="test"),
    )

    assert result["taskId"].startswith("tbp_")
    assert record.ok is True

    deadline = time.time() + 2
    status = {}
    while time.time() < deadline:
        status, _ = skill.execute(
            "get_textbook_extraction_status",
            {"taskId": result["taskId"]},
            SkillContext(session_id="agent_1", source="test"),
        )
        if status["status"] == "succeeded":
            break
        time.sleep(0.02)

    assert status["status"] == "succeeded"
    assert status["workspaceId"] == "ws_1"
    assert status["successCount"] == 1


def test_textbook_pipeline_pending_summary() -> None:
    summary, preview = summarize_pending_action(
        "start_textbook_extraction_job",
        {
            "attachment_ids": ["att_1"],
            "courseId": "math101",
            "textbookId": "tb_1",
            "title": "Demo",
            "startChapter": "第一章",
            "startSection": "习题1.1",
        },
    )

    assert "教材题库" in summary
    assert preview["attachment_ids"] == ["att_1"]
