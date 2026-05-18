from __future__ import annotations

from typing import Any

import httpx


class McpHttpError(RuntimeError):
    """Raised when an MCP-over-HTTP request fails."""


class McpHttpClient:
    def __init__(self, *, base_url: str, timeout_seconds: int) -> None:
        self._base_url = base_url
        self._timeout = timeout_seconds
        self._request_id = 0

    def list_tools(self, ark_api_key: str | None = None) -> list[dict[str, Any]]:
        payload = self._request("tools/list", {}, ark_api_key=ark_api_key)
        tools = payload.get("tools")
        return tools if isinstance(tools, list) else []

    def call_tool(
        self,
        name: str,
        arguments: dict[str, Any],
        *,
        ark_api_key: str | None = None,
    ) -> dict[str, Any]:
        payload = self._request(
            "tools/call",
            {
                "name": name,
                "arguments": arguments,
            },
            ark_api_key=ark_api_key,
        )
        return payload if isinstance(payload, dict) else {"result": payload}

    def _request(
        self,
        method: str,
        params: dict[str, Any],
        *,
        ark_api_key: str | None = None,
    ) -> dict[str, Any]:
        self._request_id += 1
        headers = {
            "Accept": "application/json, text/event-stream",
            "Content-Type": "application/json",
        }
        if ark_api_key:
            headers["X-Ark-Api-Key"] = ark_api_key

        body = {
            "jsonrpc": "2.0",
            "id": self._request_id,
            "method": method,
            "params": params,
        }

        try:
            with httpx.Client(timeout=self._timeout) as client:
                response = client.post(self._base_url, json=body, headers=headers)
        except httpx.HTTPError as exc:
            raise McpHttpError(f"MCP request failed: {exc}") from exc

        try:
            payload = response.json()
        except ValueError as exc:
            preview = response.text[:300]
            raise McpHttpError(
                f"MCP server returned non-JSON response (HTTP {response.status_code}): {preview}"
            ) from exc

        if response.status_code >= 400:
            message = self._extract_error_message(payload) or f"HTTP {response.status_code}"
            raise McpHttpError(message)

        if isinstance(payload, list):
            if not payload:
                return {}
            payload = payload[0]

        if not isinstance(payload, dict):
            raise McpHttpError(f"Unexpected MCP response payload: {payload!r}")

        if "error" in payload:
            raise McpHttpError(self._extract_error_message(payload) or "Unknown MCP error")

        result = payload.get("result")
        if isinstance(result, dict):
            return result
        if result is None:
            return {}
        return {"result": result}

    @staticmethod
    def _extract_error_message(payload: Any) -> str:
        if not isinstance(payload, dict):
            return ""
        error = payload.get("error")
        if isinstance(error, dict):
            return str(error.get("message") or "").strip()
        return ""
