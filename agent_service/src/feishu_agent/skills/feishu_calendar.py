from __future__ import annotations

from typing import Any

from ..tool_executor import ToolExecutor
from .base import Skill, SkillContext, ToolSpec


class FeishuCalendarSkill(Skill):
    name = "feishu_calendar"
    description = "飞书日程查询能力。"

    def __init__(self, executor: ToolExecutor) -> None:
        self._executor = executor

    def get_tools(self) -> list[ToolSpec]:
        return [
            ToolSpec(
                name="list_agenda",
                description="List calendar agenda for a given date in YYYY-MM-DD format using user identity.",
                parameters={
                    "type": "object",
                    "properties": {
                        "date": {"type": "string", "description": "Date in YYYY-MM-DD format."},
                        "send_as": {
                            "type": "string",
                            "enum": ["user"],
                            "default": "user",
                            "description": "Identity. Always user in v1.",
                        },
                    },
                    "required": ["date"],
                    "additionalProperties": False,
                },
                requires_confirmation=False,
            )
        ]

    def get_guidance(self) -> str:
        return (
            "feishu_calendar skill:\n"
            "- 查询今日日程或指定日期行程时，调用 list_agenda。\n"
            "- 用户侧日历资源默认走 user 身份。"
        )

    def execute(
        self,
        tool_name: str,
        args: dict[str, Any],
        context: SkillContext,
    ):
        return self._executor.execute(tool_name, args)
