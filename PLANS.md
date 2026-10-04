# Career OS improvement plan

## Brief

Goal: a durable personal career app with reliable saved work, accessible responsive workflows, and validated Gemini output.
Context: five Next.js pages proxy FastAPI; ten curated jobs; prior in-memory state and unchecked AI responses.
Constraints: preserve purple identity, five routes, curated catalog and existing guidance work. No accounts, deployment, live job integrations, embeddings or task queue. Implement on main and push origin/main after checks. Never commit credentials, resume data, databases or test artifacts.
Done when: the eight commits below pass their checks, fresh integrated browser/backend checks pass, both guidance files describe the resulting system, final diff review is resolved, and remote main contains the series.

## Commits and gates

1. Modernize Next 16.3.8 / React 19.3.0, ESLint and deterministic test harnesses; baseline types, lint, build and tests pass.
2. Typed SQLite repository, migrations, profile revisions, durable preparation and idempotent shortlist updates; restart/isolation/validation tests pass.
3. Async schema-validated bounded Gemini calls, factual prompts, caching and stale-write protection; upload/provider/concurrency tests pass.
4. Honest deterministic discovery and practice metrics, coordinated with client types and Discover; filtering/alias/fallback/metric tests pass.
5. SWR resource reads, runtime DTO validation, friendly errors, proxy deadlines and asynchronous result guards; error/race tests pass.
6. Restore/edit saved profile, documents, notes, drafts and interview history; failed regeneration preserves work; workflow tests pass.
7. Refine purple contrast, responsive layouts, navigation/forms/focus/status accessibility; multi-viewport keyboard/browser checks pass.
8. Real proxy/backend/SQLite integration, CI, README and paired AGENTS/CLAUDE updates; final review and all suites pass before push.

## Shared interfaces

- Profile retains its fields and adds revision and updated_at. PATCH accepts optional expected_revision; candidate fact replacement never inherits missing old facts.
- GET /api/jobs returns job contexts: {job, shortlisted, has_preparation}.
- Shortlist creation is idempotent; PATCH accepts optional status and/or notes, optional legacy job_id must match path.
- Generation POSTs retain successful content fields and add metadata: job_id, profile_revision, generated_at, model, prompt_version, is_stale. Body regenerate=false reuses identical successful output; true explicitly regenerates.
- GET /api/resume/{job_id}/documents returns {job_id, tailored_resume: output|null, cover_letter: output|null}; optional tone defaults warm.
- GET /api/jobs/{job_id}/dossier is cache-only (output|null); POST generates or refreshes the persisted preparation brief.
- Interview session DTO: job_id, session_id (nullable when absent), profile_revision, created_at, is_stale, is_current, questions, answers, answer_versions, scores, feedback, history. History summaries contain session_id, created_at, evaluated_count, is_current, is_stale. GET session accepts optional session_id to review archived history.
- POST interview/questions accepts job_id/regenerate and returns session DTO. Regeneration archives prior session only after successful validation.
- PATCH /api/interview/{job_id}/session/answers/{question_id} accepts session_id, answer, optional expected_version; saves a draft and returns session DTO. Archived sessions are read-only. Changed drafts invalidate previous feedback; revision checks reject late evaluation results.
- POST interview/evaluate accepts job_id, session_id, question_id, answer; legacy question is optional and checked against the canonical stored question. Response preserves score/strengths/gaps/improved_answer_example and adds rubric and submitted_answer. Rubric fields: clarity, specificity, role_alignment, technical_accuracy (nullable for behavioral); score is the mean of relevant dimensions, bounded 1–10.
- Search returns {results, filters, warnings, source: curated, personalized}. Match score is nullable without skills. Explicit location/work_mode/seniority filters override interpreted preferences. Required/nice skills use 70:20 normalized weights, with no demo baseline; relevance precedes fit in ranking.
- Dashboard retains existing fields and adds practice_score (nullable) and evaluated_answer_count. Current metrics use current-profile, current sessions for saved/applied/interviewing roles; old work remains readable.
- Errors: {detail, code, retryable}, with relevant Retry-After headers. Never expose raw provider payloads.

## Architecture and lifecycle

SQLite: ignored backend/.data/careeros.sqlite3 by default; CAREEROS_DB_PATH override; ordered migration version, WAL, foreign keys, busy_timeout=5000, per-operation connections and short transactions. Seed/validate immutable catalog through data_utils. Keep profile/shortlist/artifacts/sessions/answers/generation tickets in a repository injectable into an app factory. DB/PDF work executes off the event loop. Never hold transactions during Gemini.

Profile edits increment revision. Documents are retained with stale badges; shortlist removal retains prep. Cache inputs include profile revision, job, options, model and prompt version. At request start issue a target generation ticket; atomic result commit checks ticket/profile/session/answer versions. Failures preserve previous successful outputs. Regeneration creates a new current session and retains archived sessions.

Gemini SDK 2.28.0: extraction defaults gemini-3.5-flash-lite; generation defaults gemini-3.8-flash. Preserve explicit GEMINI_MODEL overrides and allow operation-specific overrides. Provider schemas plus Pydantic validation, default temperatures, low thinking for Flash. Two concurrent calls/process; max one transient retry, no quota/malformed automatic retry. Total operation deadline 60 seconds; proxy 70, browser 75 for AI. Ordinary read deadlines remain short. Structured operation/latency/status/token logs contain no personal text.

Upload: PDF/TXT/MD only; at most 5 MiB / 25 PDF pages / 40,000 characters; strict text decoding and actionable malformed/encrypted/scanned PDF errors. Accept entire bounded text. Missing parsed candidate facts become empty defaults; preserve explicitly selected location preference. Extracted profile remains editable. Source excerpts for rewritten claims must occur in resume; generated advice must not invent candidate facts or company research.

SWR only for inexpensive GETs, no polling; generation only on explicit POST actions. Role/session-specific resource keys, per-operation pending state and captured request identity; no stale A result rendered for B. Retain previous content during regeneration. Safe Markdown without raw HTML, awaited clipboard, meaningful download filenames. Unknown IDs show recoverable errors; removed jobs with preparation remain readable and can be saved again.

Visual: functional accent #6d42e5; retain neutral/purple card identity; readable mobile tabs, 1/2/5-column pipeline, full-width small-screen actions, focus-visible, keyboard upload, linked labels, restrained live statuses and reduced-motion support.

## Acceptance

- Backend: temporary databases, fake provider, restart persistence, idempotency, notes-only updates, upload replacement/failure, invalid values, stale profile/session/answer writes, unknown/tampered questions, quotas/timeouts/invalid output, grounded excerpts and matching fixtures.
- Frontend: unit tests for DTO/errors/role selection/clipboard/failure preservation and delayed requests; lint/typecheck/production build.
- Browser: all five routes at 320/390/768/1280px, keyboard and 200% zoom, no page overflow or serious axe issues; downloads/drafts/history/recovery verified.
- Real Next proxy + FastAPI + isolated SQLite + fake Gemini verifies multipart and persistence, independently of browser route mocks.
- Credentialed synthetic model evaluations are separate from deterministic tests; no real candidate data sent for tests.
- Each implementation commit is reviewed and verified before staging explicit owned files. Final whole-series independent review precedes delivery. No force push; merge remote changes with --no-ff if needed.
