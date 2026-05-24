"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, AnswerFeedback, InterviewQuestion, ShortlistEntry } from "@/lib/api";
import { Spinner } from "@/components/Spinner";

const CATEGORY_STYLE: Record<string, string> = {
  behavioral:    "pill-info",
  technical:     "pill-success",
  "role-specific": "pill-warn",
};

const CATEGORY_LABEL: Record<string, string> = {
  behavioral:    "Behavioral",
  technical:     "Technical",
  "role-specific": "Role-specific",
};

function FeedbackCard({ fb }: { fb: AnswerFeedback }) {
  const level = fb.score >= 8 ? "high" : fb.score >= 5 ? "mid" : "low";
  const ring = {
    high: "border-emerald-200 bg-emerald-50 text-emerald-700",
    mid:  "border-amber-200  bg-amber-50  text-amber-700",
    low:  "border-rose-200   bg-rose-50   text-rose-700",
  }[level];
  const bar = {
    high: "bg-emerald-400",
    mid:  "bg-amber-400",
    low:  "bg-rose-400",
  }[level];

  return (
    <div className="mt-4 animate-fade-up rounded-2xl border border-ink-100 bg-ink-50 p-5 space-y-4">
      {/* Score header */}
      <div className="flex items-center gap-4">
        <div className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full border-2 ${ring}`}>
          <span className="text-xl font-bold leading-none">{fb.score}</span>
          <span className="text-[9px] font-semibold opacity-60">/10</span>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-ink-900">Interview feedback</p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-200">
            <div
              className={`h-1.5 rounded-full transition-all duration-700 ${bar}`}
              style={{ width: `${fb.score * 10}%` }}
            />
          </div>
        </div>
      </div>

      {/* Strengths */}
      {fb.strengths?.length > 0 && (
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Strengths
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-ink-700">
            {fb.strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      {/* Gaps */}
      {fb.gaps?.length > 0 && (
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.25" />
              <path d="M6 3.5v3M6 8v.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
            </svg>
            Gaps
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-ink-700">
            {fb.gaps.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      {/* Stronger answer */}
      {fb.improved_answer_example && (
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M6 1L7.8 4.6H11.5L8.35 6.9L9.55 10.5L6 8.2L2.45 10.5L3.65 6.9L.5 4.6H4.2L6 1Z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
            </svg>
            Stronger answer
          </p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink-700">
            {fb.improved_answer_example}
          </p>
        </div>
      )}
    </div>
  );
}

function InterviewPageInner() {
  const sp = useSearchParams();
  const queryJob = sp.get("job") || "";

  const [shortlist, setShortlist] = useState<ShortlistEntry[]>([]);
  const [jobId, setJobId] = useState(queryJob);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [loadingQ, setLoadingQ] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, AnswerFeedback>>({});
  const [evaluating, setEvaluating] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.shortlist().then((sl) => {
      setShortlist(sl);
      if (!jobId && sl.length) setJobId(sl[0].job.id);
    });
  }, []);

  async function gen() {
    if (!jobId) return;
    setLoadingQ(true);
    setQuestions([]);
    setFeedback({});
    setAnswers({});
    setErr(null);
    try {
      const r = await api.questions(jobId);
      setQuestions(r.questions);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoadingQ(false);
    }
  }

  async function evaluate(q: InterviewQuestion) {
    const ans = answers[q.id];
    if (!ans?.trim()) return;
    setEvaluating(q.id);
    setErr(null);
    try {
      const r = await api.evaluate(jobId, q.id, q.question, ans);
      setFeedback((prev) => ({ ...prev, [q.id]: r }));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setEvaluating(null);
    }
  }

  const selectedJob = shortlist.find((e) => e.job.id === jobId)?.job;
  const answeredCount = Object.values(feedback).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="page-title">Mock interview</h1>
        <p className="page-subtitle">
          Behavioral · technical · role-specific. Answer each question, get instant scored feedback.
        </p>
      </header>

      {err && (
        <div className="card border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">{err}</div>
      )}

      {/* Controls */}
      <div className="card p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grow">
            <label className="label">Select role</label>
            <select
              className="input"
              value={jobId}
              onChange={(e) => { setJobId(e.target.value); setQuestions([]); setFeedback({}); setAnswers({}); }}
              disabled={!shortlist.length}
            >
              <option value="">— Pick a job —</option>
              {shortlist.map((e) => (
                <option key={e.job.id} value={e.job.id}>
                  {e.job.title} @ {e.job.company}
                </option>
              ))}
            </select>
          </div>
          <button onClick={gen} disabled={!jobId || loadingQ} className="btn-primary">
            {loadingQ ? (
              <><Spinner size="sm" /> Generating…</>
            ) : questions.length ? (
              "Regenerate"
            ) : (
              "Start mock interview"
            )}
          </button>
        </div>
        {selectedJob && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-500">
            <span>
              Tailored to <strong className="text-ink-700">{selectedJob.title}</strong> @{" "}
              {selectedJob.company}
            </span>
            <span className="pill">{selectedJob.seniority}</span>
            {questions.length > 0 && answeredCount > 0 && (
              <span className="pill-success ml-auto">
                {answeredCount}/{questions.length} answered
              </span>
            )}
          </div>
        )}
      </div>

      {loadingQ && (
        <div className="flex justify-center py-10">
          <Spinner label="Drafting questions…" />
        </div>
      )}

      {/* Questions */}
      <div className="space-y-4">
        {questions.map((q, i) => {
          const fb = feedback[q.id];
          const isEvaluating = evaluating === q.id;
          return (
            <div
              key={q.id}
              className="card p-5 animate-fade-up"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-start gap-4">
                {/* Number */}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-bold text-ink-600">
                  {i + 1}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Category */}
                  <span className={CATEGORY_STYLE[q.category] ?? "pill"}>
                    {CATEGORY_LABEL[q.category] ?? q.category}
                  </span>

                  {/* Question */}
                  <h3 className="mt-2 text-base font-semibold text-ink-900 leading-snug">
                    {q.question}
                  </h3>

                  {/* Hint */}
                  {q.what_we_look_for && (
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-xs text-ink-400 hover:text-ink-600 transition-colors">
                        What interviewers look for…
                      </summary>
                      <p className="mt-1 text-xs leading-relaxed text-ink-500">
                        {q.what_we_look_for}
                      </p>
                    </details>
                  )}

                  {/* Answer */}
                  <div className="mt-3">
                    <label className="label">Your answer</label>
                    <textarea
                      className="textarea"
                      placeholder={
                        q.category === "behavioral"
                          ? "Use the STAR format: Situation, Task, Action, Result…"
                          : "Type your answer here…"
                      }
                      value={answers[q.id] || ""}
                      onChange={(e) =>
                        setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                      }
                      disabled={!!fb}
                    />
                  </div>

                  <div className="mt-2">
                    <button
                      onClick={() => evaluate(q)}
                      disabled={!answers[q.id]?.trim() || isEvaluating || !!fb}
                      className="btn-primary"
                    >
                      {isEvaluating ? (
                        <><Spinner size="sm" /> Evaluating…</>
                      ) : fb ? (
                        "✓ Evaluated"
                      ) : (
                        "Get feedback"
                      )}
                    </button>
                  </div>

                  {/* Feedback */}
                  {fb && <FeedbackCard fb={fb} />}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!loadingQ && questions.length === 0 && (
        <div className="empty-state py-14">
          <div className="rounded-2xl bg-ink-100 p-4">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true" className="text-ink-400">
              <path d="M14 2C8.48 2 4 6.24 4 11.5c0 2.65 1.09 5.05 2.85 6.78L6 26l6.6-2.34c.45.1.92.17 1.4.17 5.52 0 10-4.24 10-9.5C24 8.47 19.52 4 14 4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <circle cx="9.5" cy="11.5" r="1" fill="currentColor" />
              <circle cx="14" cy="11.5" r="1" fill="currentColor" />
              <circle cx="18.5" cy="11.5" r="1" fill="currentColor" />
            </svg>
          </div>
          <p className="text-sm font-medium text-ink-600">
            {shortlist.length === 0
              ? "Shortlist a job first, then come back to practice"
              : "Pick a role and start your mock interview"}
          </p>
        </div>
      )}
    </div>
  );
}

export default function InterviewPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-12"><Spinner label="Loading…" /></div>}>
      <InterviewPageInner />
    </Suspense>
  );
}
