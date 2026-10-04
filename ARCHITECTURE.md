# Career OS architecture

Career OS is a local personal workspace. The five routes share one profile, shortlist and SQLite database; there is no authentication or user isolation. The catalog contains ten curated sample jobs from SG/JKT/APAC. It does not fetch live listings, and sample application URLs may be placeholders.

## Request flow and ownership

```text
Browser: Next pages + SWR + explicit actions
    -> /api/[...path] Next server proxy
        -> FastAPI routers
            -> injected SQLiteRepository
            -> validated curated catalog / local matching
            -> injected asynchronous GeminiProvider
```

The browser always calls relative `/api/...` paths. The Node proxy forwards method, query, body and Content-Type, preserving multipart boundaries. It buffers bounded request bodies (6 MiB, allowing a 5 MiB file plus framing), returns upstream status/content and forwards Retry-After. It does not forward arbitrary cookies/headers. `API_BASE` is server-only and defaults to `http://127.0.0.1:8000`.

Ordinary browser/proxy reads have 15-second deadlines. Browser writes have a 75-second deadline, proxy writes 70 seconds, and Gemini operations 60 seconds including semaphore wait and retry. Requests use cancellation signals and sanitized `{detail, code, retryable}` failures. Independent resource failures are displayed locally rather than blanking the entire page.

FastAPI `create_app(repository=None, provider=None)` permits isolated test instances. Startup initializes migrations in a worker thread; shutdown closes an owned Gemini client. Synchronous routes run through FastAPI's thread pool; asynchronous generation routes explicitly move repository/PDF work off the event loop. No database transaction spans generation.

## Persistence

`CAREEROS_DB_PATH` selects the SQLite file. The default is `backend/.data/careeros.sqlite3`, independent of startup directory; a relative override resolves against process cwd. Use an absolute override when selecting another workspace. The default data directory and test artifacts are ignored by Git. Existing in-memory state has no automatic migration.

Each repository operation opens/closes its own connection with foreign keys and a 5,000 ms busy timeout. Initialization sets WAL. Writes use short `BEGIN IMMEDIATE` transactions; dashboard metrics use one short read snapshot. `PRAGMA user_version` tracks ordered migrations, currently versions 1–3. A database newer than the application is rejected.

| Table | Stored work |
| --- | --- |
| `profile` | Candidate facts, revision, update timestamp and internal manually selected location flag |
| `jobs` | Validated stable catalog payloads, refreshed on startup |
| `shortlist` | One row per job, constrained stage, notes and addition timestamp |
| `artifacts` | Latest successful tailored resume, per-tone cover letter or posting brief, plus source/cache metadata |
| `sessions` | Full generated questions, profile revision, model/prompt metadata and current/archived identity |
| `answers` | Per-session/question draft, version, complete feedback and feedback cache key |
| `generation_tickets` | Latest token per generation target for rejecting obsolete results |

Changed profile facts increment revision; a no-op patch does not. Uploads replace candidate facts atomically after bounded parsing and validated extraction. Missing extracted facts use empty defaults rather than inheriting the previous candidate. A location preference explicitly edited by the user is preserved. Upload failure/cancellation keeps the old profile.

Profile edits retain documents, preparation briefs and sessions. Their `is_stale` value compares source revision with current profile revision. Successful document/brief regeneration replaces that artifact; document version history is not stored. Interview regeneration creates a new current session only after validation/commit, retaining earlier sessions and their drafts/feedback for read-only review. Failed generation leaves the prior successful output visible and stored.

Shortlist creation is idempotent; repeat additions preserve existing stage/notes. Status and notes are independently patchable. Removal deletes only the shortlist row. Catalog contexts report `shortlisted` and `has_preparation`, so role selectors can reach retained preparation after removal.

## Generation and model validation

The `google-genai` 2.28.0 adapter calls `client.aio.models.generate_content`. Provider configuration uses `response_json_schema` built from Pydantic schemas; returned JSON is validated again, including injected fake-provider output. Gemini 3 keeps its temperature default; Flash writing/feedback uses low thinking.

Model precedence is `GEMINI_MODEL_<OPERATION>`, then `GEMINI_MODEL_WRITING` for writing operations, then explicit `GEMINI_MODEL`, then defaults. Extraction/search default to `gemini-3.5-flash-lite`; tailoring, cover letters, briefs, questions and feedback default to `gemini-3.8-flash`. The provider does not silently replace an existing global model selection.

A process-wide semaphore allows two concurrent calls. One retry is allowed for transient transport/server errors; SDK retries are disabled. Quota, blocked, empty and malformed output are not automatically retried. App creation configures a JSON metrics handler with an allowlist of operation, model, prompt version, status, latency and token usage. It emits under the normal server logging defaults without source text or generated personal content.

Prompts distinguish instructions from resume/posting source material. Tailored experience claims include source excerpts checked against the supplied resume, and factual metrics/contact details are checked. These checks reduce unsupported additions; they do not prove complete semantic accuracy. Preparation briefs are derived from the posting, with no company research. Interview examples preserve supplied facts and use bracketed placeholders where more personal detail is needed.

Questions must have six distinct IDs and the required behavioral/technical/role-specific category mix. Feedback validates finite scores from 1–10 and a rubric for clarity, specificity, role alignment and technical accuracy; technical accuracy is omitted for behavioral answers. The public overall score is the mean of applicable dimensions.

Generation is explicit. Saved-document/session/brief GETs never generate. A POST with `regenerate=false` can reuse an identical successful stored result; `true` requests a refresh. Cache keys include job payload, options, profile revision, model and prompt version; feedback additionally includes stored session/question and answer/version. Extraction and search are request operations rather than persisted preparation caches.

Before generation, a short transaction issues a target ticket and captures source revision. Evaluation atomically checks profile/session/answer identity, saves any changed draft and issues its ticket; a rejected preparation cannot partially mutate the saved answer. Commit verifies the ticket is still latest and the profile revision unchanged. Feedback additionally checks that its session remains current and its answer version unchanged. Obsolete writes return HTTP 409. Evaluation only accepts a stored canonical session/question; it cannot create arbitrary sessions. Draft edits invalidate old feedback. Archived sessions reject writes; current sessions based on an old profile allow saving drafts but reject evaluation until new questions are generated.

## API contracts

Strict request contracts live in `backend/app/schemas.py`; provider payloads in `services/model_schemas.py`; frontend response validation in `frontend/lib/contracts.ts`. Update all affected consumers together.

| Endpoint | Behavior |
| --- | --- |
| `GET/PATCH /api/profile` | Facts with `revision`/`updated_at`; optional `expected_revision` guards edits |
| `POST /api/profile/upload` | Multipart file or pasted text and optional `expected_revision`; PDF/TXT/MD only, 5 MiB, 25 PDF pages, 40,000 text characters, UTF-8 text files |
| `GET /api/jobs` | Cheap catalog contexts: `{job, shortlisted, has_preparation}` |
| `POST /api/jobs/search` | `{results, filters, warnings, source: "curated", personalized}`; explicit location/work mode/seniority override interpreted preferences |
| `GET/POST /api/jobs/shortlist` | Saved rows / idempotent addition |
| `PATCH/DELETE /api/jobs/shortlist/{job_id}` | Independent status/notes edit / removal retaining work |
| `GET/POST /api/jobs/{job_id}/dossier` | Cache-only posting brief read / explicit generation or refresh |
| `GET /api/resume/{job_id}/documents?tone=warm` | `{job_id, tailored_resume, cover_letter}`; absent outputs are null |
| `POST /api/resume/tailor`, `/api/resume/cover-letter` | Validated grounded documents; cover-letter tone is `warm`, `direct` or `formal` |
| `GET /api/interview/{job_id}/session?session_id=...` | Current or selected archived session, drafts, scores, full feedback and history; absent current session has null identity |
| `POST /api/interview/questions` | Reuse current cached questions or create a new session after successful refresh |
| `PATCH /api/interview/{job_id}/session/answers/{question_id}` | Save draft with session identity and optional `expected_version` |
| `POST /api/interview/evaluate` | Evaluate stored canonical question using role/profile context and answer; optional regeneration |
| `GET /api/dashboard/stats` | Pipeline, document counts, active skill gaps, practice score and evaluated-answer count |

Generated output metadata includes `job_id`, `profile_revision`, `generated_at`, `model`, `prompt_version` and `is_stale`. Sessions additionally carry identity, current/archive status, per-question versions and history summaries. Errors expose readable detail, a stable code and retryability; provider payloads are not returned. Relevant Retry-After values survive both layers.

## Discovery and practice metrics

Matching normalizes controlled aliases such as React.js/React and PostgreSQL/Postgres. Query relevance is separate from profile fit and ranked first. Fit normalizes required/nice-to-have coverage using 70:20 weights without a demo baseline; absent candidate skills produce null fit and an add-skills prompt. Location, work mode and seniority are constraints. A genuine no-match stays empty. Unsupported negation or conflicting requests produce a warning rather than guessed constraints. If AI parsing is unavailable, local keyword parsing is explicitly labeled. Fallback filters are validated too; requests with too many terms or an oversized location return empty results and an actionable warning instead of silently dropping constraints.

Practice score is the rounded mean validated answer score multiplied by ten, or null when there are no eligible evaluations. Eligibility requires the current session, current profile revision and a shortlisted role in `saved`, `applied` or `interviewing`. Archived sessions, removed roles, outdated work, offer/rejected stages and invalid feedback do not inflate the score. `interview_readiness` remains only as a compatibility response field. Scores are practice feedback, not predictions of hiring success.

## Frontend and verification

SWR shares inexpensive saved-resource reads, with no polling or AI-fetch-on-render. Resource keys include role/tone/session identity; keyed pending state and captured request identity prevent a delayed response for one role replacing another. The tailored resume is shared across a role's loaded tone caches while each cover letter stays associated with its tone. Navigation restores server-saved documents, drafts, feedback and archived sessions. Query-driven pages keep `useSearchParams()` inside Suspense. Markdown disables raw HTML, copy waits for clipboard success, and downloads contain complete saved content.

The purple/neutral card design uses functional accent `#6d42e5`, associated labels, visible focus, readable mobile navigation, status announcements and reduced-motion rules. Dashboard pipeline columns are one on phones, two on tablets and five on wide screens.

Backend pytest fixtures inject fake providers and temporary databases. Vitest checks response validation, resource ordering and saved UI behavior. Baseline Playwright tests use route mocks. Separate integration tests run actual Next proxy, FastAPI, fake Gemini and isolated SQLite, restart the backend process, verify multipart boundaries and saved work, and exercise all five pages at 320/390/768/1280 px plus keyboard, 200% zoom and axe checks. Localhost supervisor/test controls exist only in test files. CI runs these checks with production Next.

`backend/tools/evaluate_models.py --live` is a separate opt-in synthetic probe suite. It makes quota-consuming requests with fixed fake candidate data and reports checks/scores, not personal content. Deterministic checks cannot establish live model accuracy; a single live sample also cannot establish general accuracy. See README for commands and the current live-evaluation limitation.
