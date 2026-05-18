from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any


class SessionStore:
    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        self._lock = threading.Lock()
        self._init_db()

    @contextmanager
    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    metadata_json TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(session_id) REFERENCES sessions(session_id)
                );

                CREATE TABLE IF NOT EXISTS pending_actions (
                    action_id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    tool_name TEXT NOT NULL,
                    args_json TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    args_preview_json TEXT NOT NULL,
                    status TEXT NOT NULL,
                    result_json TEXT,
                    error_json TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(session_id) REFERENCES sessions(session_id)
                );

                CREATE TABLE IF NOT EXISTS tool_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT,
                    action_id TEXT,
                    tool_name TEXT NOT NULL,
                    command_json TEXT NOT NULL,
                    stdout_text TEXT,
                    stderr_text TEXT,
                    ok INTEGER NOT NULL,
                    error_category TEXT,
                    duration_ms INTEGER NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS incoming_messages (
                    message_id TEXT PRIMARY KEY,
                    chat_id TEXT,
                    source TEXT,
                    claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS attachments (
                    attachment_id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    original_name TEXT NOT NULL,
                    content_type TEXT,
                    size_bytes INTEGER NOT NULL,
                    file_path TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(session_id) REFERENCES sessions(session_id)
                );

                CREATE TABLE IF NOT EXISTS textbook_pipeline_jobs (
                    job_id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    phase TEXT,
                    args_json TEXT NOT NULL,
                    attachment_ids_json TEXT NOT NULL,
                    workspace_id TEXT,
                    json_asset_id TEXT,
                    json_file_path TEXT,
                    image_batch_asset_id TEXT,
                    chapter_session_id TEXT,
                    total_pages INTEGER NOT NULL DEFAULT 0,
                    success_count INTEGER NOT NULL DEFAULT 0,
                    failed_count INTEGER NOT NULL DEFAULT 0,
                    current_page INTEGER NOT NULL DEFAULT 0,
                    current_file_name TEXT,
                    current_chapter_title TEXT,
                    current_section_title TEXT,
                    db_import_json TEXT,
                    result_json TEXT,
                    error_summary TEXT,
                    cancel_requested INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    started_at TEXT,
                    finished_at TEXT,
                    FOREIGN KEY(session_id) REFERENCES sessions(session_id)
                );
                """
            )

    def ensure_session(self, session_id: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO sessions(session_id) VALUES (?)",
                (session_id,),
            )

    def append_message(
        self,
        session_id: str,
        role: str,
        content: str,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        self.ensure_session(session_id)
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO messages(session_id, role, content, metadata_json)
                VALUES (?, ?, ?, ?)
                """,
                (session_id, role, content, json.dumps(metadata or {}, ensure_ascii=False)),
            )

    def create_attachment(
        self,
        *,
        attachment_id: str,
        session_id: str,
        original_name: str,
        content_type: str,
        size_bytes: int,
        file_path: str,
    ) -> dict[str, Any]:
        self.ensure_session(session_id)
        payload = {
            "attachment_id": attachment_id,
            "session_id": session_id,
            "original_name": original_name,
            "content_type": content_type,
            "size_bytes": int(size_bytes),
            "file_path": file_path,
        }
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO attachments(
                    attachment_id, session_id, original_name, content_type, size_bytes, file_path
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    attachment_id,
                    session_id,
                    original_name,
                    content_type,
                    int(size_bytes),
                    file_path,
                ),
            )
        return payload

    def get_attachments(self, attachment_ids: list[str]) -> list[dict[str, Any]]:
        normalized_ids = [str(item or "").strip() for item in attachment_ids if str(item or "").strip()]
        if not normalized_ids:
            return []
        placeholders = ",".join("?" for _ in normalized_ids)
        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT attachment_id, session_id, original_name, content_type, size_bytes, file_path, created_at
                FROM attachments
                WHERE attachment_id IN ({placeholders})
                """,
                tuple(normalized_ids),
            ).fetchall()
        by_id = {str(row["attachment_id"]): self._attachment_row_to_dict(row) for row in rows}
        return [by_id[item] for item in normalized_ids if item in by_id]

    def list_session_attachments(self, session_id: str, limit: int = 20) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT attachment_id, session_id, original_name, content_type, size_bytes, file_path, created_at
                FROM attachments
                WHERE session_id = ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (session_id, max(1, int(limit))),
            ).fetchall()
        return [self._attachment_row_to_dict(row) for row in rows]

    def get_messages(self, session_id: str, limit: int) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT role, content, metadata_json, created_at
                FROM messages
                WHERE session_id = ?
                ORDER BY id DESC
                LIMIT ?
                """,
                (session_id, limit),
            ).fetchall()
        messages = []
        for row in reversed(rows):
            messages.append(
                {
                    "role": row["role"],
                    "content": row["content"],
                    "metadata": json.loads(row["metadata_json"] or "{}"),
                    "created_at": row["created_at"],
                }
            )
        return messages

    def list_sessions(self, limit: int = 100) -> list[dict[str, Any]]:
        with self._connect() as conn:
            session_rows = conn.execute(
                """
                SELECT session_id, created_at
                FROM sessions
                ORDER BY created_at DESC
                """
            ).fetchall()
            pending_session_ids = {
                str(row["session_id"])
                for row in conn.execute(
                    """
                    SELECT DISTINCT session_id
                    FROM pending_actions
                    WHERE status = 'pending'
                    """
                ).fetchall()
            }

            summaries: list[dict[str, Any]] = []
            for session_row in session_rows:
                message_rows = conn.execute(
                    """
                    SELECT role, content, metadata_json, created_at
                    FROM messages
                    WHERE session_id = ?
                    ORDER BY id ASC
                    """,
                    (session_row["session_id"],),
                ).fetchall()
                messages = self._deserialize_messages(message_rows)
                if not messages:
                    continue

                title_source = next(
                    (message["content"] for message in messages if message["role"] == "user" and message["content"]),
                    messages[0]["content"],
                )
                last_message = messages[-1]
                session_meta = self._build_session_meta(str(session_row["session_id"]), messages)
                summaries.append(
                    {
                        "session_id": str(session_row["session_id"]),
                        "title": self._compact_text(title_source, fallback=str(session_row["session_id"]), max_length=48),
                        "preview": self._compact_text(last_message["content"], fallback="", max_length=96),
                        "message_count": len(messages),
                        "created_at": str(session_row["created_at"]),
                        "updated_at": str(last_message["created_at"] or session_row["created_at"]),
                        "has_pending_action": str(session_row["session_id"]) in pending_session_ids,
                        **session_meta,
                    }
                )

        summaries.sort(key=lambda item: (item["updated_at"], item["created_at"]), reverse=True)
        return summaries[: max(1, limit)]

    def get_session_detail(self, session_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            session_row = conn.execute(
                """
                SELECT session_id, created_at
                FROM sessions
                WHERE session_id = ?
                """,
                (session_id,),
            ).fetchone()
            if session_row is None:
                return None

            message_rows = conn.execute(
                """
                SELECT role, content, metadata_json, created_at
                FROM messages
                WHERE session_id = ?
                ORDER BY id ASC
                """,
                (session_id,),
            ).fetchall()

        messages = self._deserialize_messages(message_rows)
        title_source = next(
            (message["content"] for message in messages if message["role"] == "user" and message["content"]),
            messages[0]["content"] if messages else session_id,
        )
        updated_at = messages[-1]["created_at"] if messages else str(session_row["created_at"])
        session_meta = self._build_session_meta(session_id, messages)
        return {
            "session_id": str(session_row["session_id"]),
            "title": self._compact_text(title_source, fallback=session_id, max_length=48),
            "created_at": str(session_row["created_at"]),
            "updated_at": str(updated_at),
            **session_meta,
            "messages": messages,
        }

    def delete_session(self, session_id: str) -> bool:
        with self._lock, self._connect() as conn:
            exists = conn.execute(
                "SELECT 1 FROM sessions WHERE session_id = ?",
                (session_id,),
            ).fetchone()
            if exists is None:
                return False

            conn.execute("DELETE FROM tool_logs WHERE session_id = ?", (session_id,))
            conn.execute("DELETE FROM pending_actions WHERE session_id = ?", (session_id,))
            conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
            conn.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))
            return True

    def create_pending_action(
        self,
        session_id: str,
        tool_name: str,
        args: dict[str, Any],
        summary: str,
        args_preview: dict[str, Any],
    ) -> dict[str, Any]:
        action_id = str(uuid.uuid4())
        payload = {
            "action_id": action_id,
            "session_id": session_id,
            "tool_name": tool_name,
            "summary": summary,
            "args": args,
            "args_preview": args_preview,
            "status": "pending",
        }
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO pending_actions(
                    action_id, session_id, tool_name, args_json, summary, args_preview_json, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    action_id,
                    session_id,
                    tool_name,
                    json.dumps(args, ensure_ascii=False),
                    summary,
                    json.dumps(args_preview, ensure_ascii=False),
                    "pending",
                ),
            )
        return payload

    def _attachment_row_to_dict(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "attachment_id": str(row["attachment_id"]),
            "session_id": str(row["session_id"]),
            "original_name": str(row["original_name"]),
            "content_type": str(row["content_type"] or ""),
            "size_bytes": int(row["size_bytes"] or 0),
            "file_path": str(row["file_path"]),
            "created_at": str(row["created_at"]),
        }

    def _textbook_job_row_to_dict(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "job_id": str(row["job_id"]),
            "session_id": str(row["session_id"]),
            "status": str(row["status"]),
            "phase": str(row["phase"] or ""),
            "args": json.loads(row["args_json"] or "{}"),
            "attachment_ids": json.loads(row["attachment_ids_json"] or "[]"),
            "workspace_id": str(row["workspace_id"] or ""),
            "json_asset_id": str(row["json_asset_id"] or ""),
            "json_file_path": str(row["json_file_path"] or ""),
            "image_batch_asset_id": str(row["image_batch_asset_id"] or ""),
            "chapter_session_id": str(row["chapter_session_id"] or ""),
            "total_pages": int(row["total_pages"] or 0),
            "success_count": int(row["success_count"] or 0),
            "failed_count": int(row["failed_count"] or 0),
            "current_page": int(row["current_page"] or 0),
            "current_file_name": str(row["current_file_name"] or ""),
            "current_chapter_title": str(row["current_chapter_title"] or ""),
            "current_section_title": str(row["current_section_title"] or ""),
            "db_import": json.loads(row["db_import_json"]) if row["db_import_json"] else None,
            "result": json.loads(row["result_json"]) if row["result_json"] else None,
            "error_summary": str(row["error_summary"] or ""),
            "cancel_requested": bool(row["cancel_requested"]),
            "created_at": str(row["created_at"]),
            "updated_at": str(row["updated_at"]),
            "started_at": str(row["started_at"] or ""),
            "finished_at": str(row["finished_at"] or ""),
        }

    def _deserialize_messages(self, rows: list[sqlite3.Row]) -> list[dict[str, Any]]:
        messages: list[dict[str, Any]] = []
        for row in rows:
            messages.append(
                {
                    "role": str(row["role"]),
                    "content": str(row["content"]),
                    "metadata": json.loads(row["metadata_json"] or "{}"),
                    "created_at": str(row["created_at"]),
                }
            )
        return messages

    def _compact_text(self, value: str, *, fallback: str, max_length: int) -> str:
        normalized = " ".join(str(value or "").split()).strip()
        if not normalized:
            return fallback
        if len(normalized) <= max_length:
            return normalized
        return f"{normalized[:max_length].rstrip()}..."

    def _build_session_meta(self, session_id: str, messages: list[dict[str, Any]]) -> dict[str, str]:
        origin = self._infer_session_origin(session_id, messages)
        participant_label = ""
        participant_id = ""

        if origin == "feishu":
            for message in messages:
                metadata = message.get("metadata") if isinstance(message.get("metadata"), dict) else {}
                if not participant_label:
                    participant_label = (
                        str(metadata.get("feishu_sender_name") or "").strip()
                        or str(metadata.get("feishu_sender_label") or "").strip()
                    )
                if not participant_id:
                    participant_id = (
                        str(metadata.get("feishu_sender_open_id") or "").strip()
                        or str(metadata.get("feishu_sender_user_id") or "").strip()
                        or str(metadata.get("feishu_sender_union_id") or "").strip()
                    )
                if participant_label and participant_id:
                    break

            if not participant_label and participant_id:
                participant_label = "飞书用户"
            if not participant_label and not participant_id:
                participant_label = "未知飞书用户"

        return {
            "origin": origin,
            "origin_label": self._origin_label(origin),
            "participant_label": participant_label,
            "participant_id": participant_id,
        }

    def _infer_session_origin(self, session_id: str, messages: list[dict[str, Any]]) -> str:
        normalized_session_id = str(session_id or "").strip()
        if normalized_session_id.startswith("im-chat:"):
            return "feishu"
        if normalized_session_id.startswith("agent_"):
            return "web"
        if normalized_session_id.startswith("shell-"):
            return "shell"

        for message in messages:
            metadata = message.get("metadata") if isinstance(message.get("metadata"), dict) else {}
            source = str(metadata.get("source") or "").strip().lower()
            if source == "feishu_event":
                return "feishu"
            if source == "http":
                return "web"
            if source == "shell":
                return "shell"

        return "unknown"

    def _origin_label(self, origin: str) -> str:
        if origin == "feishu":
            return "飞书"
        if origin == "web":
            return "Web"
        if origin == "shell":
            return "Shell"
        return "其他"

    def get_pending_action(self, action_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT action_id, session_id, tool_name, args_json, summary,
                       args_preview_json, status, result_json, error_json,
                       created_at, updated_at
                FROM pending_actions
                WHERE action_id = ?
                """,
                (action_id,),
            ).fetchone()
        if row is None:
            return None
        return {
            "action_id": row["action_id"],
            "session_id": row["session_id"],
            "tool_name": row["tool_name"],
            "args": json.loads(row["args_json"]),
            "summary": row["summary"],
            "args_preview": json.loads(row["args_preview_json"]),
            "status": row["status"],
            "result": json.loads(row["result_json"]) if row["result_json"] else None,
            "error": json.loads(row["error_json"]) if row["error_json"] else None,
        }

    def get_latest_pending_action_for_session(self, session_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT action_id
                FROM pending_actions
                WHERE session_id = ? AND status = 'pending'
                ORDER BY rowid DESC
                LIMIT 1
                """,
                (session_id,),
            ).fetchone()
        if row is None:
            return None
        return self.get_pending_action(str(row["action_id"]))

    def update_pending_action(
        self,
        action_id: str,
        status: str,
        result: dict[str, Any] | None = None,
        error: dict[str, Any] | None = None,
    ) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                UPDATE pending_actions
                SET status = ?, result_json = ?, error_json = ?, updated_at = CURRENT_TIMESTAMP
                WHERE action_id = ?
                """,
                (
                    status,
                    json.dumps(result, ensure_ascii=False) if result is not None else None,
                    json.dumps(error, ensure_ascii=False) if error is not None else None,
                    action_id,
                ),
            )

    def create_textbook_pipeline_job(
        self,
        *,
        session_id: str,
        args: dict[str, Any],
        attachment_ids: list[str],
    ) -> dict[str, Any]:
        self.ensure_session(session_id)
        job_id = f"tbp_{uuid.uuid4().hex}"
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO textbook_pipeline_jobs(
                    job_id, session_id, status, phase, args_json, attachment_ids_json
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    job_id,
                    session_id,
                    "pending",
                    "queued",
                    json.dumps(args, ensure_ascii=False),
                    json.dumps(attachment_ids, ensure_ascii=False),
                ),
            )
        job = self.get_textbook_pipeline_job(job_id)
        if job is None:
            raise RuntimeError(f"failed to create textbook pipeline job: {job_id}")
        return job

    def get_textbook_pipeline_job(self, job_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT *
                FROM textbook_pipeline_jobs
                WHERE job_id = ?
                """,
                (str(job_id or "").strip(),),
            ).fetchone()
        return self._textbook_job_row_to_dict(row) if row else None

    def get_latest_textbook_pipeline_job_for_session(self, session_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT *
                FROM textbook_pipeline_jobs
                WHERE session_id = ?
                ORDER BY rowid DESC
                LIMIT 1
                """,
                (session_id,),
            ).fetchone()
        return self._textbook_job_row_to_dict(row) if row else None

    def update_textbook_pipeline_job(self, job_id: str, **fields: Any) -> None:
        allowed = {
            "status",
            "phase",
            "workspace_id",
            "json_asset_id",
            "json_file_path",
            "image_batch_asset_id",
            "chapter_session_id",
            "total_pages",
            "success_count",
            "failed_count",
            "current_page",
            "current_file_name",
            "current_chapter_title",
            "current_section_title",
            "db_import",
            "result",
            "error_summary",
            "cancel_requested",
            "started_at",
            "finished_at",
        }
        normalized: dict[str, Any] = {key: value for key, value in fields.items() if key in allowed}
        if not normalized:
            return

        column_names = {
            "db_import": "db_import_json",
            "result": "result_json",
        }
        assignments = []
        values: list[Any] = []
        for key, value in normalized.items():
            column = column_names.get(key, key)
            assignments.append(f"{column} = ?")
            if key in {"db_import", "result"}:
                values.append(json.dumps(value, ensure_ascii=False) if value is not None else None)
            elif key == "cancel_requested":
                values.append(1 if value else 0)
            else:
                values.append(value)

        assignments.append("updated_at = CURRENT_TIMESTAMP")
        values.append(str(job_id or "").strip())
        with self._lock, self._connect() as conn:
            conn.execute(
                f"""
                UPDATE textbook_pipeline_jobs
                SET {", ".join(assignments)}
                WHERE job_id = ?
                """,
                tuple(values),
            )

    def request_textbook_pipeline_cancel(self, job_id: str) -> dict[str, Any] | None:
        self.update_textbook_pipeline_job(job_id, cancel_requested=True)
        return self.get_textbook_pipeline_job(job_id)

    def is_textbook_pipeline_cancel_requested(self, job_id: str) -> bool:
        job = self.get_textbook_pipeline_job(job_id)
        return bool(job and job.get("cancel_requested"))

    def log_tool_call(
        self,
        *,
        session_id: str | None,
        action_id: str | None,
        tool_name: str,
        command: list[str],
        stdout_text: str,
        stderr_text: str,
        ok: bool,
        error_category: str | None,
        duration_ms: int,
    ) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO tool_logs(
                    session_id, action_id, tool_name, command_json,
                    stdout_text, stderr_text, ok, error_category, duration_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id,
                    action_id,
                    tool_name,
                    json.dumps(command, ensure_ascii=False),
                    stdout_text,
                    stderr_text,
                    1 if ok else 0,
                    error_category,
                    duration_ms,
                ),
            )

    def claim_incoming_message(
        self,
        message_id: str,
        *,
        chat_id: str = "",
        source: str = "",
    ) -> bool:
        normalized_message_id = str(message_id or "").strip()
        if not normalized_message_id:
            return False

        with self._lock, self._connect() as conn:
            try:
                conn.execute(
                    """
                    INSERT INTO incoming_messages(message_id, chat_id, source)
                    VALUES (?, ?, ?)
                    """,
                    (
                        normalized_message_id,
                        str(chat_id or "").strip(),
                        str(source or "").strip(),
                    ),
                )
            except sqlite3.IntegrityError:
                return False
        return True
