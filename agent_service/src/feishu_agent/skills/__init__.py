from __future__ import annotations

from typing import Any, Callable

from ..tool_executor import ToolExecutor
from .base import Skill
from .conversation import ConversationSkill
from .feishu_calendar import FeishuCalendarSkill
from .feishu_contact import FeishuContactSkill
from .feishu_docs import FeishuDocsSkill
from .feishu_im import FeishuImSkill
from .feishu_search import FeishuSearchSkill
from .question_bank_mcp import QuestionBankMcpSkill
from .textbook_pipeline import TextbookPipelineSkill
from .workspace_management import WorkspaceManagementSkill


SkillFactory = Callable[[ToolExecutor, Any], Skill]


def _conversation_factory(_: ToolExecutor, __: Any) -> Skill:
    return ConversationSkill()


def _question_bank_mcp_factory(_: ToolExecutor, config: Any) -> Skill:
    return QuestionBankMcpSkill(config)


def _workspace_management_factory(_: ToolExecutor, config: Any) -> Skill:
    return WorkspaceManagementSkill(config)


def _textbook_pipeline_factory(_: ToolExecutor, config: Any) -> Skill:
    return TextbookPipelineSkill(config)


SKILL_FACTORIES: dict[str, SkillFactory] = {
    "conversation": _conversation_factory,
    "feishu_contact": lambda executor, _config: FeishuContactSkill(executor),
    "feishu_im": lambda executor, config: FeishuImSkill(executor, config),
    "feishu_calendar": lambda executor, _config: FeishuCalendarSkill(executor),
    "feishu_docs": lambda executor, _config: FeishuDocsSkill(executor),
    "feishu_search": lambda executor, _config: FeishuSearchSkill(executor),
    "workspace_management": _workspace_management_factory,
    "question_bank_mcp": _question_bank_mcp_factory,
    "textbook_pipeline": _textbook_pipeline_factory,
}


DEFAULT_ENABLED_SKILLS: tuple[str, ...] = (
    "conversation",
    "feishu_contact",
    "feishu_im",
    "feishu_calendar",
    "feishu_docs",
    "feishu_search",
    "workspace_management",
    "question_bank_mcp",
    "textbook_pipeline",
)


def load_skills(names: tuple[str, ...], executor: ToolExecutor, config: Any) -> list[Skill]:
    skills: list[Skill] = []
    for raw_name in names:
        name = raw_name.strip()
        if not name:
            continue
        factory = SKILL_FACTORIES.get(name)
        if factory is None:
            raise ValueError(f"unknown skill: {name}")
        skills.append(factory(executor, config))
    return skills
