from __future__ import annotations

from typing import Any

from .skills.base import ToolSpec


def responses_tools(tools: list[ToolSpec] | tuple[ToolSpec, ...] | Any) -> list[dict[str, Any]]:
    return [
        {
            "type": "function",
            "name": tool.name,
            "description": tool.description,
            "parameters": tool.parameters,
            "strict": True,
        }
        for tool in tools
    ]


def index_tools(tools: list[ToolSpec] | tuple[ToolSpec, ...]) -> dict[str, ToolSpec]:
    return {tool.name: tool for tool in tools}
