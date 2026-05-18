from __future__ import annotations

import json
import time
from typing import TYPE_CHECKING, Any

from ..errors import ToolExecutionError
from ..tool_executor import ToolExecutionRecord
from ..workspace_api import WorkspaceApiClient, WorkspaceApiError
from .base import Skill, SkillContext, ToolSpec

if TYPE_CHECKING:
    from ..config import AppConfig


class WorkspaceManagementSkill(Skill):
    name = "workspace_management"
    description = "Manage backend question-bank workspaces."

    def __init__(self, config: AppConfig, client: WorkspaceApiClient | None = None) -> None:
        self._client = client or WorkspaceApiClient.from_question_bank_mcp_url(
            question_bank_mcp_url=config.question_bank_mcp_url,
            timeout_seconds=config.question_bank_mcp_timeout_seconds,
        )

    def get_tools(self) -> list[ToolSpec]:
        return [
            ToolSpec(
                name="list_workspaces",
                description="List existing backend workspaces for the question bank system.",
                parameters={
                    "type": "object",
                    "properties": {},
                    "required": [],
                    "additionalProperties": False,
                },
                requires_confirmation=False,
            ),
            ToolSpec(
                name="get_workspace_summary",
                description="Read the summary of one backend workspace by workspaceId.",
                parameters={
                    "type": "object",
                    "properties": {
                        "workspaceId": {
                            "type": "string",
                            "description": "Existing workspace id.",
                        },
                    },
                    "required": ["workspaceId"],
                    "additionalProperties": False,
                },
                requires_confirmation=False,
            ),
            ToolSpec(
                name="create_workspace",
                description=(
                    "Create a backend workspace. Use kind='textbook' for textbook, chapter, PDF-to-image, "
                    "and exercise-bank workflows; use kind='exam' for exam/paper workflows."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Human-readable workspace name. Ask the user if it is unclear.",
                        },
                        "kind": {
                            "type": "string",
                            "enum": ["textbook", "exam"],
                            "description": "Workspace kind. Ask the user if textbook vs exam is unclear.",
                        },
                    },
                    "required": ["name", "kind"],
                    "additionalProperties": False,
                },
                requires_confirmation=True,
            ),
        ]

    def get_guidance(self) -> str:
        return (
            "workspace_management skill:\n"
            "- 当用户要新建、查看或确认题库工作区时，优先使用工作区工具。\n"
            "- 创建工作区需要两个关键信息：name 和 kind。\n"
            "- kind 只能是 textbook 或 exam：教材、章节、PDF 转图片、习题整理通常是 textbook；试卷、考试、卷面整理通常是 exam。\n"
            "- 如果用户没有说清楚工作区名字，先追问名字，不要替用户随意命名。\n"
            "- 如果用户没有说清楚是教材工作区还是试卷工作区，先追问类型；只有上下文明显时才推断。\n"
            "- create_workspace 是写操作，会进入确认流；不要在确认前声称已经创建成功。\n"
        )

    def execute(
        self,
        tool_name: str,
        args: dict[str, Any],
        context: SkillContext,
    ) -> tuple[dict[str, Any], ToolExecutionRecord]:
        started = time.perf_counter()
        command = self._command_preview(tool_name, args)

        try:
            if tool_name == "list_workspaces":
                result = self._client.list_workspaces()
            elif tool_name == "get_workspace_summary":
                workspace_id = str(args.get("workspaceId") or "").strip()
                if not workspace_id:
                    raise ToolExecutionError("parameter_error", "workspaceId is required", {"command": command})
                result = self._client.get_workspace_summary(workspace_id)
            elif tool_name == "create_workspace":
                name = str(args.get("name") or "").strip()
                kind = str(args.get("kind") or "").strip().lower()
                if not name:
                    raise ToolExecutionError("parameter_error", "name is required", {"command": command})
                if kind not in {"textbook", "exam"}:
                    raise ToolExecutionError("parameter_error", "kind must be one of: textbook, exam", {"command": command})
                result = self._client.create_workspace(name=name, kind=kind)
            else:
                raise ToolExecutionError("parameter_error", f"unsupported workspace tool: {tool_name}", {"command": command})
        except WorkspaceApiError as exc:
            raise ToolExecutionError(
                "tool_error",
                str(exc),
                {
                    "tool_name": tool_name,
                    "arguments": args,
                    "command": command,
                },
            ) from exc

        duration_ms = int((time.perf_counter() - started) * 1000)
        record = ToolExecutionRecord(
            tool_name=tool_name,
            command=command,
            stdout=json.dumps(result, ensure_ascii=False),
            stderr="",
            duration_ms=duration_ms,
            ok=True,
            error_category=None,
        )
        return result, record

    @staticmethod
    def _command_preview(tool_name: str, args: dict[str, Any]) -> list[str]:
        if tool_name == "list_workspaces":
            return ["backend-http", "GET", "/api/workspaces"]
        if tool_name == "get_workspace_summary":
            return [
                "backend-http",
                "GET",
                f"/api/workspaces/{str(args.get('workspaceId') or '').strip()}/summary",
            ]
        if tool_name == "create_workspace":
            return ["backend-http", "POST", "/api/workspaces"]
        return ["backend-http", tool_name]
