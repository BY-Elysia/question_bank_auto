from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def get_shanghai_now_text() -> str:
    try:
        tz = ZoneInfo("Asia/Shanghai")
    except ZoneInfoNotFoundError:
        # Windows may not provide IANA timezone data unless tzdata is installed.
        tz = timezone(timedelta(hours=8), name="UTC+08")
    return datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S %Z")


def build_policy_prompt() -> str:
    return """你是一个可调用飞书白名单工具的 agent。

全局规则：
1. 优先使用工具，不要编造 open_id、chat_id、文档链接、消息结果或权限状态。
2. 用户资源默认使用 user 身份，机器人外发消息默认使用 bot 身份。
3. 当用户只提供姓名但目标是发消息时，必须先调用 search_user，再决定是否调用 send_dm。
4. 如果 search_user 返回多个候选，不要继续写操作，直接让用户澄清。
5. 写操作由后端二次确认；你仍然应该提出明确、参数完整的函数调用。
6. 遇到权限不足、scope 缺失、机器人可用范围不足时，直接说明原因，不要反复重试。
7. 工具结果是真实事实，优先级高于你的猜测；禁止忽略已经返回的工具结果。
8. 如果 search_user 的结果里 matches 恰好为 1，且用户意图是“给某人发消息/发私聊/发送内容”，则下一步必须调用 send_dm；不要直接输出自然语言结论。
9. 只有在 search_user 的 matches 为 0 时，才能告诉用户“未搜索到用户”。
10. 如果用户是在让你“代写消息”而不是直接提供逐字正文，例如“介绍一下你自己”“帮我问候他”“提醒他明天开会”“给周灿宇发一道数学分析的题，让他明天之前完成”，你需要先形成最终要发送的文案，再调用 send_dm；不要把原指令逐字当成消息正文。
11. 回复默认使用简洁中文。
12. 在爱弥斯口吻下，优先使用颜文字，不要使用 `😉👉` 这类手势感很强的 emoji。
13. 当用户是在表达情绪、焦虑、迷茫、低落，或只是普通聊天时，不要机械地把结尾转成“如果有飞书任务/工作事项我可以帮你处理”；除非用户明确提出任务需求，否则先专注于陪伴、安慰、澄清和自然对话。"""


def format_attachment_metadata(metadata: dict | None) -> list[dict]:
    if not isinstance(metadata, dict):
        return []
    attachments = metadata.get("attachments")
    if not isinstance(attachments, list):
        return []
    items = []
    for attachment in attachments:
        if not isinstance(attachment, dict):
            continue
        attachment_id = str(attachment.get("attachment_id") or "").strip()
        if not attachment_id:
            continue
        items.append(
            {
                "attachment_id": attachment_id,
                "file_name": str(attachment.get("original_name") or "").strip(),
                "content_type": str(attachment.get("content_type") or "").strip(),
                "size_bytes": int(attachment.get("size_bytes") or 0),
            }
        )
    return items


def build_prompt(
    *,
    persona_prompt: str,
    policy_prompt: str,
    skill_guidance: list[str],
    history: list[dict],
    latest_user_message: str,
    tool_events: list[dict],
    source: str,
    latest_user_metadata: dict | None = None,
) -> str:
    now = get_shanghai_now_text()
    lines = [
        "【Persona】",
        persona_prompt,
        "",
        "【Policy】",
        policy_prompt,
        "",
        f"当前时间（Asia/Shanghai）：{now}",
        f"调用来源：{source}",
    ]

    if skill_guidance:
        lines.append("")
        lines.append("【Skill Guidance】")
        lines.extend(skill_guidance)

    if history:
        lines.append("")
        lines.append("历史对话：")
        for item in history:
            role = item["role"]
            prefix = "用户" if role == "user" else "助手"
            lines.append(f"{prefix}: {item['content']}")
            attachments = format_attachment_metadata(item.get("metadata") if isinstance(item, dict) else None)
            if attachments:
                lines.append(f"{prefix}附件: {json.dumps(attachments, ensure_ascii=False)}")

    lines.append("")
    lines.append(f"本轮用户消息：{latest_user_message}")
    latest_attachments = format_attachment_metadata(latest_user_metadata)
    if latest_attachments:
        lines.append("本轮附件清单（工具参数 attachment_ids 必须使用这里的 attachment_id，不要编造）:")
        lines.append(json.dumps(latest_attachments, ensure_ascii=False))

    if tool_events:
        lines.append("")
        lines.append("本轮已执行工具结果（必须严格依据这些结果继续决策，不能忽略）：")
        for event in tool_events:
            lines.append(
                json.dumps(
                    {
                        "tool": event["tool"],
                        "arguments": event["arguments"],
                        "result": event["result"],
                    },
                    ensure_ascii=False,
                )
            )
        lines.append(
            "决策约束：如果 search_user 返回唯一 match，且用户意图是发消息，则继续调用 send_dm；如果返回 0 个 match，才说明未找到；如果返回多个 match，要求用户澄清。"
        )

    lines.append("")
    lines.append("如果无需工具，直接给出最终答复。")
    return "\n".join(lines)
