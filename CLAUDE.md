# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (FastAPI)

```bash
cd backend

# Create venv (first time)
python -m venv .venv
.\.venv\Scripts\Activate.ps1          # Windows
source .venv/bin/activate             # macOS/Linux
pip install -r requirements.txt

# Run dev server (auto-reload)
uvicorn app.main:app --reload --port 8000

# Syntax-check a single file without running
python -m py_compile app/routers/jobs.py
```

### Frontend (Next.js)

```bash
cd frontend
npm install          # first time
npm run dev          # dev server on :3000
npm run build        # production build (also type-checks)
npx tsc --noEmit     # type-check only, no emit
npm run lint         # ESLint via next lint
```

There are no automated tests in this codebase.

## Architecture

### Request flow

```
Browser → Next.js (:3000)
  └─ /api/* → catch-all proxy (frontend/app/api/[...path]/route.ts)
                └─ FastAPI (:8000)  ← loads .env from repo root
```

The proxy at `frontend/app/api/[...path]/route.ts` forwards every `/api/*` call verbatim to `API_BASE` (default `http://localhost:8000`). This means:
- There is no CORS issue — the browser only ever talks to Next.js.
- `API_BASE` is a **server-side-only** env var (no `NEXT_PUBLIC_` prefix).
- Multipart form data (`/api/profile/upload`) is forwarded as a raw blob to preserve the `Content-Type: multipart/form-data; boundary=…` header.

### Backend state model

`backend/app/store.py` holds a single module-level `store` instance. It is a plain Python object — no database, no persistence. **All state resets on server restart.** Every router imports this singleton directly:

```python
from ..store import store
```

The store holds: `profile` dict, `shortlist` dict keyed by `job_id`, `tailored_resumes`, `cover_letters`, and `interview_sessions`.

### Gemini AI client

`backend/app/services/openai_client.py` (misleadingly named — it wraps `google-genai`, not OpenAI) exposes two helpers used throughout all routers:

- `chat_json(system, user, schema_hint)` — calls Gemini with `response_mime_type="application/json"`, strips markdown fences, returns a parsed dict.
- `chat_text(system, user, temperature)` — freeform text response.

Model is read from `GEMINI_MODEL` env var (default `gemini-2.5-flash`). The client is lazily initialized on first call; missing `GEMINI_API_KEY` raises HTTP 503.

### Job dataset

`backend/app/data/mock_jobs.json` is the only data source. Access it only through `backend/app/data_utils.py`:

- `load_jobs_list()` → `list[dict]`
- `load_jobs_dict()` → `dict[job_id, dict]` (keyed by `"id"`)

Never add another `_load_jobs()` in a router — use these helpers.

### Frontend type contract

`frontend/lib/api.ts` is the single source of truth for all API shapes. It exports:
- TypeScript types mirroring every backend response (`Job`, `JobMatch`, `ShortlistEntry`, `Profile`, `DashboardStats`, `InterviewQuestion`, `AnswerFeedback`, `Dossier`)
- The `api` object with typed methods for every endpoint

All frontend pages import from here. When adding a backend endpoint, update `api.ts` first.

### Styling system

Tailwind CSS v3 with two custom palettes defined in `frontend/tailwind.config.ts`:
- `ink-{50…900}` — neutral grey scale used for all text, borders, backgrounds
- `accent` (`#7c5cff`) / `accent-soft` (`#efeaff`) — purple brand colour

Reusable UI classes are declared as `@layer components` in `frontend/app/globals.css`:

| Class | Purpose |
|---|---|
| `card` / `card-interactive` | White rounded card, interactive adds hover lift |
| `btn-primary/secondary/accent/ghost/danger` | Button variants |
| `pill` / `pill-accent/success/info/warn` | Tag/badge chips |
| `score-badge` + `score-high/mid/low` | Circular score display in JobCard |
| `input` / `textarea` / `label` | Form elements |
| `page-title` / `page-subtitle` / `section-title` | Typography hierarchy |
| `empty-state` | Centred empty state container |
| `animate-fade-up` / `animate-fade-in` | Entry animations |
| `icon-bg-{purple,emerald,amber,sky}` | Coloured icon badge backgrounds |

### Next.js 14 Suspense requirement

Any page that calls `useSearchParams()` **must** be extracted into an inner component and wrapped with `<Suspense>`. Without this the `next build` fails. Both `/resume` and `/interview` follow this pattern — see `ResumePageInner` / `InterviewPageInner`.

### Environment

`.env` lives at the **repo root** (not inside `backend/`). `main.py` loads it via `load_dotenv(_REPO_ROOT / ".env")`. Copy from `.env.example` and set `GEMINI_API_KEY`.
