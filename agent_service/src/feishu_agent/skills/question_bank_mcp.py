from __future__ import annotations

import json
import time
from typing import TYPE_CHECKING, Any

from ..errors import ToolExecutionError
from ..mcp_http import McpHttpClient, McpHttpError
from ..tool_executor import ToolExecutionRecord
from .base import Skill, SkillContext, ToolSpec

if TYPE_CHECKING:
    from ..config import AppConfig


class QuestionBankMcpSkill(Skill):
    name = "question_bank_mcp"
    description = "题库数据库 MCP 能力。"

    def __init__(self, config: AppConfig) -> None:
        self._client = McpHttpClient(
            base_url=config.question_bank_mcp_url,
            timeout_seconds=config.question_bank_mcp_timeout_seconds,
        )
        self._tools_cache: list[ToolSpec] = []
        self._tool_names: set[str] = set()
        self._last_refresh_error = ""

    def get_tools(self) -> list[ToolSpec]:
        if not self._tools_cache:
            self.refresh_tools()
        return list(self._tools_cache)

    def get_guidance(self) -> str:
        base = (
            "question_bank_mcp skill:\n"
            "- 当用户询问教材、试卷、结构节点、题目检索或题目详情时，优先使用题库 MCP 工具。\n"
            "- 这是一组只读数据库能力，不需要确认。\n"
            "- 回答必须以工具返回结果为准，不能编造题库中不存在的信息。"
        )
        if self._last_refresh_error:
            return f"{base}\n- 当前题库 MCP 暂不可用：{self._last_refresh_error}"
        return base

    def execute(
        self,
        tool_name: str,
        args: dict[str, Any],
        context: SkillContext,
    ) -> tuple[dict[str, Any], ToolExecutionRecord]:
        if tool_name not in self._tool_names:
            self.refresh_tools(ark_api_key=context.ark_api_key)
        if tool_name not in self._tool_names:
            raise ToolExecutionError("parameter_error", f"unsupported MCP tool: {tool_name}")

        started = time.perf_counter()
        try:
            result = self._client.call_tool(tool_name, args, ark_api_key=context.ark_api_key)
        except McpHttpError as exc:
            raise ToolExecutionError(
                "tool_error",
                str(exc),
                {
                    "tool_name": tool_name,
                    "arguments": args,
                    "command": ["mcp-http", tool_name],
                },
            ) from exc

        if bool(result.get("isError")):
            raise ToolExecutionError(
                "tool_error",
                self._extract_error_message(result),
                {
                    "tool_name": tool_name,
                    "arguments": args,
                    "command": ["mcp-http", tool_name],
                    "result": result,
                },
            )

        duration_ms = int((time.perf_counter() - started) * 1000)
        record = ToolExecutionRecord(
            tool_name=tool_name,
            command=["mcp-http", tool_name],
            stdout=json.dumps(result, ensure_ascii=False),
            stderr="",
            duration_ms=duration_ms,
            ok=True,
            error_category=None,
        )
        return result, record

    def refresh_tools(self, ark_api_key: str | None = None) -> None:
        try:
            listed_tools = self._client.list_tools(ark_api_key=ark_api_key)
        except McpHttpError as exc:
            self._last_refresh_error = str(exc)
            if self._tools_cache:
                return
            self._tools_cache = []
            self._tool_names = set()
            return

        tools: list[ToolSpec] = []
        for item in listed_tools:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            input_schema = item.get("inputSchema")
            parameters = input_schema if isinstance(input_schema, dict) else {"type": "object", "properties": {}}
            tools.append(
                ToolSpec(
                    name=name,
                    description=str(item.get("description") or "Question bank MCP tool."),
                    parameters=parameters,
                    requires_confirmation=False,
                )
            )

        self._tools_cache = tools
        self._tool_names = {tool.name for tool in tools}
        self._last_refresh_error = ""

    @staticmethod
    def _extract_error_message(result: dict[str, Any]) -> str:
        content = result.get("content")
        if isinstance(content, list):
            text_parts = [
                str(item.get("text") or "").strip()
                for item in content
                if isinstance(item, dict) and item.get("type") == "text"
            ]
            joined = "\n".join(part for part in text_parts if part).strip()
            if joined:
                return joined
        return "Question bank MCP tool returned an error."
