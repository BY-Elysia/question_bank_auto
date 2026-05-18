from __future__ import annotations

from pathlib import Path
from typing import Any

from feishu_agent.config import AppConfig
from feishu_agent.harness import AgentHarness
from feishu_agent.skills.base import Skill, SkillContext, ToolSpec
from feishu_agent.store import SessionStore
from feishu_agent.tool_executor import ToolExecutionRecord


class DummyArkClient:
    def create_response(self, *args: Any, **kwargs: Any) -> Any:
        raise AssertionError("Ark client should not be called in send_dm history test")


class SendDmSkill(Skill):
    name = "dummy_send_dm"
    description = "dummy send_dm skill"

    def get_tools(self) -> list[ToolSpec]:
        return [
            ToolSpec(
                name="send_dm",
                description="Send a direct Feishu message.",
                parameters={"type": "object"},
                requires_confirmation=True,
            )
        ]

    def get_guidance(self) -> str:
        return ""

    def execute(
        self,
        tool_name: str,
        args: dict[str, Any],
        context: SkillContext,
    ) -> tuple[dict[str, Any], ToolExecutionRecord]:
        assert tool_name == "send_dm"
        return (
            {
                "message_id": "om_sent_123",
                "chat_id": "oc_target_chat",
                "create_time": "2026-04-17 23:00:00",
            },
            ToolExecutionRecord(
                tool_name=tool_name,
                command=["test", "send_dm"],
                stdout="",
                stderr="",
                duration_ms=1,
                ok=True,
            ),
        )


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


def test_send_dm_is_written_into_target_chat_history(tmp_path: Path) -> None:
    store = SessionStore(tmp_path / "app.db")
    harness = AgentHarness(
        config=_build_config(tmp_path),
        store=store,
        ark_client=DummyArkClient(),
        tool_executor=None,
        skills=[SendDmSkill()],
    )
    pending = harness._build_pending_action(
        session_id="im-chat:oc_source_chat",
        tool_name="send_dm",
        args={
            "user_open_id": "ou_target_user",
            "text": "你好呀，请在明天前完成这道题。",
            "send_as": "bot",
        },
    )
    assert pending.pending_action is not None

    response = harness.confirm_action(pending.pending_action.action_id, True)
    target_messages = store.get_messages("im-chat:oc_target_chat", 20)

    assert response.status == "executed"
    assert any(message["content"] == "你好呀，请在明天前完成这道题。" for message in target_messages)
    delivered = next(message for message in target_messages if message["content"] == "你好呀，请在明天前完成这道题。")
    assert delivered["role"] == "assistant"
    assert delivered["metadata"]["source"] == "feishu_outbound_dm"
    assert delivered["metadata"]["feishu_chat_id"] == "oc_target_chat"
    assert delivered["metadata"]["feishu_recipient_open_id"] == "ou_target_user"
