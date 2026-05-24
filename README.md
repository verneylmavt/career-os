# CareerOS

Your AI career copilot — **discover** roles, **shortlist** the good ones, **tailor** your resume, **prep** for interviews, and **track** the whole pipeline from one dashboard.

Built for the *Build with AI Cloud Jakarta 2026* build session.

---

## What it does

| Feature | Where |
|---|---|
| Natural-language job discovery (NL query → structured filters → ranked + explained matches) | `/discover` |
| One-click shortlist with Kanban-style pipeline (saved → applied → interviewing → offer → rejected) | `/shortlist`, `/` |
| Resume upload (PDF or paste) → automatic skill extraction | `/resume` |
| Per-job resume tailoring + ATS keyword extraction | `/resume` |
| Cover letter generator | `/resume` |
| Company dossier ("what to know before your interview") | `/shortlist` |
| AI mock interview: behavioral + technical + role-specific questions with scored feedback | `/interview` |
| Dashboard with pipeline, skill gaps across your shortlist, and interview readiness % | `/` |

## Architecture

```
bwcai/
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

State is in-memory by design — restart the server to reset. Perfect for a demo.

## Running it

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

### Configuration

| Env var | Default | Where |
|---|---|---|
| `GEMINI_API_KEY` | — (required) | `.env` (loaded by backend) |
| `GEMINI_MODEL` | `gemini-2.5-flash` | `.env` |
| `API_BASE` | `http://localhost:8000` | frontend env (server-side only, used by Next.js proxy) |

## Demo path (3-minute showcase)

1. **Dashboard (`/`)** — empty state nudges you to upload a resume.
2. **Resume (`/resume`)** — paste 2-3 paragraphs of resume text; profile auto-extracts skills.
3. **Discover (`/discover`)** — type *"AI Engineer in Singapore, hybrid, gen-AI focus"*; click Find matches; show ranked results with **why this fits** and **skill gaps**. Shortlist the top 2.
4. **Shortlist (`/shortlist`)** — open **Company dossier** on one (LLM-generated talking points + smart questions).
5. **Resume (`/resume`)** — pick the shortlisted job, click **Tailor resume** (markdown output + ATS keywords), then **Generate cover letter**.
6. **Interview (`/interview`)** — pick the same job, generate 6 questions. Answer one, get a 1-10 score with strengths/gaps and a stronger example.
7. **Dashboard (`/`)** — show the populated pipeline, top skill gaps, and interview readiness %.

## Trade-offs worth knowing

- **Mock job dataset** — real LinkedIn/Indeed scraping violates ToS and burns hours; the demo experience is identical, and you can swap `mock_jobs.json` for a real search adapter later (see `_load_jobs` in [backend/app/routers/jobs.py](backend/app/routers/jobs.py)).
- **In-memory store** — single-user, single-process. Replace with SQLite/Postgres in `app/store.py` for persistence.
- **No auth** — single implicit user. Add Clerk/Auth.js when this leaves localhost.

## Stretch ideas (not built)

- Voice mock interview (browser audio → Whisper → eval)
- Skill-gap learning paths (link to courses for each missing skill)
- Application reminders / follow-up emails
- Browser extension to one-click-save jobs from any career page

## License

MIT
