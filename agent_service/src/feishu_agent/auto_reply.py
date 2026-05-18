from __future__ import annotations

import json
import re
import subprocess
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from .cli_runner import CliRunner
from .config import AppConfig
from .harness import AgentHarness, build_harness
from .store import SessionStore


CONFIRM_WORDS = {"确认", "/confirm", "确认执行", "执行"}
CANCEL_WORDS = {"取消", "/cancel", "取消执行"}
AT_TAG_RE = re.compile(r"<at\b[^>]*>.*?</at>", re.IGNORECASE)
SUBSCRIBE_RESTART_DELAY_SECONDS = 5


def _unwrap_lark_payload(payload: Any) -> dict[str, Any]:
    if isinstance(payload, dict):
        nested = payload.get("data")
        if isinstance(nested, dict):
            return nested
        return payload
    return {}


class ReplyClient:
    def __init__(self, runner: CliRunner) -> None:
        self._runner = runner

    def reply_text(self, message_id: str, text: str, *, chat_id: str | None = None) -> None:
        failures: list[str] = []

        for label, attempt in (
            ("shortcut_reply", lambda: self._reply_via_shortcut(message_id, text)),
            ("api_reply", lambda: self._reply_via_api(message_id, text)),
        ):
            if self._run_attempt(label, attempt, failures):
                return

        if chat_id:
            for label, attempt in (
                ("api_send_to_chat", lambda: self._send_to_chat_via_api(chat_id, text)),
                ("shortcut_send_to_chat", lambda: self._send_to_chat(chat_id, text)),
            ):
                if self._run_attempt(label, attempt, failures):
                    return

        detail = "; ".join(failures) if failures else "unknown error"
        raise RuntimeError(f"failed to reply message {message_id}: {detail}")

    def _run_attempt(self, label: str, attempt, failures: list[str]) -> bool:
        try:
            result = attempt()
        except OSError as exc:
            failures.append(f"{label}: {exc}")
            return False

        if result.returncode == 0:
            return True

        detail = result.stderr or result.stdout or f"exit code {result.returncode}"
        failures.append(f"{label}: {detail}")
        return False

    def _reply_via_shortcut(self, message_id: str, text: str):
        return self._runner.run(
            [
                "im",
                "+messages-reply",
                "--message-id",
                message_id,
                "--text",
                text,
                "--as",
                "bot",
            ]
        )

    def _reply_via_api(self, message_id: str, text: str):
        payload = {
            "content": json.dumps({"text": text}, ensure_ascii=False),
            "msg_type": "text",
        }
        return self._runner.run(
            [
                "api",
                "POST",
                f"/open-apis/im/v1/messages/{message_id}/reply",
                "--as",
                "bot",
                "--data",
                json.dumps(payload, ensure_ascii=False),
            ]
        )

    def _send_to_chat_via_api(self, chat_id: str, text: str):
        payload = {
            "receive_id": chat_id,
            "msg_type": "text",
            "content": json.dumps({"text": text}, ensure_ascii=False),
        }
        return self._runner.run(
            [
                "api",
                "POST",
                "/open-apis/im/v1/messages",
                "--as",
                "bot",
                "--params",
                json.dumps({"receive_id_type": "chat_id"}, ensure_ascii=False),
                "--data",
                json.dumps(payload, ensure_ascii=False),
            ]
        )

    def _send_to_chat(self, chat_id: str, text: str):
        return self._runner.run(
            [
                "im",
                "+messages-send",
                "--chat-id",
                chat_id,
                "--text",
                text,
                "--as",
                "bot",
            ]
        )


class AutoReplyWorker:
    def __init__(
        self,
        *,
        store: SessionStore,
        harness: AgentHarness,
        reply_client: ReplyClient,
        group_reply_mode: str = "off",
        app_id: str | None = None,
        bot_mention_ids: tuple[str, ...] = (),
        bot_mention_names: tuple[str, ...] = (),
        debug_enabled: bool = False,
    ) -> None:
        self._store = store
        self._harness = harness
        self._reply_client = reply_client
        self._group_reply_mode = group_reply_mode
        self._app_id = app_id
        self._bot_mention_ids = {item.strip() for item in bot_mention_ids if item.strip()}
        self._bot_mention_names = {item.strip() for item in bot_mention_names if item.strip()}
        self._debug_enabled = debug_enabled

    def handle_event(self, event: dict[str, Any], *, delivery_source: str = "subscribe") -> None:
        event_type = self._extract_event_type(event)
        raw_message_id = self._extract_message_id(event)
        raw_chat_id = self._extract_chat_id(event)
        normalized, reason = self._normalize_event(event)
        if normalized is None:
            if raw_message_id:
                claimed = self._store.claim_incoming_message(
                    raw_message_id,
                    chat_id=raw_chat_id,
                    source=f"{delivery_source}:ignored",
                )
                if not claimed:
                    self._debug_log(
                        f"duplicate event_type={event_type} source={delivery_source} "
                        f"message_id={raw_message_id}"
                    )
                    return
            self._debug_log(f"ignore event_type={event_type} source={delivery_source} reason={reason}")
            return

        if not self._store.claim_incoming_message(
            normalized["message_id"],
            chat_id=normalized["chat_id"],
            source=delivery_source,
        ):
            self._debug_log(
                f"duplicate event_type={event_type} source={delivery_source} "
                f"message_id={normalized['message_id']}"
            )
            return

        self._debug_log(
            "accept event_type={event_type} source={source} chat_type={chat_type} "
            "chat_id={chat_id} sender={sender} message_id={message_id} text={text}".format(
                event_type=event_type,
                source=delivery_source,
                chat_type=normalized.get("chat_type") or "",
                chat_id=normalized.get("chat_id") or "",
                sender=normalized.get("sender_name")
                or normalized.get("sender_open_id")
                or normalized.get("sender_user_id")
                or "unknown",
                message_id=normalized.get("message_id") or "",
                text=self._preview_text(normalized.get("content") or ""),
            )
        )

        session_id = f"im-chat:{normalized['chat_id']}"
        content = normalized["content"]
        if content in CONFIRM_WORDS:
            self._debug_log(f"confirmation session_id={session_id} confirm=true")
            self._handle_confirmation(normalized["message_id"], session_id, True)
            return
        if content in CANCEL_WORDS:
            self._debug_log(f"confirmation session_id={session_id} confirm=false")
            self._handle_confirmation(normalized["message_id"], session_id, False)
            return

        payload = self._harness.handle_message(
            session_id,
            content,
            source="feishu_event",
            message_metadata=self._build_message_metadata(normalized),
        ).model_dump()
        self._debug_log(
            f"reply session_id={session_id} status={payload.get('status')} "
            f"message={self._preview_text(str(payload.get('message') or ''))}"
        )
        self._reply_to_chat_response(normalized["message_id"], normalized["chat_id"], payload)

    def _handle_confirmation(self, message_id: str, session_id: str, confirm: bool) -> None:
        pending = self._store.get_latest_pending_action_for_session(session_id)
        if pending is None:
            chat_id = session_id.removeprefix("im-chat:")
            self._reply_client.reply_text(message_id, "当前没有待确认动作。", chat_id=chat_id)
            return
        payload = self._harness.confirm_action(pending["action_id"], confirm).model_dump()
        text = str(payload.get("message") or ("已执行。" if confirm else "已取消。")).strip()
        chat_id = session_id.removeprefix("im-chat:")
        self._reply_client.reply_text(message_id, text, chat_id=chat_id)

    def _reply_to_chat_response(self, message_id: str, chat_id: str, payload: dict[str, Any]) -> None:
        status = str(payload.get("status") or "message")
        text = str(payload.get("message") or "").strip()
        if status == "pending_action":
            if not text:
                text = "检测到待确认动作。"
            text = f"{text}\n回复“确认”执行，回复“取消”放弃。"
        elif not text:
            text = "未获得可回复内容。"
        self._reply_client.reply_text(message_id, text, chat_id=chat_id)

    def _normalize_event(self, event: dict[str, Any]) -> tuple[dict[str, str] | None, str]:
        if isinstance(event.get("event"), dict):
            return self._normalize_raw_event(event)
        return self._normalize_compact_event(event)

    def _normalize_compact_event(self, event: dict[str, Any]) -> tuple[dict[str, str] | None, str]:
        sender_type = str(event.get("sender_type") or "").strip().lower()
        if sender_type == "app":
            return None, "sender_type=app"

        chat_type = str(event.get("chat_type") or "").strip().lower()
        mentions = event.get("mentions") if isinstance(event.get("mentions"), list) else []
        if not self._should_process_group_message(chat_type, mentions, str(event.get("content") or "")):
            return None, f"group_message_filtered(mode={self._group_reply_mode})"

        if str(event.get("message_type") or "").strip().lower() != "text":
            message_type = str(event.get("message_type") or "").strip().lower() or "unknown"
            return None, f"message_type={message_type}"

        message_id = str(event.get("message_id") or "").strip()
        chat_id = str(event.get("chat_id") or "").strip()
        content = str(event.get("content") or "").strip()
        if not message_id or not chat_id or not content:
            return None, "missing_message_id_or_chat_id_or_content"

        return (
            {
                "message_id": message_id,
                "chat_id": chat_id,
                "chat_type": chat_type,
                "chat_name": self._extract_chat_name(event),
                "content": self._clean_text_content(content, mentions),
                **self._extract_sender_fields(event.get("sender"), event),
            },
            "ok",
        )

    def _normalize_raw_event(self, envelope: dict[str, Any]) -> tuple[dict[str, str] | None, str]:
        event = envelope.get("event") if isinstance(envelope.get("event"), dict) else {}
        message = event.get("message") if isinstance(event.get("message"), dict) else {}
        sender = event.get("sender") if isinstance(event.get("sender"), dict) else {}

        sender_type = str(sender.get("sender_type") or "").strip().lower()
        if sender_type == "app":
            return None, "sender_type=app"

        chat_type = str(message.get("chat_type") or "").strip().lower()
        raw_content = message.get("content")
        mentions = message.get("mentions") if isinstance(message.get("mentions"), list) else []
        if not self._should_process_group_message(chat_type, mentions, str(raw_content or "")):
            return None, f"group_message_filtered(mode={self._group_reply_mode})"

        message_type = str(message.get("message_type") or "").strip().lower()
        if message_type != "text":
            return None, f"message_type={message_type or 'unknown'}"

        message_id = str(message.get("message_id") or "").strip()
        chat_id = str(message.get("chat_id") or "").strip()
        content = self._extract_text_content(raw_content, mentions)
        if not message_id or not chat_id or not content:
            return None, "missing_message_id_or_chat_id_or_content"

        return (
            {
                "message_id": message_id,
                "chat_id": chat_id,
                "chat_type": chat_type,
                "chat_name": self._extract_chat_name(message, event),
                "content": content,
                **self._extract_sender_fields(sender, event),
            },
            "ok",
        )

    def _build_message_metadata(self, normalized: dict[str, str]) -> dict[str, str]:
        metadata = {
            "channel": "feishu",
            "feishu_chat_id": str(normalized.get("chat_id") or "").strip(),
            "feishu_chat_type": str(normalized.get("chat_type") or "").strip(),
            "feishu_chat_name": str(normalized.get("chat_name") or "").strip(),
            "feishu_sender_name": str(normalized.get("sender_name") or "").strip(),
            "feishu_sender_open_id": str(normalized.get("sender_open_id") or "").strip(),
            "feishu_sender_user_id": str(normalized.get("sender_user_id") or "").strip(),
            "feishu_sender_union_id": str(normalized.get("sender_union_id") or "").strip(),
        }
        metadata["feishu_sender_label"] = self._build_sender_label(metadata)
        return {key: value for key, value in metadata.items() if value}

    def _build_sender_label(self, metadata: dict[str, str]) -> str:
        name = str(metadata.get("feishu_sender_name") or "").strip()
        identifier = (
            str(metadata.get("feishu_sender_open_id") or "").strip()
            or str(metadata.get("feishu_sender_user_id") or "").strip()
            or str(metadata.get("feishu_sender_union_id") or "").strip()
        )
        if name and identifier:
            return f"{name} ({identifier})"
        return name or identifier

    def _extract_sender_fields(self, sender_payload: Any, *fallback_payloads: Any) -> dict[str, str]:
        payloads = []
        if isinstance(sender_payload, dict):
            payloads.append(sender_payload)
        payloads.extend(item for item in fallback_payloads if isinstance(item, dict))

        sender_id_payload: dict[str, Any] = {}
        for payload in payloads:
            nested = payload.get("sender_id")
            if isinstance(nested, dict):
                sender_id_payload = nested
                break

        def pick(*keys: str) -> str:
            for payload in payloads:
                for key in keys:
                    value = payload.get(key)
                    text = str(value or "").strip()
                    if text:
                        return text
            for key in keys:
                value = sender_id_payload.get(key)
                text = str(value or "").strip()
                if text:
                    return text
            return ""

        return {
            "sender_name": pick("name", "sender_name", "user_name"),
            "sender_open_id": pick("open_id"),
            "sender_user_id": pick("user_id"),
            "sender_union_id": pick("union_id"),
        }

    def _extract_chat_name(self, *payloads: Any) -> str:
        for payload in payloads:
            if not isinstance(payload, dict):
                continue
            for key in ("chat_name", "name", "chat_title"):
                text = str(payload.get(key) or "").strip()
                if text:
                    return text
        return ""

    def _extract_event_type(self, event: dict[str, Any]) -> str:
        header = event.get("header") if isinstance(event.get("header"), dict) else {}
        nested_event = event.get("event") if isinstance(event.get("event"), dict) else {}
        candidates = (
            header.get("event_type"),
            event.get("event_type"),
            event.get("type"),
            nested_event.get("type"),
        )
        for candidate in candidates:
            text = str(candidate or "").strip()
            if text:
                return text
        return "unknown"

    def _extract_message_id(self, event: dict[str, Any]) -> str:
        if isinstance(event.get("message_id"), str):
            return str(event.get("message_id") or "").strip()
        nested_event = event.get("event") if isinstance(event.get("event"), dict) else {}
        message = nested_event.get("message") if isinstance(nested_event.get("message"), dict) else {}
        return str(message.get("message_id") or "").strip()

    def _extract_chat_id(self, event: dict[str, Any]) -> str:
        if isinstance(event.get("chat_id"), str):
            return str(event.get("chat_id") or "").strip()
        nested_event = event.get("event") if isinstance(event.get("event"), dict) else {}
        message = nested_event.get("message") if isinstance(nested_event.get("message"), dict) else {}
        return str(message.get("chat_id") or "").strip()

    def _preview_text(self, value: str, max_length: int = 80) -> str:
        normalized = " ".join(str(value or "").split()).strip()
        if len(normalized) <= max_length:
            return normalized
        return f"{normalized[:max_length].rstrip()}..."

    def _debug_log(self, message: str) -> None:
        if not self._debug_enabled:
            return
        print(f"[auto-reply] {message}", flush=True)

    def _should_process_group_message(
        self,
        chat_type: str,
        mentions: list[dict[str, Any]],
        raw_content: str,
    ) -> bool:
        if chat_type != "group":
            return True
        if self._group_reply_mode == "all":
            return True
        if self._group_reply_mode == "mention":
            return self._is_mentioning_me(mentions, raw_content)
        return False

    def _is_mentioning_me(self, mentions: list[dict[str, Any]], raw_content: str) -> bool:
        app_id = (self._app_id or "").strip()
        normalized_raw_content = str(raw_content or "")
        for mention in mentions:
            mention_id = str(mention.get("id") or mention.get("key") or "").strip()
            mention_name = str(mention.get("name") or "").strip()
            if app_id and mention_id == app_id:
                return True
            if mention_id and mention_id in self._bot_mention_ids:
                return True
            if mention_name and mention_name in self._bot_mention_names:
                return True
        if app_id and app_id in normalized_raw_content:
            return True
        return any(bot_id in normalized_raw_content for bot_id in self._bot_mention_ids)

    def _extract_text_content(self, raw_content: Any, mentions: list[dict[str, Any]] | None = None) -> str:
        if isinstance(raw_content, dict):
            text = raw_content.get("text")
            return self._clean_text_content(str(text or ""), mentions)
        if not isinstance(raw_content, str):
            return ""
        try:
            payload = json.loads(raw_content)
        except json.JSONDecodeError:
            return self._clean_text_content(raw_content, mentions)
        if isinstance(payload, dict):
            return self._clean_text_content(str(payload.get("text") or ""), mentions)
        return ""

    def _clean_text_content(self, text: str, mentions: list[dict[str, Any]] | None = None) -> str:
        cleaned = AT_TAG_RE.sub(" ", text)
        for mention in mentions or []:
            mention_name = str(mention.get("name") or "").strip()
            mention_key = str(mention.get("key") or "").strip()
            if mention_key:
                cleaned = re.sub(rf"^\s*{re.escape(mention_key)}\s*", " ", cleaned)
            if not mention_name:
                continue
            cleaned = re.sub(rf"^\s*@{re.escape(mention_name)}\s*", " ", cleaned)
        return " ".join(cleaned.split()).strip()


class EventSubscriber:
    def __init__(
        self,
        *,
        config: AppConfig,
        worker: AutoReplyWorker,
    ) -> None:
        self._config = config
        self._worker = worker

    def build_command(self) -> list[str]:
        command = [
            self._config.lark_cli_bin,
            "event",
            "+subscribe",
            "--quiet",
            "--as",
            "bot",
        ]
        if self._config.auto_reply_event_types:
            command[3:3] = ["--event-types", ",".join(self._config.auto_reply_event_types)]
        return command

    def run_forever(self, stop_event: threading.Event) -> None:
        while not stop_event.is_set():
            command = self.build_command()
            try:
                with subprocess.Popen(
                    command,
                    stdout=subprocess.PIPE,
                    stderr=None,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    bufsize=1,
                ) as process:
                    if process.stdout is None:
                        raise RuntimeError("event subscriber stdout is unavailable")

                    for line in process.stdout:
                        if stop_event.is_set():
                            process.terminate()
                            break
                        raw = line.strip()
                        if not raw:
                            continue
                        try:
                            event = json.loads(raw)
                        except json.JSONDecodeError:
                            print(f"[auto-reply] ignore unparsable subscribe output: {raw}", flush=True)
                            continue

                        try:
                            self._worker.handle_event(event, delivery_source="subscribe")
                        except Exception as exc:  # pragma: no cover - defensive logging
                            print(f"[auto-reply] failed to handle subscribed event: {exc}", flush=True)

                    if stop_event.is_set():
                        process.terminate()
                        process.wait(timeout=5)
                        return

                    exit_code = process.wait()
                    print(
                        f"[auto-reply] event subscriber exited with code {exit_code}; "
                        f"retrying in {SUBSCRIBE_RESTART_DELAY_SECONDS}s",
                        flush=True,
                    )
            except Exception as exc:  # pragma: no cover - defensive logging
                print(f"[auto-reply] event subscriber crashed: {exc}", flush=True)

            stop_event.wait(SUBSCRIBE_RESTART_DELAY_SECONDS)


class GroupChatPoller:
    def __init__(
        self,
        *,
        runner: CliRunner,
        store: SessionStore,
        worker: AutoReplyWorker,
        interval_seconds: int,
        lookback_seconds: int,
        chat_refresh_seconds: int,
        debug_enabled: bool = False,
    ) -> None:
        self._runner = runner
        self._store = store
        self._worker = worker
        self._interval_seconds = interval_seconds
        self._lookback_seconds = lookback_seconds
        self._chat_refresh_seconds = chat_refresh_seconds
        self._debug_enabled = debug_enabled
        self._cached_chats: list[dict[str, str]] = []
        self._cached_at = 0.0

    def run_forever(self, stop_event: threading.Event) -> None:
        seeded = self._bootstrap(stop_event)
        self._debug_log(f"polling bootstrap claimed {seeded} recent message(s)")

        while not stop_event.is_set():
            started = time.monotonic()
            try:
                self._poll_once(stop_event)
            except Exception as exc:  # pragma: no cover - defensive logging
                print(f"[auto-reply] polling loop failed: {exc}", flush=True)
            remaining = max(0.0, self._interval_seconds - (time.monotonic() - started))
            stop_event.wait(remaining)

    def _bootstrap(self, stop_event: threading.Event) -> int:
        count = 0
        for chat in self._get_group_chats(force_refresh=True):
            if stop_event.is_set():
                break
            for message in self._iter_recent_messages(chat["chat_id"]):
                if self._remember_message(message, chat["chat_id"], "polling-bootstrap"):
                    count += 1
        return count

    def _poll_once(self, stop_event: threading.Event) -> None:
        chats = self._get_group_chats(force_refresh=False)
        if not chats:
            self._debug_log("no group chats available for polling")
            return

        for chat in chats:
            if stop_event.is_set():
                return
            for message in self._iter_recent_messages(chat["chat_id"]):
                if stop_event.is_set():
                    return
                event = self._build_group_event(chat, message)
                if event is None:
                    continue
                try:
                    self._worker.handle_event(event, delivery_source="polling")
                except Exception as exc:  # pragma: no cover - defensive logging
                    print(
                        f"[auto-reply] failed to handle polled message in chat {chat['chat_id']}: {exc}",
                        flush=True,
                    )

    def _get_group_chats(self, *, force_refresh: bool) -> list[dict[str, str]]:
        if not force_refresh and (time.monotonic() - self._cached_at) < self._chat_refresh_seconds:
            return list(self._cached_chats)

        chats: list[dict[str, str]] = []
        page_token = ""
        while True:
            params: dict[str, Any] = {"page_size": 100}
            if page_token:
                params["page_token"] = page_token
            payload = self._run_json(
                [
                    "im",
                    "chats",
                    "list",
                    "--as",
                    "bot",
                    "--params",
                    json.dumps(params, ensure_ascii=False),
                ]
            )
            data = _unwrap_lark_payload(payload)
            items = data.get("items") if isinstance(data.get("items"), list) else []
            for item in items:
                if not isinstance(item, dict):
                    continue
                chat_id = str(item.get("chat_id") or "").strip()
                chat_name = str(item.get("name") or "").strip()
                chat_status = str(item.get("chat_status") or "").strip().lower()
                if not chat_id or (chat_status and chat_status != "normal"):
                    continue
                chats.append({"chat_id": chat_id, "chat_name": chat_name})

            has_more = bool(data.get("has_more"))
            page_token = str(data.get("page_token") or "").strip()
            if not has_more or not page_token:
                break

        self._cached_chats = chats
        self._cached_at = time.monotonic()
        self._debug_log(f"refreshed polling chat list: {len(chats)} chat(s)")
        return list(chats)

    def _iter_recent_messages(self, chat_id: str) -> list[dict[str, Any]]:
        messages: list[dict[str, Any]] = []
        page_token = ""
        start_time = (datetime.now().astimezone() - timedelta(seconds=self._lookback_seconds)).isoformat(timespec="seconds")

        while True:
            args = [
                "im",
                "+chat-messages-list",
                "--as",
                "bot",
                "--chat-id",
                chat_id,
                "--sort",
                "asc",
                "--page-size",
                "50",
                "--start",
                start_time,
            ]
            if page_token:
                args.extend(["--page-token", page_token])

            payload = self._run_json(args)
            data = _unwrap_lark_payload(payload)
            page_messages = data.get("messages") if isinstance(data.get("messages"), list) else []
            for message in page_messages:
                if isinstance(message, dict):
                    messages.append(message)

            has_more = bool(data.get("has_more"))
            page_token = str(data.get("page_token") or "").strip()
            if not has_more or not page_token:
                break

        return messages

    def _run_json(self, args: list[str]) -> dict[str, Any]:
        result = self._runner.run(args)
        if result.returncode != 0:
            detail = result.stderr or result.stdout or "unknown error"
            raise RuntimeError(f"{' '.join(result.command)} failed: {detail}")
        if not isinstance(result.parsed_json, dict):
            raise RuntimeError(f"{' '.join(result.command)} did not return JSON")
        return result.parsed_json

    def _remember_message(self, message: dict[str, Any], chat_id: str, source: str) -> bool:
        message_id = str(message.get("message_id") or "").strip()
        if not message_id:
            return False
        return self._store.claim_incoming_message(message_id, chat_id=chat_id, source=source)

    def _build_group_event(self, chat: dict[str, str], message: dict[str, Any]) -> dict[str, Any] | None:
        sender = message.get("sender") if isinstance(message.get("sender"), dict) else {}
        sender_type = str(sender.get("sender_type") or "").strip()
        sender_name = str(sender.get("name") or "").strip()
        sender_id_value = str(sender.get("id") or "").strip()
        sender_id_type = str(sender.get("id_type") or "").strip().lower()

        sender_payload: dict[str, Any] = {"sender_type": sender_type, "name": sender_name, "sender_id": {}}
        if sender_id_value and sender_id_type in {"open_id", "user_id", "union_id"}:
            sender_payload["sender_id"][sender_id_type] = sender_id_value
            sender_payload[sender_id_type] = sender_id_value

        mentions = message.get("mentions") if isinstance(message.get("mentions"), list) else []
        return {
            "header": {"event_type": "im.message.receive_v1"},
            "event": {
                "sender": sender_payload,
                "message": {
                    "message_id": str(message.get("message_id") or "").strip(),
                    "chat_id": chat["chat_id"],
                    "chat_type": "group",
                    "chat_name": str(chat.get("chat_name") or "").strip(),
                    "message_type": str(message.get("msg_type") or "").strip(),
                    "content": {"text": str(message.get("content") or "")},
                    "mentions": mentions,
                },
            },
        }

    def _debug_log(self, message: str) -> None:
        if not self._debug_enabled:
            return
        print(f"[auto-reply] {message}", flush=True)


def load_lark_app_id(config_path: str | None = None) -> str | None:
    path = Path(config_path or "~/.lark-cli/config.json").expanduser()
    try:
        payload = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return None
    apps = payload.get("apps")
    if not isinstance(apps, list) or not apps:
        return None
    app_id = apps[0].get("appId")
    return str(app_id).strip() if app_id else None


def run() -> None:
    config = AppConfig.from_env()
    runner = CliRunner(config.lark_cli_bin, config.command_timeout_seconds)
    store = SessionStore(config.app_db_path)
    harness = build_harness(config, store=store, runner=runner)
    worker = AutoReplyWorker(
        store=store,
        harness=harness,
        reply_client=ReplyClient(runner),
        group_reply_mode=config.group_reply_mode,
        app_id=load_lark_app_id(),
        bot_mention_ids=config.bot_mention_ids,
        bot_mention_names=config.bot_mention_names,
        debug_enabled=config.auto_reply_debug,
    )

    subscriber = EventSubscriber(config=config, worker=worker)
    stop_event = threading.Event()
    threads: list[threading.Thread] = []

    subscribe_command = subscriber.build_command()
    print("Feishu Agent Auto Reply")
    print(f"服务地址: {config.feishu_agent_base_url}")
    print(f"调试日志: {'开启' if config.auto_reply_debug else '关闭'}")
    print(
        "订阅事件: "
        + (
            ", ".join(config.auto_reply_event_types)
            if config.auto_reply_event_types
            else "全部事件（调试模式）"
        )
    )
    print(f"监听命令: {' '.join(subscribe_command)}")
    print(
        "群消息轮询: "
        + (
            f"开启，间隔 {config.auto_reply_poll_interval_seconds}s，"
            f"回看 {config.auto_reply_poll_lookback_seconds}s，"
            f"群列表刷新 {config.auto_reply_poll_chat_refresh_seconds}s"
            if config.auto_reply_polling_enabled
            else "关闭"
        )
    )

    subscriber_thread = threading.Thread(
        target=subscriber.run_forever,
        kwargs={"stop_event": stop_event},
        name="feishu-event-subscriber",
        daemon=True,
    )
    subscriber_thread.start()
    threads.append(subscriber_thread)

    if config.auto_reply_polling_enabled:
        poller = GroupChatPoller(
            runner=runner,
            store=store,
            worker=worker,
            interval_seconds=config.auto_reply_poll_interval_seconds,
            lookback_seconds=config.auto_reply_poll_lookback_seconds,
            chat_refresh_seconds=config.auto_reply_poll_chat_refresh_seconds,
            debug_enabled=config.auto_reply_debug,
        )
        polling_thread = threading.Thread(
            target=poller.run_forever,
            kwargs={"stop_event": stop_event},
            name="feishu-group-poller",
            daemon=True,
        )
        polling_thread.start()
        threads.append(polling_thread)

    try:
        while any(thread.is_alive() for thread in threads):
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        stop_event.set()
        for thread in threads:
            thread.join(timeout=5)
