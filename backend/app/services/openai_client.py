"""Gemini AI client — drop-in replacement with the same chat_json / chat_text interface."""
import json
import os
from typing import Any

from fastapi import HTTPException
from google import genai
from google.genai import types
from google.genai.errors import ClientError

_client: genai.Client | None = None


def get_client() -> genai.Client:
    global _client
    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise HTTPException(
                status_code=503,
                detail="GEMINI_API_KEY is not set on the server. Copy .env.example to .env and add your key, then restart the backend.",
            )
        _client = genai.Client(api_key=api_key)
    return _client


def get_model() -> str:
    return os.getenv("GEMINI_MODEL", "gemini-2.5-flash")


def _handle_client_error(e: ClientError) -> None:
    if e.code == 429:
        raise HTTPException(
            status_code=429,
            detail=(
                "Gemini API quota exceeded. "
                "Try switching to GEMINI_MODEL=gemini-1.5-flash in your .env, "
                "or enable billing at https://ai.google.dev/gemini-api/docs/billing"
            ),
        )
    raise HTTPException(status_code=502, detail=f"Gemini API error: {e}")


def chat_json(system: str, user: str, schema_hint: str | None = None) -> dict[str, Any]:
    """Call Gemini in JSON mode and return parsed dict."""
    sys_prompt = system
    if schema_hint:
        sys_prompt += f"\n\nReturn ONLY valid JSON matching this shape:\n{schema_hint}"
    sys_prompt += "\n\nRespond with valid JSON only — no markdown fences, no commentary."

    try:
        resp = get_client().models.generate_content(
            model=get_model(),
            contents=user,
            config=types.GenerateContentConfig(
                system_instruction=sys_prompt,
                response_mime_type="application/json",
                temperature=0.4,
            ),
        )
    except ClientError as e:
        _handle_client_error(e)

    content = resp.text or "{}"
    content = content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[-1].rsplit("```", 1)[0]
    return json.loads(content)


def chat_text(system: str, user: str, temperature: float = 0.6) -> str:
    """Call Gemini for freeform text."""
    try:
        resp = get_client().models.generate_content(
            model=get_model(),
            contents=user,
            config=types.GenerateContentConfig(
                system_instruction=system,
                temperature=temperature,
            ),
        )
    except ClientError as e:
        _handle_client_error(e)

    return resp.text or ""
