from __future__ import annotations

from pathlib import Path
from typing import Any

from feishu_agent.config import AppConfig
from feishu_agent.harness import AgentHarness
from feishu_agent.skills.base import Skill, SkillContext, ToolSpec
from feishu_agent.store import SessionStore


class DummyArkClient:
    def create_response(self, *args: Any, **kwargs: Any) -> Any:
        raise AssertionError("Ark client should not be called in heuristic tests")


class DummySkill(Skill):
    name = "dummy"
    description = "dummy"

    def __init__(self, tools: list[ToolSpec]) -> None:
        self._tools = tools

    def get_tools(self) -> list[ToolSpec]:
        return self._tools

    def get_guidance(self) -> str:
        return ""

    def execute(
        self,
        tool_name: str,
        args: dict[str, Any],
        context: SkillContext,
    ):
        raise AssertionError(f"Tool execution should not be called in heuristic tests: {tool_name}")


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
        enabled_skills=("feishu_im",),
    )


def _build_harness(tmp_path: Path) -> AgentHarness:
    send_dm_tool = ToolSpec(
        name="send_dm",
        description="Send a direct Feishu message.",
        parameters={"type": "object"},
        requires_confirmation=True,
    )
    return AgentHarness(
        config=_build_config(tmp_path),
        store=SessionStore(tmp_path / "app.db"),
        ark_client=DummyArkClient(),
        tool_executor=None,
        skills=[DummySkill([send_dm_tool])],
    )


def test_auto_promotes_literal_short_dm_text(tmp_path: Path) -> None:
    harness = _build_harness(tmp_path)

    response = harness._maybe_build_send_dm_from_search_result(
        session_id="im-chat:oc_1",
        original_message="给周灿宇发你好",
        search_result={"matches": [{"name": "周灿宇", "open_id": "ou_123"}]},
        trace=[],
        step=1,
    )

    assert response is not None
    assert response.status == "pending_action"
    assert response.pending_action is not None
    assert response.pending_action.args_preview["text"] == "你好"


def test_auto_promotes_explicitly_quoted_dm_text(tmp_path: Path) -> None:
    harness = _build_harness(tmp_path)

    response = harness._maybe_build_send_dm_from_search_result(
        session_id="im-chat:oc_1",
        original_message='给周灿宇发“你好，辛苦啦”',
        search_result={"matches": [{"name": "周灿宇", "open_id": "ou_123"}]},
        trace=[],
        step=1,
    )

    assert response is not None
    assert response.status == "pending_action"
    assert response.pending_action is not None
    assert response.pending_action.args_preview["text"] == "你好，辛苦啦"


def test_does_not_auto_promote_message_drafting_request(tmp_path: Path) -> None:
    harness = _build_harness(tmp_path)

    response = harness._maybe_build_send_dm_from_search_result(
        session_id="im-chat:oc_1",
        original_message="给周灿宇发一道数学分析的题，让他明天之前完成",
        search_result={"matches": [{"name": "周灿宇", "open_id": "ou_123"}]},
        trace=[],
        step=1,
    )

    assert response is None


def test_auto_promotes_attachment_send_after_unique_search_result(tmp_path: Path) -> None:
    harness = _build_harness(tmp_path)

    response = harness._maybe_build_send_dm_from_search_result(
        session_id="agent_1",
        original_message="把这张图发给肖铭俊",
        latest_user_metadata={"attachments": [{"attachment_id": "att_1", "original_name": "截图.png"}]},
        search_result={"matches": [{"name": "肖铭俊", "open_id": "ou_target"}]},
        trace=[],
        step=1,
    )

    assert response is not None
    assert response.status == "pending_action"
    assert response.pending_action is not None
    assert response.pending_action.args_preview["attachment_ids"] == ["att_1"]
