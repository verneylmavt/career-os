# Career OS project guidance

Career OS is a local, single-user career app with five pages and ten curated jobs. It has no accounts or user isolation. Keep this file and `CLAUDE.md` consistent; see [ARCHITECTURE.md](ARCHITECTURE.md) for contracts and lifecycle details.

## Code map

- `backend/app/main.py`: dotenv loading, injectable `create_app(repository, provider)`, startup migrations, sanitized error handlers and routers.
- `backend/app/repository.py`: SQLite connections, migrations, revisions, saved work, generation tickets and atomic write checks. `config.py` selects the database path.
- `backend/app/schemas.py`: strict request/profile contracts. `services/model_schemas.py`: provider output schemas, prompts, grounding and rubric checks. `services/gemini_client.py`: asynchronous, bounded Gemini adapter.
- `backend/app/data_utils.py` and `data/mock_jobs.json`: validated catalog with stable IDs. Reuse the shared loaders. `services/matching.py`: controlled skill aliases, strict filters and ranking.
- `backend/app/routers/`: profile, discovery/shortlist/preparation, documents, interviews and dashboard metrics.
- `frontend/app/`: five pages, shared styles/layout, server-only `/api/[...path]` proxy. `lib/contracts.ts`: Zod response contracts; `lib/api-client.ts`: deadlines/errors/cancellation; `lib/api.ts`: typed actions; `lib/resources.ts`: SWR reads and keyed actions.
- `frontend/components/`: shared navigation, role selection, profile/upload, Markdown, documents and preparation controls. Root `public/` contains original demo screenshots, not Next runtime assets; `kb/` is historical build-session context.

## Lifecycle rules

- Use injected repositories/providers in tests. SQLite uses WAL, foreign keys, a five-second busy timeout and short transactions. Add ordered migrations; never hold a transaction during AI generation. Run blocking database/PDF work outside the event loop.
- Changed profile facts increment revision. Resume replacement is atomic; absent extracted candidate facts become empty defaults. Only a manually selected location preference carries over. Invalid, cancelled or failed uploads preserve the previous profile.
- Keep successful documents/briefs after profile edits and show their source revision as outdated. Removing a shortlist entry retains preparation. Role selectors expose retained work. A successful document refresh replaces its previous version; interview regeneration archives the old session only after success.
- Shortlist POST is idempotent. PATCH accepts status and notes independently. Stages are `saved`, `applied`, `interviewing`, `offer`, `rejected`; cover-letter tones are `warm`, `direct`, `formal`. Keep backend and frontend enums aligned.
- Generation commits check profile revision and latest request ticket. Prepare evaluation atomically: check canonical session/question and answer version, save the submitted draft and issue its ticket in one transaction. Return 409 for obsolete writes without partially changing the draft; never attach delayed feedback to a replacement session. Archived sessions are read-only. Current sessions from an old profile permit draft saving, but require new questions before evaluation.
- Gemini uses provider JSON schemas and Pydantic validation, factual source excerpts, finite rubric scores and six mixed-category questions. Treat source instructions as data. Preparation briefs derive from the posting; do not present them as company research. Improved answers preserve candidate facts and use placeholders for suggested details.
- Keep the two-call process limit, 60-second total provider deadline and at most one transport/server retry. Do not automatically retry quota, blocked, empty or invalid output. Log operation/model/status/latency/token counts without personal content. Bump prompt versions when semantics change so saved-generation caches invalidate.
- SWR is for inexpensive GETs; generation is an explicit POST. GET preparation briefs never generates. Key pending/error state and result updates by role, tone, session and question. A tailored resume is shared across its role's tone caches; preserve each tone's cover letter. Preserve visible saved output during regeneration and guard late responses/navigation.
- Search filters are constraints; empty results are valid. Validate local fallback filters too; do not silently truncate constraints to satisfy bounds. Profile fit is nullable without skills and separate from query relevance. Practice score uses validated feedback from current-profile, current sessions for active shortlisted roles; it is not a hiring prediction.

## Configuration and commands

Backend dotenv precedence: process environment, root `.env`, then `backend/.env`; files do not override existing values. `GEMINI_MODEL` remains a global override; defaults are `gemini-3.5-flash-lite` for extraction/search and `gemini-3.8-flash` for writing/feedback. `.env.example` lists operation overrides. Default SQLite file is ignored `backend/.data/careeros.sqlite3`; prefer an absolute `CAREEROS_DB_PATH` override. Old in-memory state has no automatic migration.

Next runs from `frontend/`. Set custom `API_BASE` in its process environment or `frontend/.env.local`; root backend dotenv does not configure Next. Keep it server-only, without `NEXT_PUBLIC_`. Never commit credentials, personal resumes, databases or generated test artifacts.

Backend, from `backend/` after activating `.venv`:

```text
python -m pip install -r requirements-dev.txt
python -m uvicorn app.main:app --host 127.0.0.1 --reload --port 8000
python -m ruff check app tests tools
python -m pytest -q
```

Frontend, from `frontend/`:

```text
npm ci
npm run dev
npm run test
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:integration
```

`test:e2e` uses mocked routes; `test:integration` starts real Next/FastAPI with isolated SQLite and fake Gemini, including an actual backend restart. Set `CAREEROS_INTEGRATION_PRODUCTION=1` after a build to verify production Next; `PYTHON_BIN` selects its Python interpreter. Test-only controls bind localhost and must never enter production routes. Live synthetic model probes require explicit `--live`; see README. They consume quota and are separate from deterministic checks.

## Editing and verification

- Read nearby code and the nearest guidance. For frontend edits, also follow the generated `frontend/AGENTS.md` and read relevant bundled Next documentation. Keep `useSearchParams()` behind Suspense and verify a production build; do not hand-edit generated Next files.
- Update backend contracts, Zod schemas and consumers together. Keep Markdown free of raw HTML; await clipboard calls and test downloaded contents. Reuse shared styles, associated labels, focus states and reduced-motion support. Tailwind scans `app/` and `components/`.
- Verify behavior with temporary SQLite and deterministic providers, then run affected unit/lint/type/build/browser checks. Browser mocks do not prove multipart forwarding or restart persistence. Cross-layer checks belong in the real integration harness.
- Review the final diff and report checks actually run and remaining limits. Keep artifacts under ignored `output/` or configured test-output directories. Commit and push only when the user authorizes them.
