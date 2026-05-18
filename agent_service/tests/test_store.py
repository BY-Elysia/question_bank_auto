from __future__ import annotations

from pathlib import Path

from feishu_agent.store import SessionStore


def test_claim_incoming_message_is_idempotent(tmp_path: Path) -> None:
    store = SessionStore(tmp_path / "app.db")

    assert store.claim_incoming_message("om_123", chat_id="oc_1", source="subscribe") is True
    assert store.claim_incoming_message("om_123", chat_id="oc_1", source="polling") is False
