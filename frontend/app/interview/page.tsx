"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, AnswerFeedback, InterviewQuestion, ShortlistEntry } from "@/lib/api";
import { Spinner } from "@/components/Spinner";

export default function InterviewPage() {
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

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Mock interview</h1>
        <p className="mt-1 text-ink-600">
          Behavioral · technical · role-specific. Answer, get feedback, improve.
        </p>
      </header>

      {err && <div className="card p-4 text-rose-700">{err}</div>}

      <div className="card p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grow">
            <label className="label">Job</label>
            <select
              className="input"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
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
            {loadingQ ? "Generating…" : questions.length ? "Regenerate questions" : "Start mock interview"}
          </button>
        </div>
        {selectedJob && (
          <p className="mt-3 text-xs text-ink-500">
            Tailored to: <strong>{selectedJob.title}</strong> @ {selectedJob.company} · {selectedJob.seniority}
          </p>
        )}
      </div>

      {loadingQ && <Spinner label="Drafting questions…" />}

      <div className="space-y-4">
        {questions.map((q, i) => {
          const fb = feedback[q.id];
          return (
            <div key={q.id} className="card p-5">
              <div className="flex items-center justify-between">
                <span className={
                  "pill " + (q.category === "behavioral" ? "!bg-sky-100 !text-sky-800"
                    : q.category === "technical" ? "!bg-emerald-100 !text-emerald-800"
                    : "!bg-amber-100 !text-amber-800")
                }>
                  {q.category}
                </span>
                <span className="text-xs text-ink-400">Question {i + 1}</span>
              </div>
              <h3 className="mt-2 text-base font-semibold text-ink-900">{q.question}</h3>
              {q.what_we_look_for && (
                <p className="mt-1 text-xs text-ink-500"><strong>What they look for:</strong> {q.what_we_look_for}</p>
              )}
              <textarea
                className="textarea mt-3"
                placeholder="Your answer…"
                value={answers[q.id] || ""}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => evaluate(q)}
                  disabled={!answers[q.id]?.trim() || evaluating === q.id}
                  className="btn-primary"
                >
                  {evaluating === q.id ? "Evaluating…" : "Get feedback"}
                </button>
              </div>

              {fb && (
                <div className="mt-4 rounded-lg border border-ink-100 bg-ink-50 p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-ink-900">Feedback</span>
                    <span className={
                      "rounded-md px-2 py-0.5 text-xs font-bold " +
                      (fb.score >= 8 ? "bg-emerald-100 text-emerald-800"
                        : fb.score >= 5 ? "bg-amber-100 text-amber-800"
                        : "bg-rose-100 text-rose-800")
                    }>
                      {fb.score}/10
                    </span>
                  </div>
                  {fb.strengths?.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Strengths</p>
                      <ul className="mt-1 list-disc pl-5 text-ink-700">
                        {fb.strengths.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                  {fb.gaps?.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Gaps</p>
                      <ul className="mt-1 list-disc pl-5 text-ink-700">
                        {fb.gaps.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                  {fb.improved_answer_example && (
                    <div className="mt-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-accent">Stronger answer</p>
                      <p className="mt-1 whitespace-pre-wrap text-ink-700">{fb.improved_answer_example}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!loadingQ && questions.length === 0 && (
        <div className="card p-8 text-center text-ink-500">
          Pick a job and start your mock interview.
        </div>
      )}
    </div>
  );
}
