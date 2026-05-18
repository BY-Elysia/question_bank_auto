from __future__ import annotations

from typing import Any

import httpx


class WorkspaceApiError(RuntimeError):
    """Raised when the backend workspace API request fails."""


def derive_backend_base_url(question_bank_mcp_url: str) -> str:
    raw_url = str(question_bank_mcp_url or "").strip().rstrip("/")
    if not raw_url:
        return "http://127.0.0.1:5001"

    marker = "/api/mcp/question-bank"
    marker_index = raw_url.find(marker)
    if marker_index >= 0:
        return raw_url[:marker_index].rstrip("/") or raw_url

    api_index = raw_url.find("/api/")
    if api_index >= 0:
        return raw_url[:api_index].rstrip("/") or raw_url

    return raw_url


class WorkspaceApiClient:
    def __init__(self, *, base_url: str, timeout_seconds: int) -> None:
        self._base_url = str(base_url or "").strip().rstrip("/")
        self._timeout = timeout_seconds

    @classmethod
    def from_question_bank_mcp_url(cls, *, question_bank_mcp_url: str, timeout_seconds: int) -> "WorkspaceApiClient":
        return cls(
            base_url=derive_backend_base_url(question_bank_mcp_url),
            timeout_seconds=timeout_seconds,
        )

    def list_workspaces(self) -> dict[str, Any]:
        return self._request("GET", "/api/workspaces")

    def get_workspace_summary(self, workspace_id: str) -> dict[str, Any]:
        normalized_workspace_id = str(workspace_id or "").strip()
        if not normalized_workspace_id:
            raise WorkspaceApiError("workspaceId is required")
        return self._request("GET", f"/api/workspaces/{normalized_workspace_id}/summary")

    def create_workspace(self, *, name: str, kind: str) -> dict[str, Any]:
        normalized_name = str(name or "").strip()
        normalized_kind = str(kind or "").strip().lower()
        if not normalized_name:
            raise WorkspaceApiError("name is required")
        if normalized_kind not in {"textbook", "exam"}:
            raise WorkspaceApiError("kind must be one of: textbook, exam")
        return self._request(
            "POST",
            "/api/workspaces",
            json_body={
                "name": normalized_name,
                "kind": normalized_kind,
            },
        )

    def _request(self, method: str, path: str, *, json_body: dict[str, Any] | None = None) -> dict[str, Any]:
        url = f"{self._base_url}{path}"
        try:
            with httpx.Client(timeout=self._timeout) as client:
                response = client.request(method, url, json=json_body)
        except httpx.HTTPError as exc:
            raise WorkspaceApiError(f"Workspace API request failed: {exc}") from exc

        text = response.text
        try:
            payload = response.json() if text else {}
        except ValueError as exc:
            raise WorkspaceApiError(
                f"Workspace API returned non-JSON response (HTTP {response.status_code}): {text[:300]}"
            ) from exc

        if response.status_code >= 400:
            message = ""
            if isinstance(payload, dict):
                message = str(payload.get("message") or payload.get("detail") or "").strip()
            raise WorkspaceApiError(message or f"Workspace API request failed with HTTP {response.status_code}")

        if not isinstance(payload, dict):
            raise WorkspaceApiError(f"Unexpected Workspace API response payload: {payload!r}")
        return payload
