# CareerOS

Your AI career copilot — **discover** roles, **shortlist** the good ones, **tailor** your resume, **prep** for interviews, and **track** the whole pipeline from one dashboard.

Built for the _Build with AI Cloud Jakarta 2026_ build session.

---

## Features

| Feature                                                                                            | Where             |
| -------------------------------------------------------------------------------------------------- | ----------------- |
| Natural-language job discovery (NL query → structured filters → ranked + explained matches)        | `/discover`       |
| One-click shortlist with Kanban-style pipeline (saved → applied → interviewing → offer → rejected) | `/shortlist`, `/` |
| Resume upload (PDF or paste) → automatic skill extraction                                          | `/resume`         |
| Per-job resume tailoring + ATS keyword extraction                                                  | `/resume`         |
| Cover letter generator                                                                             | `/resume`         |
| Company dossier ("what to know before your interview")                                             | `/shortlist`      |
| AI mock interview: behavioral + technical + role-specific questions with scored feedback           | `/interview`      |
| Dashboard with pipeline, skill gaps across your shortlist, and interview readiness %               | `/`               |

## Architectures

```
career-os/
├── backend/          FastAPI + Gemini · in-memory store · mock job dataset
│   └── app/
│       ├── main.py           FastAPI entrypoint, CORS
│       ├── store.py          in-process state
│       ├── routers/          profile · jobs · resume · interview · dashboard
│       ├── services/         Gemini client (JSON + text helpers)
│       └── data/mock_jobs.json   curated SG/JKT job dataset
└── frontend/         Next.js 14 (App Router) + Tailwind · TypeScript
    ├── app/                  /, /discover, /shortlist, /resume, /interview
    ├── components/           NavBar · JobCard · Spinner
    └── lib/api.ts            typed client for backend
```

## Runs

### 1. Backend (FastAPI)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# .env in repo root (one level up) is auto-loaded
cp ../.env.example ../.env
# edit ../.env and add your GEMINI_API_KEY

uvicorn app.main:app --reload --port 8000
```

API health check: `curl http://localhost:8000/` → `{"status":"ok","service":"CareerOS API"}`

### 2. Frontend (Next.js)

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:3000>.

### 3. Configuration

| Env var          | Default                 | Where                                                  |
| ---------------- | ----------------------- | ------------------------------------------------------ |
| `GEMINI_API_KEY` | — (required)            | `.env` (loaded by backend)                             |
| `GEMINI_MODEL`   | `gemini-2.5-flash`      | `.env`                                                 |
| `API_BASE`       | `http://localhost:8000` | frontend env (server-side only, used by Next.js proxy) |

## How to Use It?
