from __future__ import annotations

from typing import Any

from ..tool_executor import ToolExecutor
from .base import Skill, SkillContext, ToolSpec


class FeishuContactSkill(Skill):
    name = "feishu_contact"
    description = "飞书联系人与人员检索能力。"

    def __init__(self, executor: ToolExecutor) -> None:
        self._executor = executor

    def get_tools(self) -> list[ToolSpec]:
        return [
            ToolSpec(
                name="search_user",
                description="Search Feishu users by name or keyword. Use this before sending a direct message if you only know the person's name.",
                parameters={
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "Person name or search keyword."},
                    },
                    "required": ["name"],
                    "additionalProperties": False,
                },
                requires_confirmation=False,
            )
        ]

    def get_guidance(self) -> str:
        return (
            "feishu_contact skill:\n"
            "- 当用户只给了姓名，但目标是发私聊或确认身份时，先调用 search_user。\n"
            "- 如果返回多个候选，不要继续写操作，先让用户澄清。\n"
            "- 如果返回 0 个候选，才能明确说未找到用户。"
        )

    def execute(
        self,
        tool_name: str,
        args: dict[str, Any],
        context: SkillContext,
    ):
        return self._executor.execute(tool_name, args)
