from __future__ import annotations

from typing import Any

from ..tool_executor import ToolExecutor
from .base import Skill, SkillContext, ToolSpec


class FeishuSearchSkill(Skill):
    name = "feishu_search"
    description = "飞书消息检索能力。"

    def __init__(self, executor: ToolExecutor) -> None:
        self._executor = executor

    def get_tools(self) -> list[ToolSpec]:
        return [
            ToolSpec(
                name="get_chat_messages",
                description=(
                    "Get messages from a specific Feishu chat by chat name and date. "
                    "Uses user identity first, then bot identity if user authorization is missing."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "chat_name": {
                            "type": "string",
                            "description": "Exact or near-exact Feishu chat/group name.",
                        },
                        "date": {
                            "type": "string",
                            "description": "Date in YYYY-MM-DD, interpreted in Asia/Shanghai.",
                        },
                        "send_as": {
                            "type": "string",
                            "enum": ["auto"],
                            "default": "auto",
                            "description": "Identity selection. Always auto in v1.",
                        },
                    },
                    "required": ["chat_name", "date"],
                    "additionalProperties": False,
                },
                requires_confirmation=False,
            ),
            ToolSpec(
                name="search_messages",
                description="Search Feishu messages by keyword using user identity.",
                parameters={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Search keyword."},
                        "send_as": {
                            "type": "string",
                            "enum": ["user"],
                            "default": "user",
                            "description": "Identity. Always user in v1.",
                        },
                    },
                    "required": ["query"],
                    "additionalProperties": False,
                },
                requires_confirmation=False,
            )
        ]

    def get_guidance(self) -> str:
        return (
            "feishu_search skill:\n"
            "- 当用户要求按关键词搜索消息时，调用 search_messages。\n"
            "- 当用户要求总结某个群/聊天在某一天的消息，或明确提到“某个群里昨天/今天的聊天”时，调用 get_chat_messages。\n"
            "- search_messages 是全局关键词搜索，不适合代替按群按日期拉取完整聊天记录。\n"
            "- 这是只读能力，不需要确认。"
        )

    def execute(
        self,
        tool_name: str,
        args: dict[str, Any],
        context: SkillContext,
    ):
        return self._executor.execute(tool_name, args)
