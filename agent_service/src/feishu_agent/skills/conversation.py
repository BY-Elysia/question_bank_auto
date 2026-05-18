from __future__ import annotations

from .base import Skill, SkillContext, ToolSpec


class ConversationSkill(Skill):
    name = "conversation"
    description = "负责爱弥斯人格下的普通聊天与非工具问答。"

    def get_tools(self) -> list[ToolSpec]:
        return []

    def get_guidance(self) -> str:
        return (
            "conversation skill:\n"
            "- 当用户只是打招呼、闲聊、询问你是谁或能做什么时，直接自然回复。\n"
            "- 不要把普通寒暄误判成飞书操作。\n"
            "- 你可以保持爱弥斯的人设，但回答仍要清楚、克制。"
        )

    def execute(self, tool_name: str, args: dict, context: SkillContext):
        raise RuntimeError(f"{self.name} does not execute tools: {tool_name}")
