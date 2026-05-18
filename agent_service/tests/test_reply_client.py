from __future__ import annotations

from feishu_agent.auto_reply import ReplyClient
from feishu_agent.cli_runner import CommandResult


class FakeRunner:
    def __init__(self, outcomes: list[CommandResult | Exception]) -> None:
        self._outcomes = list(outcomes)
        self.calls: list[list[str]] = []

    def run(self, args: list[str]) -> CommandResult:
        self.calls.append(args)
        if not self._outcomes:
            raise AssertionError("No fake outcome left for run()")
        outcome = self._outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


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


def test_reply_client_falls_back_to_api_chat_send_after_multiple_failures() -> None:
    runner = FakeRunner(
        [
            _result(
                command=["lark-cli", "im", "+messages-reply"],
                returncode=1,
                stderr='{"ok":false,"identity":"user","error":{"type":"missing_scope","message":"missing required scope(s): im:message.send_as_user"}}',
            ),
            FileNotFoundError(2, "系统找不到指定的文件。"),
            _result(
                command=["lark-cli", "api", "POST", "/open-apis/im/v1/messages"],
                returncode=0,
                stdout='{"code":0,"msg":"success"}',
                parsed_json={"code": 0, "msg": "success"},
            ),
        ]
    )
    client = ReplyClient(runner)

    client.reply_text("om_reply_target", "你好呀", chat_id="oc_chat_target")

    assert len(runner.calls) == 3
    assert runner.calls[0][:3] == ["im", "+messages-reply", "--message-id"]
    assert runner.calls[1][:3] == ["api", "POST", "/open-apis/im/v1/messages/om_reply_target/reply"]
    assert runner.calls[2][:3] == ["api", "POST", "/open-apis/im/v1/messages"]


def test_reply_client_stops_after_shortcut_success() -> None:
    runner = FakeRunner(
        [
            _result(
                command=["lark-cli", "im", "+messages-reply"],
                returncode=0,
                stdout='{"ok":true,"identity":"bot"}',
                parsed_json={"ok": True, "identity": "bot"},
            )
        ]
    )
    client = ReplyClient(runner)

    client.reply_text("om_reply_target", "收到啦", chat_id="oc_chat_target")

    assert runner.calls == [["im", "+messages-reply", "--message-id", "om_reply_target", "--text", "收到啦", "--as", "bot"]]
