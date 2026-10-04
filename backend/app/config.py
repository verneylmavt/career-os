"""Runtime configuration without eager model client creation."""
import os
from pathlib import Path


def database_path() -> Path:
    return Path(os.getenv("CAREEROS_DB_PATH", str(Path(__file__).resolve().parents[1] / ".data" / "careeros.sqlite3")))
