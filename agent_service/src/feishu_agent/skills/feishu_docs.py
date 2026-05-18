from __future__ import annotations

from typing import Any

from ..tool_executor import ToolExecutor
from .base import Skill, SkillContext, ToolSpec


class FeishuDocsSkill(Skill):
    name = "feishu_docs"
    description = "飞书文档创建能力。"

    def __init__(self, executor: ToolExecutor) -> None:
        self._executor = executor

    def get_tools(self) -> list[ToolSpec]:
        return [
            ToolSpec(
                name="create_doc",
                description="Create a Feishu document from markdown using user identity.",
                parameters={
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "description": "Document title."},
                        "markdown": {"type": "string", "description": "Markdown body."},
                        "send_as": {
                            "type": "string",
                            "enum": ["user"],
                            "default": "user",
                            "description": "Identity. Always user in v1.",
                        },
                    },
                    "required": ["title", "markdown"],
                    "additionalProperties": False,
                },
                requires_confirmation=True,
            )
        ]

    def get_guidance(self) -> str:
        return (
            "feishu_docs skill:\n"
            "- 创建文档前要先明确标题和正文内容。\n"
            "- create_doc 属于写操作，必须进入确认流。"
        )

    def execute(
        self,
        tool_name: str,
        args: dict[str, Any],
        context: SkillContext,
    ):
        return self._executor.execute(tool_name, args)
