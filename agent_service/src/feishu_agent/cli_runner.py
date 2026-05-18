from __future__ import annotations

import json
import re
import subprocess
import time
from dataclasses import dataclass


TOKEN_PATTERNS = [
    re.compile(r"(Bearer\s+)[A-Za-z0-9._-]+"),
    re.compile(r"([A-Za-z_]*token[\"'=:\s]+)[A-Za-z0-9._-]+", re.IGNORECASE),
    re.compile(r"([A-Za-z_]*secret[\"'=:\s]+)[A-Za-z0-9._-]+", re.IGNORECASE),
]


def redact_sensitive(text: str) -> str:
    redacted = text
    for pattern in TOKEN_PATTERNS:
        redacted = pattern.sub(r"\1****", redacted)
    return redacted


@dataclass
class CommandResult:
    command: list[str]
    returncode: int
    stdout: str
    stderr: str
    duration_ms: int
    parsed_json: dict | list | None = None


class CliRunner:
    def __init__(self, cli_bin: str, timeout_seconds: int) -> None:
        self._cli_bin = cli_bin
        self._timeout_seconds = timeout_seconds

    def run(self, args: list[str]) -> CommandResult:
        command = [self._cli_bin, *args]
        started = time.perf_counter()
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=self._timeout_seconds,
            check=False,
        )
        duration_ms = int((time.perf_counter() - started) * 1000)
        raw_stdout = str(completed.stdout or "").strip()
        raw_stderr = str(completed.stderr or "").strip()
        parsed_json = None
        for candidate in (raw_stdout, raw_stderr):
            if not candidate:
                continue
            try:
                parsed_json = json.loads(candidate)
                break
            except json.JSONDecodeError:
                continue
        return CommandResult(
            command=command,
            returncode=completed.returncode,
            stdout=redact_sensitive(raw_stdout),
            stderr=redact_sensitive(raw_stderr),
            duration_ms=duration_ms,
            parsed_json=parsed_json,
        )
