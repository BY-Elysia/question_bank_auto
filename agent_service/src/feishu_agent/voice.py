from __future__ import annotations

import contextlib
import io
import shutil
import uuid
from pathlib import Path
from typing import Any


class VoiceSynthesisError(RuntimeError):
    pass


class VoiceSynthesizer:
    def __init__(
        self,
        *,
        space_name: str,
        api_name: str,
        output_dir: Path,
        speaker: str,
        language: str,
        speed: float = 1.0,
        is_symbol: bool = False,
        hf_token: str | None = None,
    ) -> None:
        self._space_name = space_name
        self._api_name = api_name
        self._output_dir = output_dir
        self._speaker = speaker
        self._language = language
        self._speed = speed
        self._is_symbol = is_symbol
        self._hf_token = hf_token or None
        self._client: Any | None = None

    def synthesize(self, text: str) -> Path:
        normalized = " ".join(str(text or "").split()).strip()
        if not normalized:
            raise VoiceSynthesisError("empty text cannot be synthesized")

        try:
            result = self._predict(normalized)
        except VoiceSynthesisError:
            raise
        except Exception as exc:  # pragma: no cover - network/runtime failure path
            raise VoiceSynthesisError(f"TTS request failed: {exc}") from exc

        source_path = self._extract_audio_path(result)
        if not source_path.exists():
            raise VoiceSynthesisError(f"TTS output file not found: {source_path}")

        self._output_dir.mkdir(parents=True, exist_ok=True)
        suffix = source_path.suffix or ".wav"
        target_path = self._output_dir / f"tts-{uuid.uuid4().hex}{suffix}"
        shutil.copy2(source_path, target_path)
        return target_path

    def _predict(self, normalized: str) -> Any:
        client = self._get_client()
        try:
            return client.predict(
                text=normalized,
                speaker=self._speaker,
                language=self._language,
                speed=self._speed,
                is_symbol=self._is_symbol,
                api_name=self._api_name,
            )
        except Exception as exc:  # pragma: no cover - network/runtime failure path
            # A cached Gradio client can become stale after a transient HF Space
            # disconnect. Clear it once and retry with a fresh client.
            self._client = None
            try:
                return self._get_client().predict(
                    text=normalized,
                    speaker=self._speaker,
                    language=self._language,
                    speed=self._speed,
                    is_symbol=self._is_symbol,
                    api_name=self._api_name,
                )
            except Exception as retry_exc:
                raise VoiceSynthesisError(f"TTS request failed: {retry_exc}") from exc

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client
        try:
            from gradio_client import Client
        except ImportError as exc:  # pragma: no cover - depends on runtime env
            raise VoiceSynthesisError("gradio_client is not installed") from exc

        kwargs: dict[str, Any] = {}
        if self._hf_token:
            kwargs["hf_token"] = self._hf_token
        kwargs["verbose"] = False
        kwargs["httpx_kwargs"] = {
            "trust_env": False,
            "timeout": 30.0,
        }
        # gradio_client prints a checkmark banner during initialization, which can
        # crash on Windows terminals that still use a GBK code page.
        with contextlib.redirect_stdout(io.StringIO()):
            self._client = Client(self._space_name, **kwargs)
        return self._client

    def _extract_audio_path(self, result: Any) -> Path:
        candidate = result
        if isinstance(result, (list, tuple)):
            if len(result) < 2:
                raise VoiceSynthesisError("TTS result does not contain audio output")
            candidate = result[1]
        path = Path(str(candidate)).expanduser()
        return path.resolve()
