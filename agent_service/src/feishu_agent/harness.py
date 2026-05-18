from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass
from pathlib import Path

from .ark_client import ArkClient
from .cli_runner import CliRunner
from .config import AppConfig
from .errors import PendingActionError, ToolExecutionError
from .persona import resolve_persona_prompt
from .prompting import build_policy_prompt, build_prompt
from .schemas import ChatResponse, ConfirmActionResponse, HealthResponse, PendingActionView, TraceEvent
from .skills import load_skills
from .skills.base import Skill, SkillContext, ToolSpec
from .store import SessionStore
from .tool_executor import ToolExecutor, summarize_pending_action
from .tool_registry import index_tools, responses_tools


SUPPORTED_CHAT_ATTACHMENT_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp"}


@dataclass(frozen=True)
class AgentIdentity:
    persona: str
    model: str
    skills: tuple[str, ...]


class AgentHarness:
    def __init__(
        self,
        *,
        config: AppConfig,
        store: SessionStore,
        ark_client: ArkClient,
        tool_executor: ToolExecutor,
        skills: list[Skill] | None = None,
    ) -> None:
        self._config = config
        self._store = store
        self._ark_client = ark_client
        self._tool_executor = tool_executor
        self._skills = skills or load_skills(config.enabled_skills, tool_executor, config)
        self._tools_by_name: dict[str, ToolSpec] = {}
        self._skills_by_tool: dict[str, Skill] = {}
        self._persona_prompt = resolve_persona_prompt(config.agent_persona)
        self._policy_prompt = build_policy_prompt()
        self._refresh_tool_registry()

    def handle_message(
        self,
        session_id: str,
        message: str,
        source: str = "api",
        *,
        message_metadata: dict | None = None,
        ark_api_key_override: str | None = None,
    ) -> ChatResponse:
        self._refresh_tool_registry()
        self._store.ensure_session(session_id)
        history = self._store.get_messages(session_id, self._config.max_history_messages)
        user_metadata = {"source": source}
        if isinstance(message_metadata, dict):
            user_metadata.update(message_metadata)
        self._store.append_message(session_id, "user", message, metadata=user_metadata)
        history = history + [{"role": "user", "content": message, "metadata": user_metadata}]
        tool_events: list[dict] = []
        trace: list[TraceEvent] = []
        next_step = 1

        for _ in range(self._config.max_tool_round_trips):
            prompt = build_prompt(
                persona_prompt=self._persona_prompt,
                policy_prompt=self._policy_prompt,
                skill_guidance=[skill.get_guidance() for skill in self._skills if skill.get_guidance()],
                history=history[:-1],
                latest_user_message=message,
                latest_user_metadata=user_metadata,
                tool_events=tool_events,
                source=source,
            )
            model_response = self._ark_client.create_response(
                prompt,
                responses_tools(self._tools_by_name.values()),
                api_key_override=ark_api_key_override,
            )

            if model_response.function_calls:
                for call in model_response.function_calls:
                    tool = self._tools_by_name.get(call.name)
                    skill = self._skills_by_tool.get(call.name)
                    if tool is None:
                        self._append_trace(
                            trace,
                            step=next_step,
                            kind="tool_call",
                            status="error",
                            summary=f"模型请求了未注册工具：{call.name}",
                            tool_name=call.name,
                        )
                        next_step += 1
                        return self._message_response(
                            session_id,
                            f"模型请求了未注册工具：{call.name}",
                            status="error",
                            trace=trace,
                        )

                    if tool.requires_confirmation:
                        return self._build_pending_action(
                            session_id=session_id,
                            tool_name=call.name,
                            args=call.arguments,
                            trace=trace,
                            step=next_step,
                            skill_name=skill.name if skill else None,
                        )

                    try:
                        result, record = self._execute_tool(
                            session_id=session_id,
                            action_id=None,
                            tool_name=call.name,
                            args=call.arguments,
                            source=source,
                            ark_api_key_override=ark_api_key_override,
                        )
                    except ToolExecutionError as exc:
                        self._append_trace(
                            trace,
                            step=next_step,
                            kind="tool_call",
                            status="error",
                            summary=self._format_tool_error(exc),
                            skill_name=skill.name if skill else None,
                            tool_name=call.name,
                            args_preview=call.arguments,
                            result_preview=exc.detail or exc.message,
                        )
                        next_step += 1
                        return self._message_response(
                            session_id,
                            self._format_tool_error(exc),
                            status="error",
                            trace=trace,
                        )

                    self._append_trace(
                        trace,
                        step=next_step,
                        kind="tool_call",
                        status="executed",
                        summary=f"已执行工具 {call.name}",
                        skill_name=skill.name if skill else None,
                        tool_name=call.name,
                        args_preview=call.arguments,
                        result_preview=self._preview_value(result),
                    )
                    next_step += 1
                    tool_events.append(
                        {
                            "tool": call.name,
                            "arguments": call.arguments,
                            "result": result,
                        }
                    )
                    if call.name == "search_user":
                        fallback = self._maybe_build_send_dm_from_search_result(
                            session_id=session_id,
                            original_message=message,
                            latest_user_metadata=user_metadata,
                            search_result=result,
                            trace=trace,
                            step=next_step,
                        )
                        if fallback is not None:
                            return fallback
                continue

            text = model_response.text or "未获得模型输出。"
            self._append_trace(
                trace,
                step=next_step,
                kind="message",
                status="final",
                summary="模型已返回最终答复。",
                result_preview=self._preview_value(text),
            )
            return self._message_response(session_id, text, trace=trace)

        limit_message = "工具调用轮次超过限制，未能完成本次请求。"
        self._append_trace(
            trace,
            step=next_step,
            kind="message",
            status="error",
            summary=limit_message,
        )
        return self._message_response(
            session_id,
            limit_message,
            status="error",
            trace=trace,
        )

    def persist_attachment(
        self,
        session_id: str,
        *,
        original_name: str,
        content_type: str,
        content: bytes,
    ) -> dict:
        normalized_session_id = str(session_id or "").strip()
        if not normalized_session_id:
            raise ValueError("session_id is required")
        safe_original_name = self._sanitize_attachment_name(original_name)
        extension = Path(safe_original_name).suffix.lower()
        if extension not in SUPPORTED_CHAT_ATTACHMENT_EXTENSIONS:
            raise ValueError(f"unsupported attachment type: {safe_original_name}")
        if not content:
            raise ValueError(f"attachment is empty: {safe_original_name}")

        attachment_id = f"att_{uuid.uuid4().hex}"
        session_dir = self._config.attachment_dir / self._sanitize_path_segment(normalized_session_id)
        session_dir.mkdir(parents=True, exist_ok=True)
        file_path = session_dir / f"{attachment_id}_{safe_original_name}"
        file_path.write_bytes(content)
        return self._store.create_attachment(
            attachment_id=attachment_id,
            session_id=normalized_session_id,
            original_name=safe_original_name,
            content_type=str(content_type or "").strip(),
            size_bytes=len(content),
            file_path=str(file_path),
        )

    def confirm_action(
        self,
        action_id: str,
        confirm: bool,
        *,
        ark_api_key_override: str | None = None,
    ) -> ConfirmActionResponse:
        self._refresh_tool_registry()
        pending = self._store.get_pending_action(action_id)
        if pending is None:
            raise PendingActionError(f"pending action not found: {action_id}")
        if pending["status"] != "pending":
            raise PendingActionError(f"pending action is already {pending['status']}")

        skill = self._skills_by_tool.get(pending["tool_name"])
        if not confirm:
            self._store.update_pending_action(action_id, "cancelled")
            cancel_message = "已取消待执行动作。"
            self._store.append_message(
                pending["session_id"],
                "assistant",
                cancel_message,
                metadata={"action_id": action_id, "status": "cancelled"},
            )
            return ConfirmActionResponse(
                status="cancelled",
                action_id=action_id,
                message=cancel_message,
                result=None,
                trace=[
                    TraceEvent(
                        step=1,
                        kind="confirmation",
                        status="cancelled",
                        summary=cancel_message,
                        skill_name=skill.name if skill else None,
                        tool_name=pending["tool_name"],
                        args_preview=pending["args_preview"],
                    )
                ],
            )

        try:
            result, _ = self._execute_tool(
                session_id=pending["session_id"],
                action_id=action_id,
                tool_name=pending["tool_name"],
                args=pending["args"],
                source="confirm",
                ark_api_key_override=ark_api_key_override,
            )
        except ToolExecutionError as exc:
            self._store.update_pending_action(
                action_id,
                "failed",
                error={"category": exc.category, "message": exc.message, "detail": exc.detail},
            )
            return ConfirmActionResponse(
                status="error",
                action_id=action_id,
                message=self._format_tool_error(exc),
                result=None,
                trace=[
                    TraceEvent(
                        step=1,
                        kind="confirmation",
                        status="error",
                        summary=self._format_tool_error(exc),
                        skill_name=skill.name if skill else None,
                        tool_name=pending["tool_name"],
                        args_preview=pending["args_preview"],
                        result_preview=exc.detail or exc.message,
                    )
                ],
            )

        self._store.update_pending_action(action_id, "executed", result=result)
        self._remember_outbound_delivery(pending, result, action_id=action_id)
        success_message = self._format_success_message(pending["tool_name"], result)
        self._store.append_message(
            pending["session_id"],
            "assistant",
            success_message,
            metadata={"action_id": action_id, "status": "executed", "result": result},
        )
        return ConfirmActionResponse(
            status="executed",
            action_id=action_id,
            message=success_message,
            result=result,
            trace=[
                TraceEvent(
                    step=1,
                    kind="confirmation",
                    status="executed",
                    summary=success_message,
                    skill_name=skill.name if skill else None,
                    tool_name=pending["tool_name"],
                    args_preview=pending["args_preview"],
                    result_preview=self._preview_value(result),
                )
            ],
        )

    def healthcheck(self) -> HealthResponse:
        errors = self._config.validate()
        return HealthResponse(
            ok=not errors,
            config_errors=errors,
            lark_cli_bin=self._config.lark_cli_bin,
            db_path=str(self._config.app_db_path),
        )

    def whoami(self) -> AgentIdentity:
        return AgentIdentity(
            persona=self._config.agent_persona,
            model=self._config.ark_model,
            skills=tuple(skill.name for skill in self._skills),
        )

    def list_skills(self) -> list[dict[str, str]]:
        return [{"name": skill.name, "description": skill.description} for skill in self._skills]

    def get_session_history(self, session_id: str, limit: int | None = None) -> list[dict]:
        capped = limit or self._config.max_history_messages
        return self._store.get_messages(session_id, capped)

    def get_pending_action_for_session(self, session_id: str) -> dict | None:
        return self._store.get_latest_pending_action_for_session(session_id)

    def list_session_summaries(self, limit: int = 100) -> list[dict]:
        return self._store.list_sessions(limit=limit)

    def get_session_detail(self, session_id: str) -> dict | None:
        detail = self._store.get_session_detail(session_id)
        if detail is None:
            return None

        pending = self._store.get_latest_pending_action_for_session(session_id)
        pending_view = self._build_pending_action_view(pending) if pending else None
        active_pending_action_id = str(pending["action_id"]) if pending else ""

        messages: list[dict] = []
        for item in detail["messages"]:
            metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
            pending_action = None
            status = "message"
            if active_pending_action_id and str(metadata.get("pending_action_id") or "").strip() == active_pending_action_id:
                pending_action = pending_view
                status = "pending_action"
            elif str(metadata.get("status") or "").strip() == "error":
                status = "error"

            messages.append(
                {
                    "role": item["role"],
                    "content": item["content"],
                    "created_at": item["created_at"],
                    "status": status,
                    "pending_action": pending_action,
                }
            )

        return {
            "session_id": detail["session_id"],
            "title": detail["title"],
            "created_at": detail["created_at"],
            "updated_at": detail["updated_at"],
            "origin": detail.get("origin", "unknown"),
            "origin_label": detail.get("origin_label", ""),
            "participant_label": detail.get("participant_label", ""),
            "participant_id": detail.get("participant_id", ""),
            "messages": messages,
            "pending_action": pending_view,
        }

    def delete_session(self, session_id: str) -> bool:
        return self._store.delete_session(session_id)

    def _refresh_tool_registry(self) -> None:
        self._tools_by_name = index_tools(self._collect_tools())
        self._skills_by_tool = self._index_skill_owners()

    def _collect_tools(self) -> list[ToolSpec]:
        tools: list[ToolSpec] = []
        for skill in self._skills:
            tools.extend(skill.get_tools())
        return tools

    def _index_skill_owners(self) -> dict[str, Skill]:
        owners: dict[str, Skill] = {}
        for skill in self._skills:
            for tool in skill.get_tools():
                owners[tool.name] = skill
        return owners

    def _execute_tool(
        self,
        *,
        session_id: str,
        action_id: str | None,
        tool_name: str,
        args: dict,
        source: str,
        ark_api_key_override: str | None = None,
    ):
        skill = self._skills_by_tool.get(tool_name)
        if skill is None:
            raise ToolExecutionError("parameter_error", f"unsupported tool: {tool_name}")
        try:
            result, record = skill.execute(
                tool_name,
                args,
                SkillContext(session_id=session_id, source=source, ark_api_key=ark_api_key_override),
            )
        except ToolExecutionError as exc:
            detail = exc.detail or {}
            self._store.log_tool_call(
                session_id=session_id,
                action_id=action_id,
                tool_name=tool_name,
                command=detail.get("command") or [],
                stdout_text=detail.get("stdout") or "",
                stderr_text=detail.get("stderr") or str(exc),
                ok=False,
                error_category=exc.category,
                duration_ms=detail.get("duration_ms") or 0,
            )
            raise
        self._store.log_tool_call(
            session_id=session_id,
            action_id=action_id,
            tool_name=tool_name,
            command=record.command,
            stdout_text=record.stdout,
            stderr_text=record.stderr,
            ok=True,
            error_category=None,
            duration_ms=record.duration_ms,
        )
        return result, record

    def _remember_outbound_delivery(self, pending: dict[str, Any], result: dict[str, Any], *, action_id: str) -> None:
        if str(pending.get("tool_name") or "").strip() != "send_dm":
            return

        args = pending.get("args") if isinstance(pending.get("args"), dict) else {}
        text = str(args.get("text") or "").strip()
        chat_id = str(result.get("chat_id") or "").strip()
        if not text or not chat_id:
            return

        self._store.append_message(
            f"im-chat:{chat_id}",
            "assistant",
            text,
            metadata={
                "channel": "feishu",
                "source": "feishu_outbound_dm",
                "feishu_chat_id": chat_id,
                "feishu_recipient_open_id": str(args.get("user_open_id") or "").strip(),
                "feishu_message_id": str(result.get("message_id") or "").strip(),
                "action_id": action_id,
                "tool_name": "send_dm",
                "status": "delivered",
            },
        )

    def _message_response(
        self,
        session_id: str,
        text: str,
        status: str = "message",
        *,
        trace: list[TraceEvent] | None = None,
    ) -> ChatResponse:
        metadata = {"status": status} if status and status != "message" else None
        self._store.append_message(session_id, "assistant", text, metadata=metadata)
        return ChatResponse(status=status, session_id=session_id, message=text, trace=trace or [])

    def _build_pending_action(
        self,
        *,
        session_id: str,
        tool_name: str,
        args: dict,
        trace: list[TraceEvent] | None = None,
        step: int = 1,
        skill_name: str | None = None,
    ) -> ChatResponse:
        summary, args_preview = summarize_pending_action(tool_name, args)
        pending = self._store.create_pending_action(
            session_id=session_id,
            tool_name=tool_name,
            args=args,
            summary=summary,
            args_preview=args_preview,
        )
        response_trace = list(trace or [])
        response_trace.append(
            TraceEvent(
                step=step,
                kind="pending_action",
                status="pending",
                summary=summary,
                skill_name=skill_name,
                tool_name=tool_name,
                args_preview=args_preview,
            )
        )
        self._store.append_message(
            session_id,
            "assistant",
            summary,
            metadata={"pending_action_id": pending["action_id"], "tool_name": tool_name},
        )
        return ChatResponse(
            status="pending_action",
            session_id=session_id,
            message=summary,
            pending_action=PendingActionView(
                action_id=pending["action_id"],
                tool_name=tool_name,
                summary=summary,
                args_preview=args_preview,
            ),
            trace=response_trace,
        )

    def _maybe_build_send_dm_from_search_result(
        self,
        *,
        session_id: str,
        original_message: str,
        latest_user_metadata: dict | None = None,
        search_result: dict,
        trace: list[TraceEvent],
        step: int,
    ) -> ChatResponse | None:
        if "send_dm" not in self._tools_by_name:
            return None
        is_send_attachment_request = self._looks_like_send_attachment_request(original_message)
        if not self._looks_like_send_dm_request(original_message) and not is_send_attachment_request:
            return None

        matches = search_result.get("matches") or []
        if len(matches) != 1:
            return None

        attachment_ids = self._extract_attachment_ids_from_metadata(latest_user_metadata)
        if attachment_ids and is_send_attachment_request:
            args = {
                "user_open_id": matches[0]["open_id"],
                "text": "",
                "attachment_ids": attachment_ids,
                "send_as": "bot",
            }
            skill = self._skills_by_tool.get("send_dm")
            return self._build_pending_action(
                session_id=session_id,
                tool_name="send_dm",
                args=args,
                trace=trace,
                step=step,
                skill_name=skill.name if skill else None,
            )

        message_text = self._extract_dm_text(original_message, matches[0].get("name") or "")
        if not message_text:
            return None
        if not self._should_auto_promote_send_dm(original_message, message_text):
            return None

        args = {
            "user_open_id": matches[0]["open_id"],
            "text": message_text,
            "send_as": "bot",
        }
        skill = self._skills_by_tool.get("send_dm")
        return self._build_pending_action(
            session_id=session_id,
            tool_name="send_dm",
            args=args,
            trace=trace,
            step=step,
            skill_name=skill.name if skill else None,
        )

    def _looks_like_send_dm_request(self, text: str) -> bool:
        return ("发" in text or "发送" in text) and ("给" in text or "私聊" in text)

    def _looks_like_send_attachment_request(self, text: str) -> bool:
        normalized = str(text or "")
        has_send_intent = any(token in normalized for token in ("发给", "发送给", "转发给", "传给")) or (
            "给" in normalized and any(token in normalized for token in ("发", "发送", "转发", "传"))
        )
        has_attachment_reference = any(
            token in normalized
            for token in ("图", "图片", "照片", "截图", "附件", "文件", "PDF", "pdf", "这张", "这个")
        )
        return has_send_intent and has_attachment_reference

    def _extract_attachment_ids_from_metadata(self, metadata: dict | None) -> list[str]:
        if not isinstance(metadata, dict):
            return []
        attachments = metadata.get("attachments")
        if not isinstance(attachments, list):
            return []
        attachment_ids = []
        for attachment in attachments:
            if not isinstance(attachment, dict):
                continue
            attachment_id = str(attachment.get("attachment_id") or "").strip()
            if attachment_id:
                attachment_ids.append(attachment_id)
        return attachment_ids

    def _extract_dm_text(self, text: str, matched_name: str) -> str | None:
        escaped_name = re.escape(matched_name) if matched_name else None
        patterns = []
        if escaped_name:
            patterns.extend(
                [
                    rf"给\s*{escaped_name}\s*发(?:消息|信息)\s*[:：]?\s*(.+)$",
                    rf"给\s*{escaped_name}\s*发送?\s*(.+)$",
                    rf"给\s*{escaped_name}\s*发\s*(.+)$",
                    rf"发消息给\s*{escaped_name}\s*[:：]?\s*(.+)$",
                    rf"发给\s*{escaped_name}\s*[:：]?\s*(.+)$",
                ]
            )
        patterns.extend(
            [
                r"给\s*open_id\s*为\s*[A-Za-z0-9_]+\s*的用户\s*发送?\s*(.+)$",
                r"给\s*open_id\s*为\s*[A-Za-z0-9_]+\s*的用户\s*发\s*(.+)$",
            ]
        )

        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                candidate = self._strip_wrapping_quotes(match.group(1).strip())
                if candidate:
                    return candidate
        return None

    def _should_auto_promote_send_dm(self, original_message: str, message_text: str) -> bool:
        candidate = self._strip_wrapping_quotes(" ".join(str(message_text).split()).strip())
        if not candidate:
            return False

        if self._has_explicit_dm_body(original_message, candidate):
            return True
        if self._looks_like_instructional_dm_request(original_message, candidate):
            return False

        if any(mark in candidate for mark in ("：", ":", "\n", "，", "。", "；", "！", "!", "？", "?")):
            return False

        return len(candidate) <= 12

    def _strip_wrapping_quotes(self, text: str) -> str:
        stripped = text.strip()
        quote_pairs = {
            '"': '"',
            "'": "'",
            "“": "”",
            "‘": "’",
        }
        while len(stripped) >= 2:
            closing = quote_pairs.get(stripped[0])
            if not closing or stripped[-1] != closing:
                break
            stripped = stripped[1:-1].strip()
        return stripped

    def _has_explicit_dm_body(self, original_message: str, candidate: str) -> bool:
        escaped_candidate = re.escape(candidate)
        explicit_patterns = (
            rf"[\"“”'']\s*{escaped_candidate}\s*[\"“”'']",
            rf"(?:内容|信息|消息)\s*(?:是|为)\s*[\"“”'']?\s*{escaped_candidate}\s*[\"“”'']?\s*$",
            rf"[:：]\s*[\"“”'']?\s*{escaped_candidate}\s*[\"“”'']?\s*$",
        )
        return any(re.search(pattern, original_message) for pattern in explicit_patterns)

    def _looks_like_instructional_dm_request(self, original_message: str, candidate: str) -> bool:
        meta_prefixes = (
            "内容是",
            "内容为",
            "信息是",
            "信息为",
            "消息是",
            "消息为",
        )
        if candidate.startswith(meta_prefixes):
            return True

        meta_phrases = (
            "介绍一下你自己",
            "介绍你自己",
            "自我介绍",
            "帮我介绍",
            "替我介绍",
            "帮我问候",
            "替我问候",
            "帮我回复",
            "替我回复",
            "帮我提醒",
            "替我提醒",
            "帮我通知",
            "替我通知",
            "帮我写",
            "替我写",
            "写一段",
            "生成",
            "总结一下",
            "解释一下",
            "提醒他",
            "提醒她",
            "通知他",
            "通知她",
            "回复他",
            "回复她",
            "回他",
            "回她",
            "问候他",
            "问候她",
            "告诉他",
            "告诉她",
            "让他",
            "让她",
            "请他",
            "请她",
            "叫他",
            "叫她",
            "一道",
            "一题",
            "题目",
            "练习题",
            "作业",
            "一条",
            "一句",
            "一段",
            "一封",
            "一个",
            "一些",
        )
        if any(phrase in candidate for phrase in meta_phrases):
            return True

        generative_patterns = (
            r"(?:发|发送)\s*一(?:道|题|条|句|段|封|个|份)",
            r"(?:发|发送)\s*(?:一些|一个|一篇)",
        )
        return any(re.search(pattern, original_message) for pattern in generative_patterns)

    def _format_tool_error(self, exc: ToolExecutionError) -> str:
        if exc.category == "permission_denied":
            return f"权限不足：{exc.message}"
        if exc.category == "bot_availability":
            return f"机器人可用范围不足：{exc.message}"
        if exc.category == "parameter_error":
            return f"参数错误：{exc.message}"
        if exc.category == "ambiguous_target":
            return f"目标不明确：{exc.message}"
        return f"工具执行失败：{exc.message}"

    def _format_success_message(self, tool_name: str, result: dict) -> str:
        if tool_name == "create_workspace":
            summary = result.get("summary") if isinstance(result.get("summary"), dict) else {}
            workspace_name = str(summary.get("name") or "").strip()
            workspace_id = str(summary.get("workspaceId") or result.get("workspaceId") or "").strip()
            kind = str(summary.get("kind") or "").strip()
            parts = [part for part in [workspace_name, workspace_id, kind] if part]
            return f"已创建工作区：{' / '.join(parts)}。" if parts else "已创建工作区。"
        if tool_name == "send_dm":
            return f"已发送消息，message_id={result.get('message_id')}。"
        if tool_name == "reply_message":
            return f"已回复飞书消息，message_id={result.get('message_id')}。"
        if tool_name == "create_doc":
            return "已创建飞书文档。"
        if tool_name == "start_textbook_extraction_job":
            return f"已启动教材题库后台任务，taskId={result.get('taskId')}。"
        if tool_name == "cancel_textbook_extraction_job":
            return f"已请求取消教材题库后台任务，taskId={result.get('taskId')}。"
        return f"已执行 {tool_name}。"

    def _append_trace(
        self,
        trace: list[TraceEvent],
        *,
        step: int,
        kind: str,
        status: str,
        summary: str,
        skill_name: str | None = None,
        tool_name: str | None = None,
        args_preview: dict | None = None,
        result_preview: object | None = None,
    ) -> None:
        trace.append(
            TraceEvent(
                step=step,
                kind=kind,
                status=status,
                summary=summary,
                skill_name=skill_name,
                tool_name=tool_name,
                args_preview=args_preview,
                result_preview=result_preview,
            )
        )

    def _preview_value(self, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str):
            return value[:800]
        try:
            text = json.dumps(value, ensure_ascii=False)
        except TypeError:
            return str(value)[:800]
        if len(text) <= 800:
            return value
        return text[:800]

    @staticmethod
    def _sanitize_attachment_name(value: str) -> str:
        name = Path(str(value or "").replace("\\", "/")).name.strip() or "attachment.bin"
        sanitized = re.sub(r"[^A-Za-z0-9._\-\u4e00-\u9fff]+", "_", name).strip("._")
        return sanitized or "attachment.bin"

    @staticmethod
    def _sanitize_path_segment(value: str) -> str:
        return re.sub(r"[^A-Za-z0-9._-]+", "_", str(value or "").strip()).strip("._") or "session"

    def _build_pending_action_view(self, pending: dict | None) -> dict | None:
        if not pending:
            return None
        return {
            "action_id": str(pending["action_id"]),
            "tool_name": str(pending["tool_name"]),
            "summary": str(pending["summary"]),
            "args_preview": pending["args_preview"] if isinstance(pending.get("args_preview"), dict) else {},
        }


def build_harness(
    config: AppConfig,
    *,
    store: SessionStore | None = None,
    runner: CliRunner | None = None,
    tool_executor: ToolExecutor | None = None,
    ark_client: ArkClient | None = None,
    skills: list[Skill] | None = None,
) -> AgentHarness:
    runtime_store = store or SessionStore(config.app_db_path)
    runtime_runner = runner or CliRunner(config.lark_cli_bin, config.command_timeout_seconds)
    runtime_executor = tool_executor or ToolExecutor(runtime_runner)
    runtime_ark_client = ark_client or ArkClient(
        api_key=config.ark_api_key,
        base_url=config.ark_base_url,
        model=config.ark_model,
    )
    return AgentHarness(
        config=config,
        store=runtime_store,
        ark_client=runtime_ark_client,
        tool_executor=runtime_executor,
        skills=skills,
    )
