from __future__ import annotations

from pathlib import Path

from feishu_agent.cli_runner import CommandResult
from feishu_agent.tool_executor import ToolExecutor


class FakeRunner:
    def __init__(self, results: list[CommandResult]) -> None:
        self._results = list(results)
        self.calls: list[list[str]] = []

    def run(self, args: list[str]) -> CommandResult:
        self.calls.append(args)
        if not self._results:
            raise AssertionError("No fake result left for run()")
        return self._results.pop(0)


def _result(
    *,
    command: list[str],
    returncode: int,
    stdout: str = "",
    stderr: str = "",
    parsed_json=None,
) -> CommandResult:
    return CommandResult(
        command=command,
        returncode=returncode,
        stdout=stdout,
        stderr=stderr,
        duration_ms=1,
        parsed_json=parsed_json,
    )


def test_send_dm_falls_back_to_api_when_shortcut_switches_to_user_identity() -> None:
    primary = _result(
        command=["lark-cli", "im", "+messages-send"],
        returncode=1,
        stderr='{"ok":false,"identity":"user","error":{"type":"missing_scope","message":"missing required scope(s): im:message.send_as_user"}}',
        parsed_json={
            "ok": False,
            "identity": "user",
            "error": {
                "type": "missing_scope",
                "message": "missing required scope(s): im:message.send_as_user",
            },
        },
    )
    fallback = _result(
        command=["lark-cli", "api", "POST", "/open-apis/im/v1/messages"],
        returncode=0,
        stdout='{"ok":true,"identity":"bot","data":{"message_id":"om_123","chat_id":"oc_456","create_time":"2026-04-17 22:20:00"}}',
        parsed_json={
            "ok": True,
            "identity": "bot",
            "data": {
                "message_id": "om_123",
                "chat_id": "oc_456",
                "create_time": "2026-04-17 22:20:00",
            },
        },
    )
    runner = FakeRunner([primary, fallback])
    executor = ToolExecutor(runner)

    result, record = executor.execute(
        "send_dm",
        {
            "user_open_id": "ou_target",
            "text": "周灿宇你好\n请在明天前完成这道题。",
        },
    )

    assert result["message_id"] == "om_123"
    assert record.ok is True
    assert len(runner.calls) == 2
    assert runner.calls[0][:3] == ["im", "+messages-send", "--user-id"]
    assert runner.calls[1][:3] == ["api", "POST", "/open-apis/im/v1/messages"]
    assert "--as" in runner.calls[1]
    assert "bot" in runner.calls[1]


def test_send_dm_uses_shortcut_when_it_succeeds() -> None:
    primary = _result(
        command=["lark-cli", "im", "+messages-send"],
        returncode=0,
        stdout='{"ok":true,"identity":"bot","data":{"message_id":"om_789","chat_id":"oc_999","create_time":"2026-04-17 22:21:00"}}',
        parsed_json={
            "ok": True,
            "identity": "bot",
            "data": {
                "message_id": "om_789",
                "chat_id": "oc_999",
                "create_time": "2026-04-17 22:21:00",
            },
        },
    )
    runner = FakeRunner([primary])
    executor = ToolExecutor(runner)

    result, record = executor.execute(
        "send_dm",
        {
            "user_open_id": "ou_target",
            "text": "你好",
        },
    )

    assert result["message_id"] == "om_789"
    assert record.ok is True
    assert runner.calls == [["im", "+messages-send", "--user-id", "ou_target", "--text", "你好", "--as", "bot"]]


def test_search_user_falls_back_to_bot_when_user_authorization_is_missing() -> None:
    user_auth_error = _result(
        command=["lark-cli", "contact", "+search-user"],
        returncode=1,
        stderr='{"ok":false,"identity":"user","error":{"type":"permission","message":"API Call failed: need_user_authorization (user: ou_123)"}}',
        parsed_json={
            "ok": False,
            "identity": "user",
            "error": {
                "type": "permission",
                "message": "API Call failed: need_user_authorization (user: ou_123)",
            },
        },
    )
    departments = _result(
        command=["lark-cli", "api", "GET", "/open-apis/contact/v3/departments/0/children"],
        returncode=0,
        stdout='{"code":0,"data":{"has_more":false,"items":[{"open_department_id":"od_1"}]},"msg":"success"}',
        parsed_json={
            "code": 0,
            "data": {
                "has_more": False,
                "items": [{"open_department_id": "od_1"}],
            },
            "msg": "success",
        },
    )
    root_users = _result(
        command=["lark-cli", "api", "GET", "/open-apis/contact/v3/users/find_by_department"],
        returncode=0,
        stdout='{"code":0,"data":{"has_more":false,"items":[]},"msg":"success"}',
        parsed_json={
            "code": 0,
            "data": {"has_more": False, "items": []},
            "msg": "success",
        },
    )
    department_users = _result(
        command=["lark-cli", "api", "GET", "/open-apis/contact/v3/users/find_by_department"],
        returncode=0,
        stdout='{"code":0,"data":{"has_more":false,"items":[{"name":"肖铭俊","open_id":"ou_target"}]},"msg":"success"}',
        parsed_json={
            "code": 0,
            "data": {
                "has_more": False,
                "items": [{"name": "肖铭俊", "open_id": "ou_target"}],
            },
            "msg": "success",
        },
    )
    runner = FakeRunner([user_auth_error, departments, root_users, department_users])
    executor = ToolExecutor(runner)

    result, record = executor.execute("search_user", {"name": "肖铭俊"})

    assert result["matches"][0]["open_id"] == "ou_target"
    assert record.ok is True
    assert len(runner.calls) == 4
    assert "--as" in runner.calls[0] and "user" in runner.calls[0]
    assert runner.calls[1][:3] == ["api", "GET", "/open-apis/contact/v3/departments/0/children"]
    assert "--as" in runner.calls[1] and "bot" in runner.calls[1]
    assert runner.calls[2][:3] == ["api", "GET", "/open-apis/contact/v3/users/find_by_department"]
    assert runner.calls[3][:3] == ["api", "GET", "/open-apis/contact/v3/users/find_by_department"]


def test_send_dm_can_send_image_attachment(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    image_path = tmp_path / "screenshot.png"
    image_path.write_bytes(b"fake image")
    primary = _result(
        command=["lark-cli", "im", "+messages-send"],
        returncode=0,
        stdout='{"ok":true,"identity":"bot","data":{"message_id":"om_img","chat_id":"oc_999","create_time":"2026-04-30 15:08:00"}}',
        parsed_json={
            "ok": True,
            "identity": "bot",
            "data": {
                "message_id": "om_img",
                "chat_id": "oc_999",
                "create_time": "2026-04-30 15:08:00",
            },
        },
    )
    runner = FakeRunner([primary])
    executor = ToolExecutor(runner)

    result, record = executor.execute(
        "send_dm",
        {
            "user_open_id": "ou_target",
            "attachment_paths": [str(image_path)],
        },
    )

    assert result["message_id"] == "om_img"
    assert result["attachment_count"] == 1
    assert record.ok is True
    assert runner.calls == [["im", "+messages-send", "--user-id", "ou_target", "--image", "./screenshot.png", "--as", "bot"]]


def test_reply_message_uses_bot_message_reply_shortcut() -> None:
    primary = _result(
        command=["lark-cli", "im", "+messages-reply"],
        returncode=0,
        stdout='{"ok":true,"identity":"bot","data":{"message_id":"om_reply","chat_id":"oc_group","create_time":"2026-04-30 12:45:00"}}',
        parsed_json={
            "ok": True,
            "identity": "bot",
            "data": {
                "message_id": "om_reply",
                "chat_id": "oc_group",
                "create_time": "2026-04-30 12:45:00",
            },
        },
    )
    runner = FakeRunner([primary])
    executor = ToolExecutor(runner)

    result, record = executor.execute(
        "reply_message",
        {
            "message_id": "om_target",
            "text": "1",
        },
    )

    assert result["message_id"] == "om_reply"
    assert record.ok is True
    assert runner.calls == [["im", "+messages-reply", "--message-id", "om_target", "--text", "1", "--as", "bot"]]


def test_reply_message_falls_back_to_api_reply() -> None:
    primary = _result(
        command=["lark-cli", "im", "+messages-reply"],
        returncode=1,
        stderr='{"ok":false,"error":{"type":"tool_error","message":"shortcut failed"}}',
        parsed_json={"ok": False, "error": {"type": "tool_error", "message": "shortcut failed"}},
    )
    fallback = _result(
        command=["lark-cli", "api", "POST", "/open-apis/im/v1/messages/om_target/reply"],
        returncode=0,
        stdout='{"code":0,"data":{"message_id":"om_reply","chat_id":"oc_group","create_time":"2026-04-30 12:45:00"}}',
        parsed_json={
            "code": 0,
            "data": {
                "message_id": "om_reply",
                "chat_id": "oc_group",
                "create_time": "2026-04-30 12:45:00",
            },
        },
    )
    runner = FakeRunner([primary, fallback])
    executor = ToolExecutor(runner)

    result, record = executor.execute(
        "reply_message",
        {
            "message_id": "om_target",
            "text": "1",
        },
    )

    assert result["message_id"] == "om_reply"
    assert record.ok is True
    assert len(runner.calls) == 2
    assert runner.calls[0][:3] == ["im", "+messages-reply", "--message-id"]
    assert runner.calls[1][:3] == ["api", "POST", "/open-apis/im/v1/messages/om_target/reply"]
    assert "--as" in runner.calls[1] and "bot" in runner.calls[1]


def test_get_chat_messages_lists_user_chats_and_fetches_daily_messages() -> None:
    chats = _result(
        command=["lark-cli", "im", "chats", "list"],
        returncode=0,
        stdout=(
            '{"code":0,"data":{"has_more":false,"items":['
            '{"chat_id":"oc_target","name":"AI作业批改系统","chat_status":"normal","tenant_key":"tenant_1"},'
            '{"chat_id":"oc_other","name":"别的群","chat_status":"normal","tenant_key":"tenant_1"}'
            '],"page_token":""},"msg":"success"}'
        ),
        parsed_json={
            "code": 0,
            "data": {
                "has_more": False,
                "items": [
                    {
                        "chat_id": "oc_target",
                        "name": "AI作业批改系统",
                        "chat_status": "normal",
                        "tenant_key": "tenant_1",
                    },
                    {
                        "chat_id": "oc_other",
                        "name": "别的群",
                        "chat_status": "normal",
                        "tenant_key": "tenant_1",
                    },
                ],
                "page_token": "",
            },
            "msg": "success",
        },
    )
    messages = _result(
        command=["lark-cli", "im", "+chat-messages-list"],
        returncode=0,
        stdout=(
            '{"ok":true,"identity":"user","data":{"has_more":false,"messages":['
            '{"message_id":"om_1","create_time":"2026-04-17 23:23","msg_type":"text",'
            '"content":"我们分配过任务了","deleted":false,"updated":false,'
            '"sender":{"id":"ou_sender","id_type":"open_id","name":"Khan","sender_type":"user"}}'
            '],"page_token":"","total":1}}'
        ),
        parsed_json={
            "ok": True,
            "identity": "user",
            "data": {
                "has_more": False,
                "messages": [
                    {
                        "message_id": "om_1",
                        "create_time": "2026-04-17 23:23",
                        "msg_type": "text",
                        "content": "我们分配过任务了",
                        "deleted": False,
                        "updated": False,
                        "sender": {
                            "id": "ou_sender",
                            "id_type": "open_id",
                            "name": "Khan",
                            "sender_type": "user",
                        },
                    }
                ],
                "page_token": "",
                "total": 1,
            },
        },
    )
    runner = FakeRunner([chats, messages])
    executor = ToolExecutor(runner)

    result, record = executor.execute(
        "get_chat_messages",
        {
            "chat_name": "AI作业批改系统",
            "date": "2026-04-17",
        },
    )

    assert result["matched"] is True
    assert result["chat"]["chat_id"] == "oc_target"
    assert result["total"] == 1
    assert result["messages"][0]["content"] == "我们分配过任务了"
    assert runner.calls[0][:3] == ["im", "chats", "list"]
    assert runner.calls[1][:2] == ["im", "+chat-messages-list"]
    assert "--as" in runner.calls[0] and "user" in runner.calls[0]
    assert "--as" in runner.calls[1] and "user" in runner.calls[1]
    assert "2026-04-17T00:00:00+08:00" in runner.calls[1]
    assert "2026-04-18T00:00:00+08:00" in runner.calls[1]
    assert record.ok is True


def test_get_chat_messages_falls_back_to_bot_when_user_authorization_is_missing() -> None:
    user_auth_error = _result(
        command=["lark-cli", "im", "chats", "list"],
        returncode=1,
        stderr='{"ok":false,"identity":"user","error":{"type":"permission","message":"API Call failed: need_user_authorization (user: ou_123)"}}',
        parsed_json={
            "ok": False,
            "identity": "user",
            "error": {
                "type": "permission",
                "message": "API Call failed: need_user_authorization (user: ou_123)",
            },
        },
    )
    bot_chats = _result(
        command=["lark-cli", "im", "chats", "list"],
        returncode=0,
        stdout=(
            '{"code":0,"data":{"has_more":false,"items":['
            '{"chat_id":"oc_target","name":"110实验室","chat_status":"normal","tenant_key":"tenant_1"}'
            '],"page_token":""},"msg":"success"}'
        ),
        parsed_json={
            "code": 0,
            "data": {
                "has_more": False,
                "items": [
                    {
                        "chat_id": "oc_target",
                        "name": "110实验室",
                        "chat_status": "normal",
                        "tenant_key": "tenant_1",
                    }
                ],
                "page_token": "",
            },
            "msg": "success",
        },
    )
    bot_messages = _result(
        command=["lark-cli", "im", "+chat-messages-list"],
        returncode=0,
        stdout=(
            '{"ok":true,"identity":"bot","data":{"has_more":false,"messages":['
            '{"message_id":"om_need_reply","create_time":"2026-04-30 12:31","msg_type":"text",'
            '"content":"@_all 填完了的在这条消息中回复1","deleted":false,"updated":false,'
            '"sender":{"id":"ou_sender","id_type":"open_id","name":"Khan","sender_type":"user"}}'
            '],"page_token":"","total":1}}'
        ),
        parsed_json={
            "ok": True,
            "identity": "bot",
            "data": {
                "has_more": False,
                "messages": [
                    {
                        "message_id": "om_need_reply",
                        "create_time": "2026-04-30 12:31",
                        "msg_type": "text",
                        "content": "@_all 填完了的在这条消息中回复1",
                        "deleted": False,
                        "updated": False,
                        "sender": {
                            "id": "ou_sender",
                            "id_type": "open_id",
                            "name": "Khan",
                            "sender_type": "user",
                        },
                    }
                ],
                "page_token": "",
                "total": 1,
            },
        },
    )
    runner = FakeRunner([user_auth_error, bot_chats, bot_messages])
    executor = ToolExecutor(runner)

    result, record = executor.execute(
        "get_chat_messages",
        {
            "chat_name": "110实验室",
            "date": "2026-04-30",
        },
    )

    assert result["matched"] is True
    assert result["identity"] == "bot"
    assert result["messages"][0]["message_id"] == "om_need_reply"
    assert runner.calls[0][:3] == ["im", "chats", "list"]
    assert "--as" in runner.calls[0] and "user" in runner.calls[0]
    assert runner.calls[1][:3] == ["im", "chats", "list"]
    assert "--as" in runner.calls[1] and "bot" in runner.calls[1]
    assert runner.calls[2][:2] == ["im", "+chat-messages-list"]
    assert "--as" in runner.calls[2] and "bot" in runner.calls[2]
    assert record.ok is True


def test_get_chat_messages_returns_candidates_when_chat_name_is_ambiguous() -> None:
    chats = _result(
        command=["lark-cli", "im", "chats", "list"],
        returncode=0,
        stdout=(
            '{"code":0,"data":{"has_more":false,"items":['
            '{"chat_id":"oc_1","name":"AI作业批改系统","chat_status":"normal"},'
            '{"chat_id":"oc_2","name":"AI作业批改系统","chat_status":"normal"}'
            '],"page_token":""},"msg":"success"}'
        ),
        parsed_json={
            "code": 0,
            "data": {
                "has_more": False,
                "items": [
                    {"chat_id": "oc_1", "name": "AI作业批改系统", "chat_status": "normal"},
                    {"chat_id": "oc_2", "name": "AI作业批改系统", "chat_status": "normal"},
                ],
                "page_token": "",
            },
            "msg": "success",
        },
    )
    runner = FakeRunner([chats])
    executor = ToolExecutor(runner)

    result, record = executor.execute(
        "get_chat_messages",
        {
            "chat_name": "AI作业批改系统",
            "date": "2026-04-17",
        },
    )

    assert result["matched"] is False
    assert result["total"] == 0
    assert [item["chat_id"] for item in result["candidates"]] == ["oc_1", "oc_2"]
    assert len(runner.calls) == 1
    assert record.ok is True
