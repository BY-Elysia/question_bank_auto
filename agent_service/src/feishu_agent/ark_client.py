from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from openai import OpenAI


@dataclass
class FunctionCall:
    name: str
    arguments: dict[str, Any]
    call_id: str | None = None


@dataclass
class ArkResponse:
    text: str | None
    function_calls: list[FunctionCall]
    raw: dict[str, Any]


class ArkClient:
    def __init__(self, *, api_key: str, base_url: str, model: str) -> None:
        self._model = model
        self._api_key = api_key
        self._base_url = base_url
        self._client = OpenAI(api_key=api_key, base_url=base_url)

    def create_response(
        self,
        prompt: str,
        tools: list[dict[str, Any]],
        *,
        api_key_override: str | None = None,
    ) -> ArkResponse:
        client = self._client
        if api_key_override:
            client = OpenAI(api_key=api_key_override, base_url=self._base_url)
        response = client.responses.create(
            model=self._model,
            input=prompt,
            tools=tools,
        )
        payload = response.model_dump() if hasattr(response, "model_dump") else dict(response)
        return self._parse_response(payload)

    def _parse_response(self, payload: dict[str, Any]) -> ArkResponse:
        function_calls: list[FunctionCall] = []
        text = payload.get("output_text")

        for item in payload.get("output", []) or []:
            item_type = item.get("type")
            if item_type == "function_call":
                raw_arguments = item.get("arguments") or "{}"
                function_calls.append(
                    FunctionCall(
                        name=item["name"],
                        arguments=json.loads(raw_arguments),
                        call_id=item.get("call_id"),
                    )
                )
                continue
            if item_type == "message" and not text:
                parts = item.get("content") or []
                texts = []
                for part in parts:
                    if part.get("type") in {"output_text", "text"}:
                        value = part.get("text")
                        if isinstance(value, dict):
                            value = value.get("value")
                        if value:
                            texts.append(str(value))
                if texts:
                    text = "\n".join(texts).strip()

        return ArkResponse(text=text, function_calls=function_calls, raw=payload)

