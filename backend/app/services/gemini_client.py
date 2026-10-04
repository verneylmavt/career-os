"""Bounded, asynchronous Gemini adapter with validated structured output.

The repository owns caching and stale-write checks. This adapter only performs a
single logical operation, with one retry for transport or server failures.
"""

import asyncio
import json
import logging
import os
import threading
import time
from collections.abc import Mapping
from contextlib import asynccontextmanager
from typing import Any, TypeVar

import httpx
from google import genai
from google.genai import errors, types
from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)
Output = TypeVar("Output", bound=BaseModel)
_PROCESS_SLOTS = threading.BoundedSemaphore(2)


class _MetricsFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        # Deliberately allow only operational fields, never prompts or exceptions.
        fields = ("operation", "model", "prompt_version", "latency_ms", "status",
                  "input_tokens", "output_tokens", "total_tokens")
        return json.dumps({"event": "gemini_generation", **{field: getattr(record, field, None) for field in fields}})


class _MetricsHandler(logging.StreamHandler):
    def __init__(self):
        super().__init__()
        self.setFormatter(_MetricsFormatter())
        self.addFilter(lambda record: record.msg == "gemini_generation")


def configure_generation_logging() -> None:
    """Emit safe JSON metrics in the ordinary local server configuration."""
    if not any(isinstance(handler, _MetricsHandler) for handler in logger.handlers):
        logger.addHandler(_MetricsHandler())
    logger.setLevel(logging.INFO)

_PROMPT_VERSIONS = {
    "extraction": "profile-evidence-v1",
    "search": "curated-filters-v1",
    "tailor": "grounded-resume-v1",
    "cover_letter": "grounded-letter-v1",
    "dossier": "posting-brief-v1",
    "questions": "six-question-rubric-v1",
    "evaluation": "canonical-answer-rubric-v1",
}


class GenerationError(Exception):
    """A public, sanitized failure; never includes provider response content."""

    def __init__(self, status_code: int, detail: str, code: str, retryable: bool = False,
                 headers: dict[str, str] | None = None):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
        self.code = code
        self.retryable = retryable
        self.headers = headers or {}


@asynccontextmanager
async def _process_slot():
    # A threading semaphore keeps the limit process-wide, including multiple app
    # instances/event loops. Nonblocking acquisition cannot strand a worker when
    # a caller is cancelled while queued.
    while not _PROCESS_SLOTS.acquire(blocking=False):
        await asyncio.sleep(0.01)
    try:
        yield
    finally:
        _PROCESS_SLOTS.release()


class GeminiProvider:
    def __init__(self, client: Any = None, environment: Mapping[str, str] | None = None,
                 deadline: float = 60, retry_delay: float = 0.25):
        self._client = client
        self._owns_client = client is None
        self._environment = dict(os.environ if environment is None else environment)
        self.deadline = deadline
        self.retry_delay = retry_delay

    def model_for(self, operation: str) -> str:
        if operation not in _PROMPT_VERSIONS:
            raise ValueError(f"Unknown generation operation: {operation}")
        env = self._environment
        operation_override = env.get(f"GEMINI_MODEL_{operation.upper()}", "").strip()
        group_override = ""
        if operation in {"tailor", "cover_letter", "dossier", "questions", "evaluation"}:
            group_override = env.get("GEMINI_MODEL_WRITING", "").strip()
        return (operation_override or group_override or env.get("GEMINI_MODEL", "").strip()
                or ("gemini-3.5-flash-lite" if operation in {"extraction", "search"} else "gemini-3.8-flash"))

    def prompt_version(self, operation: str) -> str:
        return _PROMPT_VERSIONS[operation]

    async def aclose(self) -> None:
        if not self._owns_client or self._client is None:
            return
        client, self._client = self._client, None
        try:
            await client.aio.aclose()
        finally:
            await asyncio.to_thread(client.close)

    def _get_client(self):
        if self._client is None:
            api_key = self._environment.get("GEMINI_API_KEY", "").strip()
            if not api_key:
                raise GenerationError(503, "Set GEMINI_API_KEY on the backend to enable AI generation.",
                                      "provider_unconfigured")
            self._client = genai.Client(
                api_key=api_key,
                http_options=types.HttpOptions(
                    timeout=60_000,
                    # Disable hidden SDK retries so the logical operation has
                    # exactly the retry policy defined below, including quota.
                    retry_options=types.HttpRetryOptions(attempts=1),
                ),
            )
        return self._client

    async def generate(self, operation: str, system: str, user: str,
                       response_schema: type[Output]) -> Output:
        started = time.monotonic()
        status = "failed"
        tokens: dict[str, int | None] = {"input_tokens": None, "output_tokens": None, "total_tokens": None}
        model = self.model_for(operation)
        try:
            async with asyncio.timeout(self.deadline):
                async with _process_slot():
                    config = types.GenerateContentConfig(
                        system_instruction=system,
                        response_mime_type="application/json",
                        # Raw JSON Schema avoids the SDK's legacy Schema conversion
                        # emitting unsupported additional_properties for configured 2.x models.
                        response_json_schema=response_schema.model_json_schema(),
                        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
                    )
                    if model.startswith("gemini-3") and "flash-lite" not in model:
                        config.thinking_config = types.ThinkingConfig(thinking_level="LOW")
                    client = self._get_client()
                    response = None
                    for attempt in range(2):
                        try:
                            response = await client.aio.models.generate_content(
                                model=model, contents=user, config=config,
                            )
                            break
                        except (httpx.TransportError, errors.ServerError) as exc:
                            if attempt == 0:
                                await asyncio.sleep(self.retry_delay)
                                continue
                            raise GenerationError(502, "The AI service is temporarily unavailable. Try again.",
                                                  "provider_unavailable", True) from exc
                        except errors.ClientError as exc:
                            if exc.code == 429:
                                raw = getattr(exc, "response", None)
                                retry_after = getattr(raw, "headers", {}).get("Retry-After") if raw else None
                                headers = {"Retry-After": retry_after} if retry_after else None
                                raise GenerationError(429, "The AI service reached its quota. Try again later.",
                                                      "provider_quota", True, headers) from exc
                            raise GenerationError(502, "The AI service could not complete this request.",
                                                  "provider_rejected") from exc
                    tokens = self._usage(response)
                    feedback = getattr(response, "prompt_feedback", None)
                    block_reason = getattr(feedback, "block_reason", None)
                    block_value = getattr(block_reason, "value", block_reason)
                    if block_value and str(block_value) not in {
                        "0", "BLOCK_REASON_UNSPECIFIED", "BLOCKED_REASON_UNSPECIFIED",
                    }:
                        raise GenerationError(502, "The AI service blocked this request. Review the source text.",
                                              "generation_blocked")
                    candidates = getattr(response, "candidates", None) or []
                    for candidate in candidates:
                        finish_reason = getattr(candidate, "finish_reason", "")
                        reason = str(getattr(finish_reason, "value", finish_reason))
                        if any(value in reason for value in ("SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT")):
                            raise GenerationError(502, "The AI service blocked the generated response.",
                                                  "generation_blocked")
                    raw_text = getattr(response, "text", None)
                    if not isinstance(raw_text, str) or not raw_text.strip():
                        raise GenerationError(502, "The AI service returned no usable output. Try generating again.",
                                              "generation_empty")
                    try:
                        result = response_schema.model_validate_json(raw_text)
                    except (ValidationError, ValueError) as exc:
                        raise GenerationError(502, "The AI response did not meet the expected format. Try generating again.",
                                              "generation_invalid") from exc
                    status = "success"
                    return result
        except TimeoutError as exc:
            status = "generation_timeout"
            raise GenerationError(504, "AI generation took too long. Your saved work is unchanged; try again.",
                                  "generation_timeout", True) from exc
        except GenerationError as exc:
            status = exc.code
            raise
        except asyncio.CancelledError:
            status = "cancelled"
            raise
        except Exception as exc:
            status = "provider_unavailable"
            raise GenerationError(502, "The AI service could not complete this request. Try again.",
                                  "provider_unavailable", True) from exc
        finally:
            logger.info("gemini_generation", extra={
                "operation": operation,
                "model": model,
                "prompt_version": self.prompt_version(operation),
                "latency_ms": round((time.monotonic() - started) * 1000),
                "status": status,
                **tokens,
            })

    @staticmethod
    def _usage(response: Any) -> dict[str, int | None]:
        usage = getattr(response, "usage_metadata", None)
        return {
            "input_tokens": getattr(usage, "prompt_token_count", None),
            "output_tokens": getattr(usage, "candidates_token_count", None),
            "total_tokens": getattr(usage, "total_token_count", None),
        }
