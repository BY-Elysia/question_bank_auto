from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ToolExecutionError(Exception):
    category: str
    message: str
    detail: dict | None = None

    def __str__(self) -> str:
        return self.message


class PendingActionError(Exception):
    """Raised when a pending action cannot be confirmed."""

