from __future__ import annotations

import json
import mimetypes
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any, Iterable

import httpx

from ..errors import ToolExecutionError
from ..store import SessionStore
from ..tool_executor import ToolExecutionRecord
from ..workspace_api import derive_backend_base_url
from .base import Skill, SkillContext, ToolSpec

if TYPE_CHECKING:
    from ..config import AppConfig


SUPPORTED_PDF_EXTENSIONS = {".pdf"}
SUPPORTED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
TERMINAL_JOB_STATUSES = {"succeeded", "failed", "cancelled"}


class TextbookPipelineBackendError(RuntimeError):
    pass


class TextbookPipelineCancelled(RuntimeError):
    pass


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class TextbookPipelineBackendClient:
    def __init__(self, *, base_url: str, timeout_seconds: int) -> None:
        self._base_url = str(base_url or "").strip().rstrip("/")
        self._timeout_seconds = max(1, int(timeout_seconds or 30))

    @classmethod
    def from_config(cls, config: AppConfig) -> "TextbookPipelineBackendClient":
        return cls(
            base_url=derive_backend_base_url(config.question_bank_mcp_url),
            timeout_seconds=config.question_bank_mcp_timeout_seconds,
        )

    def create_workspace(self, *, name: str, kind: str = "textbook") -> dict[str, Any]:
        return self._request_json("POST", "/api/workspaces", json_body={"name": name, "kind": kind})

    def save_textbook_json(
        self,
        *,
        workspace_id: str,
        payload: dict[str, Any],
        file_name: str,
    ) -> dict[str, Any]:
        return self._request_json(
            "POST",
            "/api/textbook-json/save",
            json_body={
                "workspaceId": workspace_id,
                "payload": payload,
                "fileName": file_name,
            },
        )

    def convert_pdfs(
        self,
        *,
        workspace_id: str,
        folder_name: str,
        attachments: list[dict[str, Any]],
    ) -> dict[str, Any]:
        opened_files = []
        try:
            files = []
            for index, attachment in enumerate(attachments, start=1):
                file_path = str(attachment["file_path"])
                handle = open(file_path, "rb")
                opened_files.append(handle)
                file_name = str(attachment.get("original_name") or Path(file_path).name)
                files.append((f"pdf_{index}", (file_name, handle, "application/pdf")))
            return self._request_json(
                "POST",
                "/api/convert",
                data={"workspaceId": workspace_id, "folderName": folder_name},
                files=files,
            )
        finally:
            for handle in opened_files:
                handle.close()

    def upload_image_batch(
        self,
        *,
        workspace_id: str,
        folder_name: str,
        attachments: list[dict[str, Any]],
    ) -> dict[str, Any]:
        opened_files = []
        try:
            files = []
            for attachment in attachments:
                file_path = str(attachment["file_path"])
                handle = open(file_path, "rb")
                opened_files.append(handle)
                file_name = str(attachment.get("original_name") or Path(file_path).name)
                mime_type = str(attachment.get("content_type") or "").strip()
                if not mime_type:
                    mime_type = mimetypes.guess_type(file_name)[0] or "application/octet-stream"
                files.append(("images", (file_name, handle, mime_type)))
            return self._request_json(
                "POST",
                f"/api/workspaces/{workspace_id}/image-batches",
                data={"folderName": folder_name},
                files=files,
            )
        finally:
            for handle in opened_files:
                handle.close()

    def init_chapter_session(
        self,
        *,
        workspace_id: str,
        json_asset_id: str,
        json_file_path: str,
        start_chapter: str,
        start_section: str,
        ark_api_key: str | None,
    ) -> dict[str, Any]:
        return self._request_json(
            "POST",
            "/api/chapters/session/init",
            json_body={
                "workspaceId": workspace_id,
                "jsonAssetId": json_asset_id,
                "jsonFilePath": json_file_path,
                "currentChapterTitle": start_chapter,
                "currentSectionTitle": start_section,
            },
            ark_api_key=ark_api_key,
        )

    def stream_auto_run_responses(
        self,
        *,
        session_id: str,
        workspace_id: str,
        json_asset_id: str,
        image_dir: str,
        start_chapter: str,
        start_section: str,
        ark_api_key: str | None,
    ) -> Iterable[dict[str, Any]]:
        url = f"{self._base_url}/api/chapters/session/auto-run-stream-responses"
        headers = self._headers(ark_api_key)
        body = {
            "sessionId": session_id,
            "workspaceId": workspace_id,
            "jsonAssetId": json_asset_id,
            "imageDir": image_dir,
            "currentChapterTitle": start_chapter,
            "currentSectionTitle": start_section,
        }
        try:
            with httpx.Client(timeout=None) as client:
                with client.stream("POST", url, json=body, headers=headers) as response:
                    if response.status_code >= 400:
                        text = response.read().decode("utf-8", errors="replace")
                        raise TextbookPipelineBackendError(
                            self._extract_error_message(response.status_code, text)
                        )
                    for line in response.iter_lines():
                        if not line:
                            continue
                        try:
                            payload = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        if isinstance(payload, dict):
                            yield payload
        except httpx.HTTPError as exc:
            raise TextbookPipelineBackendError(f"Backend stream request failed: {exc}") from exc

    def read_textbook_json(
        self,
        *,
        workspace_id: str,
        json_asset_id: str,
        json_file_path: str,
    ) -> dict[str, Any]:
        return self._request_json(
            "POST",
            "/api/textbook-json/read",
            json_body={
                "workspaceId": workspace_id,
                "jsonAssetId": json_asset_id,
                "filePath": json_file_path,
            },
        )

    def import_workspace_json(
        self,
        *,
        workspace_id: str,
        json_asset_id: str,
        json_file_path: str,
    ) -> dict[str, Any]:
        return self._request_json(
            "POST",
            "/api/question-bank-db/import-workspace-json",
            json_body={
                "workspaceId": workspace_id,
                "jsonAssetId": json_asset_id,
                "jsonFilePath": json_file_path,
            },
        )

    def _request_json(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        data: dict[str, str] | None = None,
        files: list[tuple[str, Any]] | None = None,
        ark_api_key: str | None = None,
    ) -> dict[str, Any]:
        url = f"{self._base_url}{path}"
        try:
            with httpx.Client(timeout=self._timeout_seconds) as client:
                response = client.request(
                    method,
                    url,
                    json=json_body,
                    data=data,
                    files=files,
                    headers=self._headers(ark_api_key),
                )
        except httpx.HTTPError as exc:
            raise TextbookPipelineBackendError(f"Backend request failed: {exc}") from exc

        text = response.text
        try:
            payload = response.json() if text else {}
        except ValueError as exc:
            raise TextbookPipelineBackendError(
                f"Backend returned non-JSON response (HTTP {response.status_code}): {text[:300]}"
            ) from exc
        if response.status_code >= 400:
            message = ""
            if isinstance(payload, dict):
                message = str(payload.get("message") or payload.get("detail") or "").strip()
            raise TextbookPipelineBackendError(message or f"Backend request failed with HTTP {response.status_code}")
        if not isinstance(payload, dict):
            raise TextbookPipelineBackendError(f"Unexpected backend response payload: {payload!r}")
        return payload

    @staticmethod
    def _extract_error_message(status_code: int, text: str) -> str:
        try:
            payload = json.loads(text)
        except ValueError:
            return f"Backend request failed with HTTP {status_code}: {text[:300]}"
        if isinstance(payload, dict):
            return str(payload.get("message") or payload.get("detail") or payload).strip()
        return f"Backend request failed with HTTP {status_code}: {text[:300]}"

    @staticmethod
    def _headers(ark_api_key: str | None) -> dict[str, str]:
        key = str(ark_api_key or "").strip()
        return {"X-Ark-Api-Key": key} if key else {}


class TextbookPipelineSkill(Skill):
    name = "textbook_pipeline"
    description = "Run the textbook PDF/image to question-bank extraction pipeline as a background job."

    def __init__(
        self,
        config: AppConfig,
        *,
        client: TextbookPipelineBackendClient | None = None,
        store: SessionStore | None = None,
    ) -> None:
        self._config = config
        self._client = client or TextbookPipelineBackendClient.from_config(config)
        self._store = store or SessionStore(config.app_db_path)

    def get_tools(self) -> list[ToolSpec]:
        return [
            ToolSpec(
                name="list_textbook_pipeline_capabilities",
                description="Describe the supported textbook extraction pipeline, required metadata, and attachment limits.",
                parameters={"type": "object", "properties": {}, "required": [], "additionalProperties": False},
                requires_confirmation=False,
            ),
            ToolSpec(
                name="start_textbook_extraction_job",
                description=(
                    "Start a confirmed background job that converts uploaded textbook PDFs or images into a textbook "
                    "JSON, extracts questions page by page, and optionally imports the final JSON into the question bank DB."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "attachment_ids": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Attachment ids from the current chat attachment list.",
                        },
                        "courseId": {"type": "string", "description": "Course id for the question bank source."},
                        "textbookId": {"type": "string", "description": "Stable textbook/source id."},
                        "title": {"type": "string", "description": "Textbook title."},
                        "publisher": {"type": "string", "description": "Publisher; use empty string if unknown."},
                        "subject": {"type": "string", "description": "Subject; use empty string if unknown."},
                        "startChapter": {"type": "string", "description": "Initial chapter title, for example 第八章 不定积分."},
                        "startSection": {"type": "string", "description": "Initial section title, for example 习题8.1."},
                        "hasAnswer": {
                            "type": "boolean",
                            "description": "True if answers are visible in the source; false to generate brief answers.",
                        },
                        "importToDb": {
                            "type": "boolean",
                            "description": "Whether to import the completed workspace JSON into the question-bank database.",
                        },
                        "workspaceName": {
                            "type": "string",
                            "description": "Optional workspace name; defaults to the title.",
                        },
                    },
                    "required": [
                        "attachment_ids",
                        "courseId",
                        "textbookId",
                        "title",
                        "startChapter",
                        "startSection",
                    ],
                    "additionalProperties": False,
                },
                requires_confirmation=True,
            ),
            ToolSpec(
                name="get_textbook_extraction_status",
                description="Read status and progress for a textbook extraction background job. If taskId is omitted, read the latest job in this session.",
                parameters={
                    "type": "object",
                    "properties": {
                        "taskId": {"type": "string", "description": "Textbook pipeline task id."},
                    },
                    "required": [],
                    "additionalProperties": False,
                },
                requires_confirmation=False,
            ),
            ToolSpec(
                name="cancel_textbook_extraction_job",
                description="Request cancellation for a running textbook extraction job.",
                parameters={
                    "type": "object",
                    "properties": {
                        "taskId": {"type": "string", "description": "Textbook pipeline task id. Defaults to latest session job."},
                    },
                    "required": [],
                    "additionalProperties": False,
                },
                requires_confirmation=True,
            ),
        ]

    def get_guidance(self) -> str:
        return (
            "textbook_pipeline skill:\n"
            "- 当用户上传 PDF/图片并说“做成题库”“提取教材题目”“提取并入库”等，优先使用 start_textbook_extraction_job。\n"
            "- 启动前必须有附件，以及 courseId、textbookId、title、startChapter、startSection；缺任何一项先追问，不要启动。\n"
            "- 如果用户说资料没有答案或未说明答案，hasAnswer=false，系统会按教材无答案策略生成简洁答案；如果用户明确说有答案，hasAnswer=true。\n"
            "- v1 支持一批 PDF 或一批图片，暂不混合 PDF 和图片同跑一个任务。\n"
            "- start_textbook_extraction_job 和 cancel_textbook_extraction_job 是写操作，会进入确认流；确认前不要说任务已经开始或已取消。\n"
            "- 用户问进度、失败页、产物位置时，调用 get_textbook_extraction_status，不要编造进度。\n"
        )

    def execute(
        self,
        tool_name: str,
        args: dict[str, Any],
        context: SkillContext,
    ) -> tuple[dict[str, Any], ToolExecutionRecord]:
        started = time.perf_counter()
        command = self._command_preview(tool_name, args)
        try:
            if tool_name == "list_textbook_pipeline_capabilities":
                result = self._capabilities()
            elif tool_name == "start_textbook_extraction_job":
                result = self._start_job(args, context)
            elif tool_name == "get_textbook_extraction_status":
                result = self._get_status(args, context)
            elif tool_name == "cancel_textbook_extraction_job":
                result = self._cancel_job(args, context)
            else:
                raise ToolExecutionError("parameter_error", f"unsupported textbook pipeline tool: {tool_name}", {"command": command})
        except TextbookPipelineBackendError as exc:
            raise ToolExecutionError("tool_error", str(exc), {"command": command, "tool_name": tool_name, "arguments": args}) from exc

        duration_ms = int((time.perf_counter() - started) * 1000)
        return result, ToolExecutionRecord(
            tool_name=tool_name,
            command=command,
            stdout=json.dumps(result, ensure_ascii=False),
            stderr="",
            duration_ms=duration_ms,
            ok=True,
            error_category=None,
        )

    def _capabilities(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "supportedInputs": ["pdf", "png", "jpg", "jpeg", "webp"],
            "inputRules": "A single job can process either PDFs or images, not a mixed PDF/image batch.",
            "requiredMetadata": ["courseId", "textbookId", "title", "startChapter", "startSection"],
            "optionalMetadata": ["publisher", "subject", "hasAnswer", "importToDb", "workspaceName"],
            "defaultHasAnswer": False,
            "defaultImportToDb": True,
            "stages": [
                "create workspace",
                "save base textbook JSON",
                "convert PDF or register image batch",
                "init chapter session",
                "extract pages sequentially",
                "read final JSON",
                "import workspace JSON into DB",
            ],
        }

    def _start_job(self, args: dict[str, Any], context: SkillContext) -> dict[str, Any]:
        normalized_args = self._normalize_start_args(args)
        attachment_ids = self._normalize_string_list(args.get("attachment_ids"))
        if not attachment_ids:
            latest = list(reversed(self._store.list_session_attachments(context.session_id, limit=20)))
            attachment_ids = [str(item["attachment_id"]) for item in latest]
        if not attachment_ids:
            raise ToolExecutionError("parameter_error", "请先在聊天中上传 PDF 或图片附件。")

        attachments = self._resolve_attachments(attachment_ids)
        input_kind = self._infer_input_kind(attachments)
        normalized_args["inputKind"] = input_kind
        job = self._store.create_textbook_pipeline_job(
            session_id=context.session_id,
            args=normalized_args,
            attachment_ids=attachment_ids,
        )

        thread = threading.Thread(
            target=self._run_job,
            args=(str(job["job_id"]), context.ark_api_key),
            name=f"textbook-pipeline-{job['job_id']}",
            daemon=True,
        )
        thread.start()
        return {
            "taskId": job["job_id"],
            "status": job["status"],
            "phase": job["phase"],
            "inputKind": input_kind,
            "attachmentCount": len(attachments),
            "message": "Textbook extraction job has been queued and will run in the background.",
        }

    def _get_status(self, args: dict[str, Any], context: SkillContext) -> dict[str, Any]:
        job = self._resolve_job(args, context)
        return self._job_view(job)

    def _cancel_job(self, args: dict[str, Any], context: SkillContext) -> dict[str, Any]:
        job = self._resolve_job(args, context)
        if str(job.get("status") or "") in TERMINAL_JOB_STATUSES:
            return {
                **self._job_view(job),
                "cancelRequested": False,
                "message": "Job is already in a terminal state.",
            }
        updated = self._store.request_textbook_pipeline_cancel(str(job["job_id"])) or job
        return {
            **self._job_view(updated),
            "cancelRequested": True,
            "message": "Cancellation has been requested. The job will stop at the next safe checkpoint.",
        }

    def _run_job(self, job_id: str, ark_api_key: str | None) -> None:
        try:
            job = self._store.get_textbook_pipeline_job(job_id)
            if job is None:
                return
            args = job["args"] if isinstance(job.get("args"), dict) else {}
            attachments = self._resolve_attachments([str(item) for item in job.get("attachment_ids") or []])
            input_kind = str(args.get("inputKind") or self._infer_input_kind(attachments))
            folder_name = self._build_folder_name(args, job_id)

            self._store.update_textbook_pipeline_job(
                job_id,
                status="running",
                phase="creating_workspace",
                started_at=now_iso(),
            )
            self._check_cancel(job_id)
            workspace_response = self._client.create_workspace(
                name=str(args.get("workspaceName") or args.get("title") or "textbook").strip(),
                kind="textbook",
            )
            summary = workspace_response.get("summary") if isinstance(workspace_response.get("summary"), dict) else {}
            workspace_id = str(summary.get("workspaceId") or workspace_response.get("workspaceId") or "").strip()
            if not workspace_id:
                raise TextbookPipelineBackendError("Backend did not return workspaceId")
            self._store.update_textbook_pipeline_job(job_id, workspace_id=workspace_id)

            self._check_cancel(job_id)
            self._store.update_textbook_pipeline_job(job_id, phase="saving_base_json")
            payload = self._build_textbook_payload(args)
            saved_json = self._client.save_textbook_json(
                workspace_id=workspace_id,
                payload=payload,
                file_name=f"{str(args.get('textbookId') or 'textbook').strip()}.json",
            )
            json_asset_id = str(saved_json.get("jsonAssetId") or "").strip()
            json_file_path = str(saved_json.get("filePath") or saved_json.get("workspaceFilePath") or "").strip()
            if not json_asset_id and not json_file_path:
                raise TextbookPipelineBackendError("Backend did not return jsonAssetId or filePath")
            self._store.update_textbook_pipeline_job(
                job_id,
                json_asset_id=json_asset_id,
                json_file_path=json_file_path,
            )

            self._check_cancel(job_id)
            if input_kind == "pdf":
                self._store.update_textbook_pipeline_job(job_id, phase="converting_pdf")
                page_batch = self._client.convert_pdfs(
                    workspace_id=workspace_id,
                    folder_name=folder_name,
                    attachments=attachments,
                )
            else:
                self._store.update_textbook_pipeline_job(job_id, phase="registering_image_batch")
                page_batch = self._client.upload_image_batch(
                    workspace_id=workspace_id,
                    folder_name=folder_name,
                    attachments=attachments,
                )
            image_dir = str(page_batch.get("outputFolder") or "").strip()
            image_batch_asset_id = str(page_batch.get("imageBatchAssetId") or "").strip()
            total_pages = int(page_batch.get("totalPages") or len(page_batch.get("pages") or []) or 0)
            if not image_dir:
                raise TextbookPipelineBackendError("Backend did not return outputFolder for page images")
            self._store.update_textbook_pipeline_job(
                job_id,
                image_batch_asset_id=image_batch_asset_id,
                total_pages=total_pages,
            )

            self._check_cancel(job_id)
            self._store.update_textbook_pipeline_job(job_id, phase="initializing_chapter_session")
            chapter_session = self._client.init_chapter_session(
                workspace_id=workspace_id,
                json_asset_id=json_asset_id,
                json_file_path=json_file_path,
                start_chapter=str(args["startChapter"]),
                start_section=str(args["startSection"]),
                ark_api_key=ark_api_key,
            )
            chapter_session_id = str(chapter_session.get("sessionId") or "").strip()
            if not chapter_session_id:
                raise TextbookPipelineBackendError("Backend did not return chapter sessionId")
            self._store.update_textbook_pipeline_job(
                job_id,
                chapter_session_id=chapter_session_id,
                current_chapter_title=str(chapter_session.get("currentChapterTitle") or ""),
                current_section_title=str(chapter_session.get("currentSectionTitle") or ""),
            )

            self._check_cancel(job_id)
            self._store.update_textbook_pipeline_job(job_id, phase="extracting_pages")
            done_event: dict[str, Any] | None = None
            success_count = 0
            failed_count = 0
            for event in self._client.stream_auto_run_responses(
                session_id=chapter_session_id,
                workspace_id=workspace_id,
                json_asset_id=json_asset_id,
                image_dir=image_dir,
                start_chapter=str(args["startChapter"]),
                start_section=str(args["startSection"]),
                ark_api_key=ark_api_key,
            ):
                self._check_cancel(job_id)
                event_type = str(event.get("type") or "").strip()
                if event_type == "start":
                    self._store.update_textbook_pipeline_job(
                        job_id,
                        total_pages=int(event.get("totalCount") or total_pages or 0),
                        current_chapter_title=str(event.get("currentChapterTitle") or ""),
                        current_section_title=str(event.get("currentSectionTitle") or ""),
                    )
                elif event_type == "progress":
                    self._store.update_textbook_pipeline_job(
                        job_id,
                        current_page=int(event.get("currentIndex") or 0),
                        current_file_name=str(event.get("fileName") or ""),
                        total_pages=int(event.get("totalCount") or total_pages or 0),
                    )
                elif event_type == "result":
                    if str(event.get("status") or "") == "success":
                        success_count += 1
                    else:
                        failed_count += 1
                    self._store.update_textbook_pipeline_job(
                        job_id,
                        current_page=int(event.get("currentIndex") or 0),
                        current_file_name=str(event.get("fileName") or ""),
                        total_pages=int(event.get("totalCount") or total_pages or 0),
                        success_count=success_count,
                        failed_count=failed_count,
                        current_chapter_title=str(event.get("currentChapterTitle") or ""),
                        current_section_title=str(event.get("currentSectionTitle") or ""),
                    )
                elif event_type == "done":
                    done_event = event
                    success_count = int(event.get("successCount") or success_count)
                    failed_count = int(event.get("failedCount") or failed_count)
                    self._store.update_textbook_pipeline_job(
                        job_id,
                        current_page=int(event.get("totalCount") or total_pages or 0),
                        total_pages=int(event.get("totalCount") or total_pages or 0),
                        success_count=success_count,
                        failed_count=failed_count,
                        current_chapter_title=str(event.get("currentChapterTitle") or ""),
                        current_section_title=str(event.get("currentSectionTitle") or ""),
                    )
                elif event_type == "error":
                    raise TextbookPipelineBackendError(str(event.get("message") or "auto-run stream failed"))

            self._check_cancel(job_id)
            self._store.update_textbook_pipeline_job(job_id, phase="reading_final_json")
            final_json = self._client.read_textbook_json(
                workspace_id=workspace_id,
                json_asset_id=json_asset_id,
                json_file_path=json_file_path,
            )

            db_import = None
            if args.get("importToDb") is not False:
                self._check_cancel(job_id)
                self._store.update_textbook_pipeline_job(job_id, phase="importing_database")
                db_import = self._client.import_workspace_json(
                    workspace_id=workspace_id,
                    json_asset_id=json_asset_id,
                    json_file_path=json_file_path,
                )

            result = {
                "taskId": job_id,
                "workspaceId": workspace_id,
                "jsonAssetId": json_asset_id,
                "jsonFilePath": json_file_path,
                "imageBatchAssetId": image_batch_asset_id,
                "totalPages": int((done_event or {}).get("totalCount") or total_pages or 0),
                "successCount": success_count,
                "failedCount": failed_count,
                "finalJsonBytes": len(str(final_json.get("text") or "").encode("utf-8")),
                "dbImport": db_import,
                "source": {
                    "courseId": args.get("courseId"),
                    "textbookId": args.get("textbookId"),
                    "title": args.get("title"),
                },
            }
            self._store.update_textbook_pipeline_job(
                job_id,
                status="succeeded",
                phase="finished",
                result=result,
                db_import=db_import,
                finished_at=now_iso(),
            )
        except TextbookPipelineCancelled as exc:
            self._store.update_textbook_pipeline_job(
                job_id,
                status="cancelled",
                phase="cancelled",
                error_summary=str(exc) or "cancelled",
                finished_at=now_iso(),
            )
        except Exception as exc:
            self._store.update_textbook_pipeline_job(
                job_id,
                status="failed",
                phase="failed",
                error_summary=str(exc),
                finished_at=now_iso(),
            )

    def _normalize_start_args(self, args: dict[str, Any]) -> dict[str, Any]:
        required = ["courseId", "textbookId", "title", "startChapter", "startSection"]
        missing = [field for field in required if not str(args.get(field) or "").strip()]
        if missing:
            raise ToolExecutionError("parameter_error", f"缺少必填参数: {', '.join(missing)}")
        return {
            "courseId": str(args.get("courseId") or "").strip(),
            "textbookId": str(args.get("textbookId") or "").strip(),
            "title": str(args.get("title") or "").strip(),
            "publisher": str(args.get("publisher") or "").strip(),
            "subject": str(args.get("subject") or "").strip(),
            "startChapter": str(args.get("startChapter") or "").strip(),
            "startSection": str(args.get("startSection") or "").strip(),
            "hasAnswer": bool(args.get("hasAnswer")) if isinstance(args.get("hasAnswer"), bool) else False,
            "importToDb": args.get("importToDb") is not False,
            "workspaceName": str(args.get("workspaceName") or args.get("title") or "").strip(),
        }

    def _resolve_attachments(self, attachment_ids: list[str]) -> list[dict[str, Any]]:
        attachments = self._store.get_attachments(attachment_ids)
        found = {str(item.get("attachment_id")) for item in attachments}
        missing = [item for item in attachment_ids if item not in found]
        if missing:
            raise ToolExecutionError("parameter_error", f"attachment_id not found: {', '.join(missing)}")
        for attachment in attachments:
            file_path = Path(str(attachment.get("file_path") or ""))
            if not file_path.is_file():
                raise ToolExecutionError("parameter_error", f"attachment file is missing: {attachment.get('attachment_id')}")
        return attachments

    def _infer_input_kind(self, attachments: list[dict[str, Any]]) -> str:
        kinds = set()
        for attachment in attachments:
            extension = Path(str(attachment.get("original_name") or "")).suffix.lower()
            if extension in SUPPORTED_PDF_EXTENSIONS:
                kinds.add("pdf")
            elif extension in SUPPORTED_IMAGE_EXTENSIONS:
                kinds.add("image")
            else:
                raise ToolExecutionError("parameter_error", f"unsupported attachment type: {attachment.get('original_name')}")
        if not kinds:
            raise ToolExecutionError("parameter_error", "请先上传 PDF 或图片附件。")
        if len(kinds) > 1:
            raise ToolExecutionError("parameter_error", "v1 暂不支持 PDF 和图片混合成一个任务，请拆成两次运行。")
        return next(iter(kinds))

    def _build_textbook_payload(self, args: dict[str, Any]) -> dict[str, Any]:
        return {
            "version": "1.0",
            "courseId": str(args.get("courseId") or "").strip(),
            "documentType": "textbook",
            "textbook": {
                "textbookId": str(args.get("textbookId") or "").strip(),
                "title": str(args.get("title") or "").strip(),
                "publisher": str(args.get("publisher") or "").strip(),
                "subject": str(args.get("subject") or "").strip(),
                "hasAnswer": bool(args.get("hasAnswer")),
            },
            "chapters": [],
            "questions": [],
        }

    def _resolve_job(self, args: dict[str, Any], context: SkillContext) -> dict[str, Any]:
        task_id = str(args.get("taskId") or "").strip()
        job = self._store.get_textbook_pipeline_job(task_id) if task_id else None
        if job is None and not task_id:
            job = self._store.get_latest_textbook_pipeline_job_for_session(context.session_id)
        if job is None:
            raise ToolExecutionError("parameter_error", f"textbook pipeline job not found: {task_id or 'latest'}")
        return job

    def _check_cancel(self, job_id: str) -> None:
        if self._store.is_textbook_pipeline_cancel_requested(job_id):
            raise TextbookPipelineCancelled("cancel requested")

    @staticmethod
    def _normalize_string_list(value: Any) -> list[str]:
        items = value if isinstance(value, list) else []
        return [str(item or "").strip() for item in items if str(item or "").strip()]

    @staticmethod
    def _build_folder_name(args: dict[str, Any], job_id: str) -> str:
        title = str(args.get("title") or "textbook").strip() or "textbook"
        suffix = str(job_id or "")[-8:] or "pages"
        return f"{title}_{suffix}"

    @staticmethod
    def _job_view(job: dict[str, Any]) -> dict[str, Any]:
        return {
            "taskId": job.get("job_id"),
            "status": job.get("status"),
            "phase": job.get("phase"),
            "workspaceId": job.get("workspace_id"),
            "jsonAssetId": job.get("json_asset_id"),
            "jsonFilePath": job.get("json_file_path"),
            "imageBatchAssetId": job.get("image_batch_asset_id"),
            "chapterSessionId": job.get("chapter_session_id"),
            "totalPages": job.get("total_pages"),
            "currentPage": job.get("current_page"),
            "currentFileName": job.get("current_file_name"),
            "successCount": job.get("success_count"),
            "failedCount": job.get("failed_count"),
            "currentChapterTitle": job.get("current_chapter_title"),
            "currentSectionTitle": job.get("current_section_title"),
            "dbImport": job.get("db_import"),
            "result": job.get("result"),
            "errorSummary": job.get("error_summary"),
            "cancelRequested": bool(job.get("cancel_requested")),
            "createdAt": job.get("created_at"),
            "updatedAt": job.get("updated_at"),
            "startedAt": job.get("started_at"),
            "finishedAt": job.get("finished_at"),
        }

    @staticmethod
    def _command_preview(tool_name: str, args: dict[str, Any]) -> list[str]:
        if tool_name == "start_textbook_extraction_job":
            return ["backend-http", "TEXTBOOK_PIPELINE", "start", str(args.get("title") or "")]
        if tool_name == "get_textbook_extraction_status":
            return ["sqlite", "TEXTBOOK_PIPELINE", "status", str(args.get("taskId") or "latest")]
        if tool_name == "cancel_textbook_extraction_job":
            return ["sqlite", "TEXTBOOK_PIPELINE", "cancel", str(args.get("taskId") or "latest")]
        return ["textbook-pipeline", tool_name]
