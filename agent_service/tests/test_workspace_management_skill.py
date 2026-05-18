from __future__ import annotations

from pathlib import Path

import pytest

from feishu_agent.config import AppConfig
from feishu_agent.errors import ToolExecutionError
from feishu_agent.skills.base import SkillContext
from feishu_agent.skills.workspace_management import WorkspaceManagementSkill
from feishu_agent.tool_executor import summarize_pending_action
from feishu_agent.workspace_api import derive_backend_base_url


class FakeWorkspaceClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []

    def list_workspaces(self) -> dict:
        self.calls.append(("list_workspaces", {}))
        return {"message": "success", "workspaces": []}

    def get_workspace_summary(self, workspace_id: str) -> dict:
        self.calls.append(("get_workspace_summary", {"workspace_id": workspace_id}))
        return {"message": "success", "summary": {"workspaceId": workspace_id, "name": "Demo", "kind": "textbook"}}

    def create_workspace(self, *, name: str, kind: str) -> dict:
        self.calls.append(("create_workspace", {"name": name, "kind": kind}))
        return {
            "message": "success",
            "summary": {
                "workspaceId": "ws_123",
                "name": name,
                "kind": kind,
            },
        }


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
        enabled_skills=("workspace_management",),
    )


def test_derives_backend_base_url_from_mcp_endpoint() -> None:
    assert (
        derive_backend_base_url("http://127.0.0.1:5001/api/mcp/question-bank")
        == "http://127.0.0.1:5001"
    )
    assert (
        derive_backend_base_url("https://example.com/prefix/api/mcp/question-bank")
        == "https://example.com/prefix"
    )


def test_workspace_skill_exposes_create_workspace_as_confirmed_tool(tmp_path: Path) -> None:
    skill = WorkspaceManagementSkill(_build_config(tmp_path), client=FakeWorkspaceClient())

    tools = {tool.name: tool for tool in skill.get_tools()}

    assert tools["list_workspaces"].requires_confirmation is False
    assert tools["get_workspace_summary"].requires_confirmation is False
    assert tools["create_workspace"].requires_confirmation is True
    assert tools["create_workspace"].parameters["properties"]["kind"]["enum"] == ["textbook", "exam"]


def test_create_workspace_executes_backend_client(tmp_path: Path) -> None:
    client = FakeWorkspaceClient()
    skill = WorkspaceManagementSkill(_build_config(tmp_path), client=client)

    result, record = skill.execute(
        "create_workspace",
        {"name": "数学分析下册", "kind": "TEXTBOOK"},
        SkillContext(session_id="agent_1", source="test"),
    )

    assert client.calls == [("create_workspace", {"name": "数学分析下册", "kind": "textbook"})]
    assert result["summary"]["workspaceId"] == "ws_123"
    assert record.ok is True
    assert record.command == ["backend-http", "POST", "/api/workspaces"]


def test_create_workspace_rejects_missing_kind(tmp_path: Path) -> None:
    skill = WorkspaceManagementSkill(_build_config(tmp_path), client=FakeWorkspaceClient())

    with pytest.raises(ToolExecutionError) as exc_info:
        skill.execute(
            "create_workspace",
            {"name": "数学分析下册"},
            SkillContext(session_id="agent_1", source="test"),
        )

    assert exc_info.value.category == "parameter_error"
    assert "kind" in exc_info.value.message


def test_create_workspace_pending_summary() -> None:
    summary, preview = summarize_pending_action(
        "create_workspace",
        {"name": "期末试卷整理", "kind": "exam"},
    )

    assert "创建" in summary
    assert preview == {"name": "期末试卷整理", "kind": "exam"}
