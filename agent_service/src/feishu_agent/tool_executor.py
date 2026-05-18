from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .cli_runner import CliRunner, CommandResult
from .errors import ToolExecutionError


SHANGHAI_TZ = timezone(timedelta(hours=8), name="UTC+08:00")


@dataclass
class ToolExecutionRecord:
    tool_name: str
    command: list[str]
    stdout: str
    stderr: str
    duration_ms: int
    ok: bool
    error_category: str | None = None


class ToolExecutor:
    def __init__(self, runner: CliRunner) -> None:
        self._runner = runner

    def execute(self, tool_name: str, args: dict[str, Any]) -> tuple[dict[str, Any], ToolExecutionRecord]:
        if tool_name == "search_user":
            primary = self._runner.run(
                [
                    "contact",
                    "+search-user",
                    "--query",
                    str(args["name"]),
                    "--as",
                    "user",
                    "--format",
                    "json",
                ]
            )
            if primary.returncode == 0:
                return self._finalize(tool_name, primary, self._normalize_search_user)
            if self._looks_like_user_authorization_failure(primary):
                fallback = self._search_users_with_bot_directory(str(args["name"]), primary)
                if fallback is not None:
                    return fallback
            return self._finalize(tool_name, primary, self._normalize_search_user)
        if tool_name == "send_dm":
            return self._execute_send_dm(args)
        if tool_name == "reply_message":
            return self._execute_reply_message(args)
        if tool_name == "list_agenda":
            date = str(args["date"])
            result = self._runner.run(
                [
                    "calendar",
                    "+agenda",
                    "--start",
                    date,
                    "--end",
                    date,
                    "--as",
                    "user",
                    "--format",
                    "json",
                ]
            )
            return self._finalize(tool_name, result, self._normalize_list_agenda)
        if tool_name == "create_doc":
            result = self._runner.run(
                [
                    "docs",
                    "+create",
                    "--title",
                    str(args["title"]),
                    "--markdown",
                    str(args["markdown"]),
                    "--as",
                    "user",
                ]
            )
            return self._finalize(tool_name, result, self._normalize_create_doc)
        if tool_name == "search_messages":
            result = self._runner.run(
                [
                    "im",
                    "+messages-search",
                    "--query",
                    str(args["query"]),
                    "--as",
                    "user",
                    "--format",
                    "json",
                ]
            )
            return self._finalize(tool_name, result, self._normalize_search_messages)
        if tool_name == "get_chat_messages":
            return self._execute_get_chat_messages(args)
        raise ToolExecutionError("parameter_error", f"unsupported tool: {tool_name}")

    def _execute_send_dm(self, args: dict[str, Any]) -> tuple[dict[str, Any], ToolExecutionRecord]:
        user_open_id = str(args.get("user_open_id") or "").strip()
        text = str(args.get("text") or "").strip()
        attachment_paths = [
            str(item or "").strip()
            for item in (args.get("attachment_paths") if isinstance(args.get("attachment_paths"), list) else [])
            if str(item or "").strip()
        ]
        if not user_open_id:
            raise ToolExecutionError("parameter_error", "user_open_id is required")
        if not text and not attachment_paths:
            raise ToolExecutionError("parameter_error", "text or attachment_paths is required")
        if attachment_paths:
            return self._execute_send_dm_with_attachments(
                user_open_id=user_open_id,
                text=text,
                attachment_paths=attachment_paths,
            )

        primary = self._runner.run(
            [
                "im",
                "+messages-send",
                "--user-id",
                user_open_id,
                "--text",
                text,
                "--as",
                "bot",
            ]
        )
        if primary.returncode == 0:
            return self._finalize("send_dm", primary, self._normalize_send_dm)

        if self._looks_like_user_identity_send_failure(primary):
            fallback = self._runner.run(
                [
                    "api",
                    "POST",
                    "/open-apis/im/v1/messages",
                    "--as",
                    "bot",
                    "--params",
                    json.dumps({"receive_id_type": "open_id"}, ensure_ascii=False),
                    "--data",
                    json.dumps(
                        {
                            "receive_id": user_open_id,
                            "msg_type": "text",
                            "content": json.dumps({"text": text}, ensure_ascii=False),
                        },
                        ensure_ascii=False,
                    ),
                ]
            )
            return self._finalize("send_dm", fallback, self._normalize_send_dm)

        return self._finalize("send_dm", primary, self._normalize_send_dm)

    def _execute_send_dm_with_attachments(
        self,
        *,
        user_open_id: str,
        text: str,
        attachment_paths: list[str],
    ) -> tuple[dict[str, Any], ToolExecutionRecord]:
        step_results: list[CommandResult] = []
        messages: list[dict[str, Any]] = []

        if text:
            result = self._runner.run(
                [
                    "im",
                    "+messages-send",
                    "--user-id",
                    user_open_id,
                    "--text",
                    text,
                    "--as",
                    "bot",
                ]
            )
            step_results.append(result)
            if result.returncode != 0:
                raise self._map_error(result.parsed_json, result)
            messages.append(self._normalize_send_dm(result.parsed_json if isinstance(result.parsed_json, dict) else result.stdout))

        for attachment_path in attachment_paths:
            path_obj = Path(attachment_path)
            if not path_obj.is_file():
                raise ToolExecutionError("parameter_error", f"attachment file not found: {attachment_path}")
            flag = "--image" if path_obj.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"} else "--file"
            cli_path = self._to_cli_relative_file_path(path_obj)
            result = self._runner.run(
                [
                    "im",
                    "+messages-send",
                    "--user-id",
                    user_open_id,
                    flag,
                    cli_path,
                    "--as",
                    "bot",
                ]
            )
            step_results.append(result)
            if result.returncode != 0:
                raise self._map_error(result.parsed_json, result)
            messages.append(self._normalize_send_dm(result.parsed_json if isinstance(result.parsed_json, dict) else result.stdout))

        last_message = messages[-1] if messages else {}
        payload = {
            **last_message,
            "messages": messages,
            "attachment_count": len(attachment_paths),
        }
        return payload, self._build_composite_record("send_dm", step_results, payload)

    @staticmethod
    def _to_cli_relative_file_path(path_obj: Path) -> str:
        resolved_path = path_obj.resolve()
        cwd = Path.cwd().resolve()
        try:
            relative = resolved_path.relative_to(cwd)
        except ValueError as exc:
            raise ToolExecutionError(
                "parameter_error",
                f"attachment file must be under the agent working directory for lark-cli upload: {resolved_path}",
            ) from exc
        text = relative.as_posix()
        return text if text.startswith(".") else f"./{text}"

    def _execute_reply_message(self, args: dict[str, Any]) -> tuple[dict[str, Any], ToolExecutionRecord]:
        message_id = str(args.get("message_id") or "").strip()
        text = str(args.get("text") or "").strip()
        if not message_id:
            raise ToolExecutionError("parameter_error", "message_id is required")
        if not text:
            raise ToolExecutionError("parameter_error", "text is required")

        primary = self._runner.run(
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
        if primary.returncode == 0:
            return self._finalize("reply_message", primary, self._normalize_send_dm)

        fallback = self._runner.run(
            [
                "api",
                "POST",
                f"/open-apis/im/v1/messages/{message_id}/reply",
                "--as",
                "bot",
                "--data",
                json.dumps(
                    {
                        "content": json.dumps({"text": text}, ensure_ascii=False),
                        "msg_type": "text",
                    },
                    ensure_ascii=False,
                ),
            ]
        )
        return self._finalize("reply_message", fallback, self._normalize_send_dm)

    def _execute_get_chat_messages(self, args: dict[str, Any]) -> tuple[dict[str, Any], ToolExecutionRecord]:
        chat_name = str(args.get("chat_name") or "").strip()
        if not chat_name:
            raise ToolExecutionError("parameter_error", "chat_name is required")

        date_text = str(args.get("date") or "").strip()
        if not date_text:
            raise ToolExecutionError("parameter_error", "date is required")
        start_time, end_time = self._resolve_daily_window(date_text)

        last_permission_error: ToolExecutionError | None = None
        for identity in ("user", "bot"):
            step_results: list[CommandResult] = []
            try:
                return self._execute_get_chat_messages_as_identity(
                    chat_name=chat_name,
                    date_text=date_text,
                    start_time=start_time,
                    end_time=end_time,
                    identity=identity,
                    step_results=step_results,
                )
            except ToolExecutionError as exc:
                if identity == "user" and self._should_retry_with_bot_identity(exc):
                    last_permission_error = exc
                    continue
                raise
        if last_permission_error is not None:
            raise last_permission_error
        raise ToolExecutionError("tool_error", "failed to get chat messages")

    def _execute_get_chat_messages_as_identity(
        self,
        *,
        chat_name: str,
        date_text: str,
        start_time: str,
        end_time: str,
        identity: str,
        step_results: list[CommandResult],
    ) -> tuple[dict[str, Any], ToolExecutionRecord]:
        chats = self._list_chats(step_results, identity=identity)
        matched_chat, candidates = self._match_chat_by_name(chats, chat_name)

        if matched_chat is None:
            payload = {
                "matched": False,
                "chat": None,
                "chat_name_query": chat_name,
                "date": date_text,
                "identity": identity,
                "start_time": start_time,
                "end_time": end_time,
                "messages": [],
                "total": 0,
                "candidates": candidates,
            }
            return payload, self._build_composite_record("get_chat_messages", step_results, payload)

        messages = self._list_chat_messages(
            matched_chat["chat_id"],
            start_time,
            end_time,
            step_results,
            identity=identity,
        )
        payload = {
            "matched": True,
            "chat": matched_chat,
            "chat_name_query": chat_name,
            "date": date_text,
            "identity": identity,
            "start_time": start_time,
            "end_time": end_time,
            "messages": messages,
            "total": len(messages),
            "candidates": [],
        }
        return payload, self._build_composite_record("get_chat_messages", step_results, payload)

    def _finalize(
        self,
        tool_name: str,
        result: CommandResult,
        parser,
    ) -> tuple[dict[str, Any], ToolExecutionRecord]:
        record = ToolExecutionRecord(
            tool_name=tool_name,
            command=result.command,
            stdout=result.stdout,
            stderr=result.stderr,
            duration_ms=result.duration_ms,
            ok=result.returncode == 0,
        )
        parsed = result.parsed_json
        if result.returncode != 0:
            error = self._map_error(parsed, result)
            record.error_category = error.category
            raise error
        payload = parser(parsed if isinstance(parsed, (dict, list)) else result.stdout)
        return payload, record

    def _run_json(self, args: list[str]) -> CommandResult:
        result = self._runner.run(args)
        if result.returncode != 0:
            raise self._map_error(result.parsed_json, result)
        if not isinstance(result.parsed_json, dict):
            raise ToolExecutionError(
                "tool_error",
                "tool did not return JSON",
                {
                    "command": result.command,
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                    "duration_ms": result.duration_ms,
                },
            )
        return result

    def _search_users_with_bot_directory(
        self,
        query: str,
        primary_result: CommandResult,
    ) -> tuple[dict[str, Any], ToolExecutionRecord] | None:
        normalized_query = " ".join(str(query or "").split()).strip().casefold()
        if not normalized_query:
            return None

        step_results = [primary_result]
        department_ids = ["0"]

        departments_result = self._runner.run(
            [
                "api",
                "GET",
                "/open-apis/contact/v3/departments/0/children",
                "--as",
                "bot",
                "--params",
                json.dumps(
                    {
                        "department_id_type": "open_department_id",
                        "fetch_child": True,
                        "page_size": 50,
                    },
                    ensure_ascii=False,
                ),
                "--format",
                "json",
            ]
        )
        step_results.append(departments_result)
        if departments_result.returncode == 0 and isinstance(departments_result.parsed_json, dict):
            data = self._unwrap_data(departments_result.parsed_json)
            for item in data.get("items") if isinstance(data.get("items"), list) else []:
                if not isinstance(item, dict):
                    continue
                department_id = str(item.get("open_department_id") or item.get("department_id") or "").strip()
                if department_id and department_id not in department_ids:
                    department_ids.append(department_id)
        elif not self._looks_like_contact_visibility_error(departments_result):
            return None

        matches: list[dict[str, Any]] = []
        seen_open_ids: set[str] = set()
        for department_id in department_ids[:100]:
            page_token = ""
            for _page_index in range(20):
                params: dict[str, Any] = {
                    "department_id": department_id,
                    "department_id_type": "open_department_id",
                    "user_id_type": "open_id",
                    "page_size": 50,
                }
                if page_token:
                    params["page_token"] = page_token
                users_result = self._runner.run(
                    [
                        "api",
                        "GET",
                        "/open-apis/contact/v3/users/find_by_department",
                        "--as",
                        "bot",
                        "--params",
                        json.dumps(params, ensure_ascii=False),
                        "--format",
                        "json",
                    ]
                )
                step_results.append(users_result)
                if users_result.returncode != 0:
                    if self._looks_like_contact_visibility_error(users_result):
                        break
                    return None
                if not isinstance(users_result.parsed_json, dict):
                    break
                data = self._unwrap_data(users_result.parsed_json)
                items = data.get("items") if isinstance(data.get("items"), list) else []
                for user in items:
                    if not isinstance(user, dict) or not self._user_matches_query(user, normalized_query):
                        continue
                    open_id = str(user.get("open_id") or "").strip()
                    if not open_id or open_id in seen_open_ids:
                        continue
                    seen_open_ids.add(open_id)
                    matches.append(
                        {
                            "name": user.get("name") or user.get("display_name") or user.get("en_name") or "",
                            "open_id": open_id,
                            "email": user.get("email") or user.get("enterprise_email") or "",
                            "mobile": user.get("mobile") or "",
                            "department": user.get("department_name") or "",
                            "enterprise_email": user.get("enterprise_email") or "",
                        }
                    )

                if not data.get("has_more") or not str(data.get("page_token") or "").strip():
                    break
                page_token = str(data.get("page_token") or "").strip()

        payload = {
            "matches": matches,
            "has_more": False,
            "page_token": "",
            "identity": "bot",
            "fallback": "contact_directory",
            "fallback_reason": "user authorization token is missing",
        }
        return payload, self._build_composite_record("search_user", step_results, payload)

    def _resolve_daily_window(self, date_text: str) -> tuple[str, str]:
        try:
            day = datetime.strptime(date_text, "%Y-%m-%d").date()
        except ValueError as exc:
            raise ToolExecutionError("parameter_error", "date must be in YYYY-MM-DD format") from exc
        start = datetime(day.year, day.month, day.day, tzinfo=SHANGHAI_TZ)
        end = start + timedelta(days=1)
        return start.isoformat(timespec="seconds"), end.isoformat(timespec="seconds")

    def _list_chats(self, step_results: list[CommandResult], *, identity: str) -> list[dict[str, Any]]:
        chats: list[dict[str, Any]] = []
        seen_chat_ids: set[str] = set()
        page_token = ""

        while True:
            params: dict[str, Any] = {"page_size": 100}
            if page_token:
                params["page_token"] = page_token
            result = self._run_json(
                [
                    "im",
                    "chats",
                    "list",
                    "--as",
                    identity,
                    "--params",
                    json.dumps(params, ensure_ascii=False),
                ]
            )
            step_results.append(result)
            payload = self._unwrap_data(result.parsed_json)
            items = payload.get("items") if isinstance(payload.get("items"), list) else []
            for item in items:
                if not isinstance(item, dict):
                    continue
                chat_id = str(item.get("chat_id") or "").strip()
                chat_name = str(item.get("name") or "").strip()
                if not chat_id or not chat_name or chat_id in seen_chat_ids:
                    continue
                seen_chat_ids.add(chat_id)
                chats.append(
                    {
                        "chat_id": chat_id,
                        "chat_name": chat_name,
                        "chat_status": str(item.get("chat_status") or "").strip(),
                        "tenant_key": str(item.get("tenant_key") or "").strip(),
                    }
                )

            has_more = bool(payload.get("has_more"))
            page_token = str(payload.get("page_token") or "").strip()
            if not has_more or not page_token:
                break

        return chats

    def _match_chat_by_name(
        self,
        chats: list[dict[str, Any]],
        chat_name: str,
    ) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
        normalized_query = chat_name.casefold()
        exact = [chat for chat in chats if str(chat.get("chat_name") or "").casefold() == normalized_query]
        if len(exact) == 1:
            return exact[0], []
        if len(exact) > 1:
            return None, exact

        partial = [
            chat
            for chat in chats
            if normalized_query in str(chat.get("chat_name") or "").casefold()
            or str(chat.get("chat_name") or "").casefold() in normalized_query
        ]
        if len(partial) == 1:
            return partial[0], []
        if len(partial) > 1:
            return None, partial
        return None, []

    def _list_chat_messages(
        self,
        chat_id: str,
        start_time: str,
        end_time: str,
        step_results: list[CommandResult],
        *,
        identity: str,
    ) -> list[dict[str, Any]]:
        messages: list[dict[str, Any]] = []
        page_token = ""

        while True:
            args = [
                "im",
                "+chat-messages-list",
                "--as",
                identity,
                "--chat-id",
                chat_id,
                "--sort",
                "asc",
                "--page-size",
                "100",
                "--start",
                start_time,
                "--end",
                end_time,
            ]
            if page_token:
                args.extend(["--page-token", page_token])
            result = self._run_json(args)
            step_results.append(result)
            payload = self._unwrap_data(result.parsed_json)
            page_messages = payload.get("messages") if isinstance(payload.get("messages"), list) else []
            for item in page_messages:
                if not isinstance(item, dict):
                    continue
                sender = item.get("sender") if isinstance(item.get("sender"), dict) else {}
                sender_id_type = str(sender.get("id_type") or "").strip().lower()
                messages.append(
                    {
                        "message_id": str(item.get("message_id") or "").strip(),
                        "create_time": str(item.get("create_time") or "").strip(),
                        "msg_type": str(item.get("msg_type") or "").strip(),
                        "content": str(item.get("content") or "").strip(),
                        "deleted": bool(item.get("deleted")),
                        "updated": bool(item.get("updated")),
                        "reply_to": str(item.get("reply_to") or "").strip(),
                        "sender_name": str(sender.get("name") or "").strip(),
                        "sender_open_id": str(sender.get("id") or "").strip() if sender_id_type == "open_id" else "",
                        "mentions": item.get("mentions") if isinstance(item.get("mentions"), list) else [],
                    }
                )

            has_more = bool(payload.get("has_more"))
            page_token = str(payload.get("page_token") or "").strip()
            if not has_more or not page_token:
                break

        return messages

    def _should_retry_with_bot_identity(self, exc: ToolExecutionError) -> bool:
        if exc.category != "permission_denied":
            return False
        detail_text = json.dumps(exc.detail or {}, ensure_ascii=False).lower()
        message = exc.message.lower()
        return "need_user_authorization" in message or "need_user_authorization" in detail_text

    def _looks_like_user_authorization_failure(self, result: CommandResult) -> bool:
        parsed = result.parsed_json if isinstance(result.parsed_json, dict) else {}
        error = parsed.get("error") if isinstance(parsed.get("error"), dict) else {}
        identity = str(parsed.get("identity") or "").strip().lower()
        message = str(error.get("message") or "").strip().lower()
        detail = f"{result.stdout}\n{result.stderr}".lower()
        return identity == "user" and ("need_user_authorization" in message or "need_user_authorization" in detail)

    def _looks_like_contact_visibility_error(self, result: CommandResult) -> bool:
        detail = f"{result.stdout}\n{result.stderr}".lower()
        return any(token in detail for token in ("department not found", "no permission", "permission", "scope"))

    def _user_matches_query(self, user: dict[str, Any], normalized_query: str) -> bool:
        candidates = [
            user.get("name"),
            user.get("display_name"),
            user.get("en_name"),
            user.get("email"),
            user.get("enterprise_email"),
        ]
        for candidate in candidates:
            value = " ".join(str(candidate or "").split()).strip().casefold()
            if value and (normalized_query == value or normalized_query in value or value in normalized_query):
                return True
        return False

    def _build_composite_record(
        self,
        tool_name: str,
        step_results: list[CommandResult],
        payload: dict[str, Any],
    ) -> ToolExecutionRecord:
        command: list[str] = []
        for index, result in enumerate(step_results):
            if index:
                command.append("->")
            command.extend(result.command)
        stderr_text = "\n".join(result.stderr for result in step_results if result.stderr)
        return ToolExecutionRecord(
            tool_name=tool_name,
            command=command,
            stdout=json.dumps(payload, ensure_ascii=False),
            stderr=stderr_text,
            duration_ms=sum(result.duration_ms for result in step_results),
            ok=True,
        )

    def _unwrap_data(self, payload: dict[str, Any]) -> dict[str, Any]:
        nested = payload.get("data")
        if isinstance(nested, dict):
            return nested
        return payload

    def _map_error(self, parsed: dict | list | None, result: CommandResult) -> ToolExecutionError:
        if isinstance(parsed, dict) and "error" in parsed:
            err = parsed.get("error") or {}
            message = str(err.get("message") or "tool execution failed")
            error_type = str(err.get("type") or "api_error")
            code = err.get("code")
            detail = {
                "type": error_type,
                "code": code,
                "hint": err.get("hint"),
                "console_url": err.get("console_url"),
                "identity": parsed.get("identity"),
                "command": result.command,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "duration_ms": result.duration_ms,
            }
            lowered = message.lower()
            if error_type in {"validation"}:
                return ToolExecutionError("parameter_error", message, detail)
            if error_type in {"missing_scope", "permission"} or "scope" in lowered:
                return ToolExecutionError("permission_denied", message, detail)
            if "availability" in lowered or str(code) == "230013":
                return ToolExecutionError("bot_availability", message, detail)
            if "not unique" in lowered or "multiple" in lowered:
                return ToolExecutionError("ambiguous_target", message, detail)
            if "need_user_authorization" in lowered:
                return ToolExecutionError("permission_denied", message, detail)
            return ToolExecutionError("tool_error", message, detail)
        if result.returncode != 0:
            return ToolExecutionError(
                "tool_error",
                result.stderr or result.stdout or "tool execution failed",
                {
                    "returncode": result.returncode,
                    "command": result.command,
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                    "duration_ms": result.duration_ms,
                },
            )
        return ToolExecutionError("tool_error", "tool execution failed")

    def _looks_like_user_identity_send_failure(self, result: CommandResult) -> bool:
        parsed = result.parsed_json if isinstance(result.parsed_json, dict) else {}
        error = parsed.get("error") if isinstance(parsed.get("error"), dict) else {}
        message = str(error.get("message") or "").strip().lower()
        identity = str(parsed.get("identity") or "").strip().lower()
        detail = f"{result.stdout}\n{result.stderr}".lower()
        return (
            "im:message.send_as_user" in message
            or "im:message.send_as_user" in detail
            or (identity == "user" and "missing_scope" in detail)
        )

    def _normalize_search_user(self, parsed: dict | str) -> dict[str, Any]:
        raw = parsed if isinstance(parsed, dict) else {}
        data = raw.get("data") if isinstance(raw.get("data"), dict) else raw
        users = data.get("users") or []
        matches = []
        for user in users:
            matches.append(
                {
                    "name": user.get("name") or user.get("display_name") or user.get("user_name"),
                    "open_id": user.get("open_id"),
                    "email": user.get("email") or user.get("mail"),
                    "mobile": user.get("mobile") or user.get("phone"),
                    "department": user.get("department_name") or user.get("department"),
                    "enterprise_email": user.get("enterprise_email"),
                }
            )
        return {
            "matches": matches,
            "has_more": bool(data.get("has_more")),
            "page_token": data.get("page_token") or "",
        }

    def _normalize_send_dm(self, parsed: dict | str) -> dict[str, Any]:
        data = parsed if isinstance(parsed, dict) else {}
        payload = data.get("data") or data
        return {
            "message_id": payload.get("message_id"),
            "chat_id": payload.get("chat_id"),
            "create_time": payload.get("create_time"),
        }

    def _normalize_list_agenda(self, parsed: dict | list | str) -> dict[str, Any]:
        if isinstance(parsed, dict):
            raw_items = parsed.get("data")
            items = raw_items if isinstance(raw_items, list) else []
        else:
            items = parsed if isinstance(parsed, list) else []
        events = []
        for item in items:
            events.append(
                {
                    "event_id": item.get("event_id"),
                    "summary": item.get("summary") or "(untitled)",
                    "start_time": item.get("start_time"),
                    "end_time": item.get("end_time"),
                    "free_busy_status": item.get("free_busy_status"),
                    "self_rsvp_status": item.get("self_rsvp_status"),
                }
            )
        return {"events": events, "total": len(events)}

    def _normalize_create_doc(self, parsed: dict | str) -> dict[str, Any]:
        raw = parsed if isinstance(parsed, dict) else {"raw": parsed}
        data = raw.get("data") if isinstance(raw.get("data"), dict) else raw
        return {"document": data}

    def _normalize_search_messages(self, parsed: dict | str) -> dict[str, Any]:
        raw = parsed if isinstance(parsed, dict) else {}
        data = raw.get("data") if isinstance(raw.get("data"), dict) else raw
        return {
            "messages": data.get("messages") or [],
            "total": data.get("total") or 0,
            "has_more": bool(data.get("has_more")),
            "page_token": data.get("page_token") or "",
        }


def summarize_pending_action(tool_name: str, args: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    if tool_name == "create_workspace":
        kind = str(args.get("kind") or "").strip().lower()
        kind_label = "试卷" if kind == "exam" else "教材"
        return (
            f"待确认：创建一个{kind_label}工作区。",
            {
                "name": str(args.get("name") or "").strip(),
                "kind": kind,
            },
        )
    if tool_name == "send_dm":
        return (
            "待确认：向指定飞书用户发送私聊消息。",
            {
                "user_open_id": args["user_open_id"],
                "text": str(args.get("text") or ""),
                "attachment_ids": args.get("attachment_ids") or [],
                "send_as": "bot",
            },
        )
    if tool_name == "reply_message":
        return (
            "待确认：回复指定飞书消息。",
            {
                "message_id": str(args.get("message_id") or "").strip(),
                "text": str(args.get("text") or ""),
                "send_as": "bot",
            },
        )
    if tool_name == "create_doc":
        return (
            "待确认：创建一篇新的飞书文档。",
            {
                "title": args["title"],
                "markdown_preview": str(args["markdown"])[:120],
                "send_as": "user",
            },
        )
    if tool_name == "start_textbook_extraction_job":
        return (
            "待确认：启动教材题库提取后台任务。",
            {
                "attachment_ids": args.get("attachment_ids") or [],
                "courseId": str(args.get("courseId") or "").strip(),
                "textbookId": str(args.get("textbookId") or "").strip(),
                "title": str(args.get("title") or "").strip(),
                "startChapter": str(args.get("startChapter") or "").strip(),
                "startSection": str(args.get("startSection") or "").strip(),
                "hasAnswer": bool(args.get("hasAnswer")) if isinstance(args.get("hasAnswer"), bool) else False,
                "importToDb": args.get("importToDb") is not False,
            },
        )
    if tool_name == "cancel_textbook_extraction_job":
        return (
            "待确认：取消教材题库提取后台任务。",
            {
                "taskId": str(args.get("taskId") or "latest").strip() or "latest",
            },
        )
    return (
        f"待确认：执行 {tool_name}",
        args,
    )
