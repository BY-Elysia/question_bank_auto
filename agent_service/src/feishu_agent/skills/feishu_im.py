from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING
from typing import Any

from ..errors import ToolExecutionError
from ..store import SessionStore
from ..tool_executor import ToolExecutor
from .base import Skill, SkillContext, ToolSpec

if TYPE_CHECKING:
    from ..config import AppConfig


class FeishuImSkill(Skill):
    name = "feishu_im"
    description = "飞书即时通讯发送能力。"

    def __init__(self, executor: ToolExecutor, config: AppConfig | None = None, store: SessionStore | None = None) -> None:
        self._executor = executor
        self._store = store or (SessionStore(config.app_db_path) if config is not None else None)

    def get_tools(self) -> list[ToolSpec]:
        return [
            ToolSpec(
                name="send_dm",
                description="Send a direct Feishu message to a user by open_id. Use bot identity only.",
                parameters={
                    "type": "object",
                    "properties": {
                        "user_open_id": {"type": "string", "description": "Feishu user open_id."},
                        "text": {"type": "string", "description": "Message text to send. May be empty when attachment_ids are provided."},
                        "attachment_ids": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Optional current chat attachment ids to send as image/file messages.",
                        },
                        "send_as": {
                            "type": "string",
                            "enum": ["bot"],
                            "description": "Sending identity. Always bot in v1.",
                            "default": "bot",
                        },
                    },
                    "required": ["user_open_id"],
                    "additionalProperties": False,
                },
                requires_confirmation=True,
            ),
            ToolSpec(
                name="reply_message",
                description=(
                    "Reply to a specific Feishu message by message_id using bot identity. "
                    "Use this when the user asks to reply in a group message thread."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "message_id": {"type": "string", "description": "Feishu message_id, usually starts with om_."},
                        "text": {"type": "string", "description": "Reply text to send."},
                        "send_as": {
                            "type": "string",
                            "enum": ["bot"],
                            "description": "Sending identity. Always bot in v1.",
                            "default": "bot",
                        },
                    },
                    "required": ["message_id", "text"],
                    "additionalProperties": False,
                },
                requires_confirmation=True,
            ),
        ]

    def get_guidance(self) -> str:
        return (
            "feishu_im skill:\n"
            "- send_dm 只能用于机器人身份的私聊发送。\n"
            "- 当用户意图是“给某人发消息”，且已拿到唯一 open_id 时，调用 send_dm。\n"
            "- 如果用户说“把这张图/这个附件发给某人”，send_dm 要带上本轮附件清单里的 attachment_ids；不要把图片描述成文字替代发送。\n"
            "- 有 attachment_ids 时 text 可以为空；如果用户另外指定附言，则把附言放进 text。\n"
            "- 所有消息发送都要走确认流，不能直接宣称已经发出。"
        )

    def execute(
        self,
        tool_name: str,
        args: dict[str, Any],
        context: SkillContext,
    ):
        if tool_name == "send_dm":
            args = dict(args)
            attachment_ids = [
                str(item or "").strip()
                for item in (args.get("attachment_ids") if isinstance(args.get("attachment_ids"), list) else [])
                if str(item or "").strip()
            ]
            if attachment_ids:
                if self._store is None:
                    raise ToolExecutionError("tool_error", "attachment store is not configured")
                attachments = self._store.get_attachments(attachment_ids)
                found_ids = {str(item.get("attachment_id") or "") for item in attachments}
                missing_ids = [item for item in attachment_ids if item not in found_ids]
                if missing_ids:
                    raise ToolExecutionError("parameter_error", f"attachment_id not found: {', '.join(missing_ids)}")
                attachment_paths = []
                for attachment in attachments:
                    file_path = Path(str(attachment.get("file_path") or ""))
                    if not file_path.is_file():
                        raise ToolExecutionError("parameter_error", f"attachment file is missing: {attachment.get('attachment_id')}")
                    attachment_paths.append(str(file_path))
                args["attachment_paths"] = attachment_paths
        return self._executor.execute(tool_name, args)
