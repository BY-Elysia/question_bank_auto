from __future__ import annotations

import os
import uuid

from .config import AppConfig
from .harness import AgentHarness, build_harness


HELP_TEXT = """可用命令：
  /help                 显示帮助
  /health               检查 agent 健康状态
  /confirm              确认当前待执行动作
  /cancel               取消当前待执行动作
  /history              查看当前会话历史
  /pending              查看当前待确认动作
  /skills               查看当前已启用 skill
  /whoami               查看当前 persona、模型和 skill
  /session <id>         切换会话 ID
  /exit                 退出
"""


class ShellClient:
    def __init__(self, harness: AgentHarness, session_id: str) -> None:
        self._harness = harness
        self._session_id = session_id
        self._pending_action_id: str | None = None

    def print_welcome(self) -> None:
        identity = self._harness.whoami()
        print("Aemeath Agent Console")
        print(f"人格: {identity.persona}")
        print(f"模型: {identity.model}")
        print(f"会话 ID: {self._session_id}")
        print("输入 /help 查看命令。")

    def run(self) -> int:
        self.print_welcome()
        while True:
            try:
                line = input("feishu-agent> ").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                return 0

            if not line:
                continue
            if line.startswith("/"):
                if self._handle_command(line):
                    return 0
                continue
            self._send_chat(line)

    def _handle_command(self, line: str) -> bool:
        if line == "/help":
            print(HELP_TEXT)
            return False
        if line == "/health":
            self._health()
            return False
        if line == "/history":
            self._history()
            return False
        if line == "/pending":
            self._pending()
            return False
        if line == "/skills":
            self._skills()
            return False
        if line == "/whoami":
            self._whoami()
            return False
        if line == "/confirm":
            self._confirm(True)
            return False
        if line == "/cancel":
            self._confirm(False)
            return False
        if line.startswith("/session "):
            self._session_id = line.split(" ", 1)[1].strip() or self._session_id
            self._pending_action_id = None
            print(f"已切换会话: {self._session_id}")
            return False
        if line == "/exit":
            return True
        print("未知命令，输入 /help 查看帮助。")
        return False

    def _health(self) -> None:
        print(self._harness.healthcheck().model_dump())

    def _send_chat(self, message: str) -> None:
        payload = self._harness.handle_message(self._session_id, message, source="shell").model_dump()
        print(payload.get("message") or payload)
        if payload.get("status") == "pending_action":
            pending = payload.get("pending_action") or {}
            self._pending_action_id = pending.get("action_id")
            if pending:
                print(f"待确认 action_id: {self._pending_action_id}")
                print(f"参数预览: {pending.get('args_preview')}")
                print("输入 /confirm 执行，或 /cancel 取消。")
        else:
            self._pending_action_id = None

    def _confirm(self, confirm: bool) -> None:
        if not self._pending_action_id:
            print("当前没有待确认动作。")
            return
        payload = self._harness.confirm_action(self._pending_action_id, confirm).model_dump()
        print(payload.get("message") or payload)
        if payload.get("result") is not None:
            print(payload["result"])
        self._pending_action_id = None

    def _history(self) -> None:
        messages = self._harness.get_session_history(self._session_id, limit=10)
        if not messages:
            print("当前会话还没有历史消息。")
            return
        for item in messages:
            prefix = "用户" if item["role"] == "user" else "爱弥斯"
            print(f"{prefix}: {item['content']}")

    def _pending(self) -> None:
        pending = self._harness.get_pending_action_for_session(self._session_id)
        if pending is None:
            print("当前没有待确认动作。")
            return
        self._pending_action_id = pending["action_id"]
        print(
            {
                "action_id": pending["action_id"],
                "tool_name": pending["tool_name"],
                "summary": pending["summary"],
                "args_preview": pending["args_preview"],
            }
        )

    def _skills(self) -> None:
        for skill in self._harness.list_skills():
            print(f"{skill['name']}: {skill['description']}")

    def _whoami(self) -> None:
        identity = self._harness.whoami()
        print(
            {
                "persona": identity.persona,
                "model": identity.model,
                "skills": list(identity.skills),
            }
        )


def run() -> None:
    config = AppConfig.from_env()
    session_id = os.getenv("FEISHU_AGENT_SESSION_ID") or f"shell-{uuid.uuid4().hex[:8]}"
    client = ShellClient(build_harness(config), session_id=session_id)
    raise SystemExit(client.run())
