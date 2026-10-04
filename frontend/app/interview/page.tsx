"use client";
import { Suspense, useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSWRConfig } from "swr";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/api-client";
import type { AnswerFeedback, InterviewQuestion, InterviewSession } from "@/lib/contracts";
import { keys, useContexts, useResourceAction, useSession } from "@/lib/resources";
import { savedTime } from "@/components/GeneratedDocument";
import { PreparationBrief } from "@/components/PreparationBrief";
import { RoleSelector } from "@/components/RoleSelector";
import { SafeMarkdown } from "@/components/SafeMarkdown";
import { Spinner } from "@/components/Spinner";

const CATEGORY_STYLE = { behavioral: "pill-info", technical: "pill-success", "role-specific": "pill-warn" };

function mergeSavedAnswer(current: InterviewSession | undefined, saved: InterviewSession, questionId: string) {
  if (!current) return saved;
  if (current.session_id !== saved.session_id || (current.answer_versions[questionId] ?? 0) > (saved.answer_versions[questionId] ?? 0)) return current;
  const feedback = { ...current.feedback };
  const scores = { ...current.scores };
  if (saved.feedback[questionId]) { feedback[questionId] = saved.feedback[questionId]; scores[questionId] = saved.scores[questionId]; }
  else { delete feedback[questionId]; delete scores[questionId]; }
  return { ...current, answers: { ...current.answers, [questionId]: saved.answers[questionId] ?? "" }, answer_versions: { ...current.answer_versions, [questionId]: saved.answer_versions[questionId] ?? 0 }, feedback, scores };
}

function FeedbackCard({ feedback, unsavedChanges }: { feedback: AnswerFeedback; unsavedChanges: boolean }) {
  return (
    <section className="mt-4 min-w-0 space-y-4 rounded-2xl border border-ink-200 bg-ink-50 p-4" aria-label="Answer feedback">
      <div className="flex flex-wrap items-center gap-3"><span className="rounded-full bg-accent-soft px-4 py-2 text-lg font-bold text-accent">{feedback.score}/10</span><h4 className="font-semibold text-ink-900">Feedback on your saved answer</h4></div>
      {unsavedChanges && <p className="text-sm text-amber-800">This feedback is for the last evaluated answer. Save and evaluate your changes to update it.</p>}
      <dl className="grid grid-cols-2 gap-2 text-sm">{Object.entries(feedback.rubric).filter(([, value]) => value !== null).map(([key, value]) => <div key={key} className="rounded-xl bg-white p-2"><dt className="capitalize text-ink-600">{key.replaceAll("_", " ")}</dt><dd className="mt-1 font-semibold text-ink-900">{value}/10</dd></div>)}</dl>
      <div><h5 className="text-sm font-semibold text-emerald-800">Strengths</h5><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-700">{feedback.strengths.map((item, index) => <li key={index}>{item}</li>)}</ul></div>
      <div><h5 className="text-sm font-semibold text-amber-800">Areas to improve</h5><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-700">{feedback.gaps.map((item, index) => <li key={index}>{item}</li>)}</ul></div>
      <div><h5 className="text-sm font-semibold text-accent">Example revision</h5><p className="my-2 text-xs text-ink-600">Bracketed placeholders suggest details to add only if they are true for you.</p><SafeMarkdown>{feedback.improved_answer_example}</SafeMarkdown></div>
      <details><summary className="cursor-pointer text-sm font-medium text-ink-700">Show evaluated answer</summary><p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-700">{feedback.submitted_answer}</p></details>
    </section>
  );
}

function QuestionCard({ question, index, session, resourceKey }: { question: InterviewQuestion; index: number; session: InterviewSession; resourceKey: string }) {
  const id = useId();
  const { mutate } = useSWRConfig();
  const [answer, setAnswer] = useState(session.answers[question.id] ?? "");
  const [message, setMessage] = useState("");
  const action = useResourceAction();
  const sessionId = session.session_id;
  const key = `${sessionId}:${question.id}`;
  const readOnly = !session.is_current;
  const dirty = answer !== (session.answers[question.id] ?? "");
  const feedback = session.feedback[question.id];
  async function save() {
    if (!sessionId || readOnly) return;
    setMessage("");
    await action.run(key, async (signal) => {
      const result = await api.saveDraft(session.job_id, sessionId, question.id, answer, session.answer_versions[question.id] ?? 0, signal);
      await mutate(resourceKey, (current: InterviewSession | undefined) => mergeSavedAnswer(current, result, question.id), false);
      void mutate(keys.stats);
      setMessage("Draft saved");
      return result;
    });
  }
  async function evaluate() {
    if (!sessionId || readOnly || session.is_stale || !answer.trim()) return;
    setMessage("");
    await action.run(key, async (signal) => {
      if (dirty) {
        const saved = await api.saveDraft(session.job_id, sessionId, question.id, answer, session.answer_versions[question.id] ?? 0, signal);
        await mutate(resourceKey, (current: InterviewSession | undefined) => mergeSavedAnswer(current, saved, question.id), false);
      }
      const result = await api.evaluateAnswer(session.job_id, sessionId, question.id, answer, !!feedback && !dirty, signal);
      await mutate(resourceKey, (current: InterviewSession | undefined) => current?.session_id === sessionId ? { ...current, feedback: { ...current.feedback, [question.id]: result }, scores: { ...current.scores, [question.id]: result.score } } : current, false);
      void mutate(keys.stats);
      setMessage("Feedback saved");
      return result;
    });
  }
  return (
    <article className="card min-w-0 space-y-3 p-4 sm:p-5" aria-labelledby={`${id}-question`}>
      <div className="flex flex-wrap items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-100 text-sm font-semibold text-ink-700" aria-label={`Question ${index + 1}`}>{index + 1}</span><span className={CATEGORY_STYLE[question.category]}>{question.category === "role-specific" ? "Role-specific" : question.category === "technical" ? "Technical" : "Behavioral"}</span></div>
      <h3 id={`${id}-question`} className="break-words text-base font-semibold leading-relaxed text-ink-900">{question.question}</h3>
      <details><summary className="cursor-pointer text-sm text-ink-700">What interviewers look for</summary><p className="mt-2 text-sm text-ink-600">{question.what_we_look_for}</p></details>
      <div><label className="label" htmlFor={`${id}-answer`}>Your answer to question {index + 1}</label><textarea id={`${id}-answer`} className="textarea min-h-40" value={answer} maxLength={20_000} onChange={(event) => { setAnswer(event.target.value); setMessage(""); }} readOnly={readOnly} disabled={action.pending[key]} placeholder={question.category === "behavioral" ? "Describe the situation, your action, and the result." : "Explain your approach and include a concrete example."} /></div>
      {!readOnly && <div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={save} disabled={!dirty || action.pending[key]}>Save draft</button><button className="btn-primary" onClick={evaluate} disabled={session.is_stale || !answer.trim() || action.pending[key]}>{action.pending[key] ? <><Spinner size="sm" /> Saving and evaluating…</> : feedback && !dirty ? "Evaluate again" : "Get feedback"}</button></div>}
      {session.is_stale && !readOnly && <p className="text-sm text-amber-800">Generate new questions to evaluate answers against your current profile.</p>}
      {action.errors[key] && <p role="alert" className="text-sm text-rose-700">{action.errors[key]}</p>}
      <p role="status" className="text-sm text-ink-600">{readOnly ? "Archived session · read only" : dirty ? "Unsaved changes. Save your draft before leaving this page." : message || "Draft is saved."}</p>
      {feedback && <FeedbackCard feedback={feedback} unsavedChanges={dirty} />}
    </article>
  );
}

function InterviewPageInner() {
  const search = useSearchParams();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const contextsResource = useContexts();
  const contexts = contextsResource.data ?? [];
  const jobId = search.get("job") || contexts.find((context) => context.shortlisted || context.has_preparation)?.job.id || "";
  const selected = contexts.find((context) => context.job.id === jobId);
  const sessionId = search.get("session") || "";
  const saved = useSession(selected ? jobId : "", sessionId);
  const session = saved.data;
  const action = useResourceAction();
  const generationKey = `${jobId}:questions`;
  const [briefRole, setBriefRole] = useState("");
  const resourceKey = keys.session(jobId, sessionId);
  function selectSession(value: string) { router.replace(`/interview?job=${encodeURIComponent(jobId)}${value ? `&session=${encodeURIComponent(value)}` : ""}`, { scroll: false }); }
  async function generate() {
    if (!selected) return;
    const capturedJob = jobId;
    const capturedUrl = window.location.href;
    await action.run(generationKey, async (signal) => {
      const result = await api.questions(capturedJob, !!session?.session_id, signal);
      await mutate(keys.session(capturedJob), result, false);
      void mutate((key) => typeof key === "string" && key.startsWith(keys.session(capturedJob) + "?"));
      void mutate(keys.contexts);
      void mutate(keys.stats);
      if (window.location.href === capturedUrl) router.replace(`/interview?job=${encodeURIComponent(capturedJob)}`, { scroll: false });
      return result;
    });
  }
  const evaluatedCount = session ? Object.keys(session.feedback).length : 0;
  const practiceScore = session && evaluatedCount ? Math.round(Object.values(session.feedback).reduce((sum, feedback) => sum + feedback.score, 0) / evaluatedCount * 10) : null;
  return (
    <div className="min-w-0 space-y-6">
      <header><h1 className="page-title">Mock interview</h1><p className="page-subtitle">Practice role-specific questions, save answer drafts, and review feedback across sessions.</p></header>
      <section className="card min-w-0 space-y-4 p-4 sm:p-5" aria-label="Interview controls">
        {contextsResource.error && <p role="alert" className="text-sm text-rose-700">{errorMessage(contextsResource.error)} <button className="underline" onClick={() => void contextsResource.mutate()}>Retry roles</button></p>}
        <RoleSelector contexts={contexts} value={jobId} disabled={contextsResource.isLoading} onChange={(value) => router.replace(`/interview${value ? `?job=${encodeURIComponent(value)}` : ""}`, { scroll: false })} />
        {selected && <div className="flex flex-wrap items-center gap-2 text-sm text-ink-600"><span>Practice for <strong className="text-ink-900">{selected.job.title}</strong> @ {selected.job.company}</span><span className="pill">{selected.job.seniority}</span></div>}
        {!!session?.history.length && <div><label htmlFor="interview-session" className="label">Session history</label><select id="interview-session" className="input" value={sessionId} onChange={(event) => selectSession(event.target.value)}><option value="">Current session</option>{session.history.filter((item) => !item.is_current || item.session_id === sessionId).map((item) => <option key={item.session_id} value={item.session_id}>{savedTime(item.created_at)} · {item.evaluated_count} evaluated{item.is_current ? " · current" : ""}{item.is_stale ? " · outdated profile" : ""}</option>)}</select></div>}
        <button className="btn-primary" onClick={generate} disabled={!selected || saved.isLoading || action.pending[generationKey]}>{action.pending[generationKey] ? <><Spinner size="sm" /> Generating questions…</> : session?.session_id ? session.is_current ? "Regenerate questions" : "Create new session" : "Start mock interview"}</button>
        <p role="status" className="text-sm text-ink-600">{action.pending[generationKey] ? "Your existing questions and feedback remain available. A new session is saved only after generation succeeds." : saved.isLoading ? "Restoring saved practice…" : ""}</p>
        {(action.errors[generationKey] || saved.error) && <p role="alert" className="text-sm text-rose-700">{action.errors[generationKey] || errorMessage(saved.error)}{sessionId && <button className="ml-2 underline" onClick={() => selectSession("")}>Return to current session</button>}</p>}
        {session?.session_id && <div className="flex flex-wrap items-center gap-2 text-sm text-ink-600"><span>Created <time dateTime={session.created_at ?? undefined}>{savedTime(session.created_at ?? "")}</time></span>{!session.is_current && <span className="pill">Archived session</span>}{session.is_stale && <span className="pill-warn">Outdated profile</span>}<span className="pill-success">{evaluatedCount} / {session.questions.length} evaluated</span>{practiceScore !== null && <span className="pill-accent">Practice score {practiceScore}%</span>}</div>}
        {session?.is_stale && <p className="text-sm text-amber-800">Your profile changed after this session was created. Generate new questions to practice against your current profile; this session remains readable.</p>}
      </section>
      {selected && <section className="card min-w-0 p-4 sm:p-5" aria-label="Role preparation"><button className="btn-secondary" aria-expanded={briefRole === jobId} aria-controls={`retained-brief-${jobId}`} onClick={() => setBriefRole(briefRole === jobId ? "" : jobId)}>Preparation brief</button><p className="mt-2 text-sm text-ink-600">Saved posting-based preparation remains available after a role is removed from your shortlist.</p>{briefRole === jobId && <div id={`retained-brief-${jobId}`}><PreparationBrief jobId={jobId} /></div>}</section>}
      <div className="space-y-4">{session?.questions.map((question, index) => <QuestionCard key={`${session.session_id}:${question.id}`} question={question} index={index} session={session} resourceKey={resourceKey} />)}</div>
      {selected && session && !session.questions.length && <div className="card p-6 text-center text-sm text-ink-600">No interview session saved for this role yet. Choose Start mock interview to generate questions.</div>}
    </div>
  );
}

export default function InterviewPage() {
  return <Suspense fallback={<Spinner label="Loading interview workspace…" />}><InterviewPageInner /></Suspense>;
}
