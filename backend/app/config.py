"""Runtime configuration without eager model client creation."""
import os
from pathlib import Path


def database_path() -> Path:
    return Path(os.getenv("CAREEROS_DB_PATH", str(Path(__file__).resolve().parents[1] / ".data" / "careeros.sqlite3")))


def generation_model() -> str:
    return os.getenv("GEMINI_MODEL", "gemini-3.8-flash")


PROMPT_VERSION = "career-os-v1"
