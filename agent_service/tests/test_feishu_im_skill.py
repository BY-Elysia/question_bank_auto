from __future__ import annotations

from pathlib import Path

from feishu_agent.skills.base import SkillContext
from feishu_agent.skills.feishu_im import FeishuImSkill
from feishu_agent.store import SessionStore
from feishu_agent.tool_executor import ToolExecutionRecord


class FakeExecutor:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []

    def execute(self, tool_name: str, args: dict):
        self.calls.append((tool_name, args))
        return (
            {"message_id": "om_1", "chat_id": "oc_1"},
            ToolExecutionRecord(
                tool_name=tool_name,
                command=["fake"],
                stdout="{}",
                stderr="",
                duration_ms=1,
                ok=True,
            ),
        )


def test_send_dm_resolves_attachment_ids_to_paths(tmp_path: Path) -> None:
    store = SessionStore(tmp_path / "app.db")
    image_path = tmp_path / "screenshot.png"
    image_path.write_bytes(b"fake image")
    store.create_attachment(
        attachment_id="att_1",
        session_id="agent_1",
        original_name="screenshot.png",
        content_type="image/png",
        size_bytes=image_path.stat().st_size,
        file_path=str(image_path),
    )
    executor = FakeExecutor()
    skill = FeishuImSkill(executor, store=store)

    result, record = skill.execute(
        "send_dm",
        {"user_open_id": "ou_target", "attachment_ids": ["att_1"]},
        SkillContext(session_id="agent_1", source="test"),
    )

    assert result["message_id"] == "om_1"
    assert record.ok is True
    assert executor.calls[0][0] == "send_dm"
    assert executor.calls[0][1]["attachment_paths"] == [str(image_path)]
