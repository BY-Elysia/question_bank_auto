from __future__ import annotations

from .harness import AgentHarness


class ChatService(AgentHarness):
    def chat(self, session_id: str, message: str, *, ark_api_key_override: str | None = None):
        return self.handle_message(
            session_id,
            message,
            source="http",
            ark_api_key_override=ark_api_key_override,
        )
