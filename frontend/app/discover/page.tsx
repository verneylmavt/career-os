"use client";
import { useEffect, useState } from "react";
import { api, JobMatch } from "@/lib/api";
import { JobCard } from "@/components/JobCard";
import { Spinner } from "@/components/Spinner";

const EXAMPLES = [
  "AI Engineer in Singapore, hybrid, gen-AI focus",
  "Remote senior ML engineer in healthcare, APAC",
  "Jakarta internship — Python and prompt engineering",
];

export default function DiscoverPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<JobMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shortlisted, setShortlisted] = useState<Set<string>>(new Set());
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    api
      .shortlist()
      .then((sl) => setShortlisted(new Set(sl.map((e) => e.job.id))))
      .catch(() => {});
  }, []);

  async function run() {
    const query = q.trim();
    if (!query) return;
    setLoading(true);
    setErr(null);
    setHasSearched(true);
    try {
      const r = await api.search(query);
      setResults(r);
    } catch (e: any) {
      setErr(e.message || "Search failed");
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run();
  }

  async function add(jobId: string) {
    try {
      await api.addToShortlist(jobId);
      setShortlisted((prev) => new Set(prev).add(jobId));
    } catch (e: any) {
      setErr(e.message || "Could not shortlist");
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header>
        <h1 className="page-title">Discover your next role</h1>
        <p className="page-subtitle">
          Describe what you're looking for in plain English — we handle filters, ranking, and fit explanations.
        </p>
      </header>

      {/* Search card */}
      <div className="card p-5 shadow-sm">
        <label className="label">What are you looking for?</label>
        <textarea
          className="textarea text-base"
          rows={3}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={handleKey}
          placeholder="e.g. Senior NLP engineer in Singapore, hybrid, multilingual LLMs…"
        />

        {/* Examples + CTA */}
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-ink-400 self-center mr-0.5">Try:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setQ(ex)}
                className="rounded-full border border-ink-200 bg-ink-50 px-3 py-1 text-xs text-ink-600
                           hover:bg-ink-100 hover:border-ink-300 transition-colors duration-150"
              >
                {ex}
              </button>
            ))}
          </div>
          <button
            onClick={run}
            disabled={loading || !q.trim()}
            className="btn-primary shrink-0"
          >
            {loading ? (
              <>
                <Spinner size="sm" />
                Searching…
              </>
            ) : (
              <>
                Find matches
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                  <path d="M2 6.5h9M7.5 2.5L11 6.5l-3.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </>
            )}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-ink-300">⌘ Ctrl+Enter to search</p>
      </div>

      {err && (
        <div className="card border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">{err}</div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-ink-500">
            <span className="text-ink-900 font-bold">{results.length}</span> matches found
          </p>
          <p className="text-xs text-ink-400">Ranked by skill fit</p>
        </div>
      )}

      <div className="grid gap-3">
        {results.map((m, i) => (
          <div key={m.job.id} style={{ animationDelay: `${i * 40}ms` }}>
            <JobCard
              match={m}
              shortlisted={shortlisted.has(m.job.id)}
              onShortlist={() => add(m.job.id)}
            />
          </div>
        ))}
      </div>

      {!loading && hasSearched && results.length === 0 && (
        <div className="empty-state">
          <div className="rounded-2xl bg-ink-100 p-4">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true" className="text-ink-400">
              <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" />
              <path d="M18 18L25 25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M9 12h6M12 9v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-sm font-medium text-ink-600">No matches — try broadening your search</p>
        </div>
      )}

      {!loading && !hasSearched && (
        <div className="empty-state py-14">
          <div className="rounded-2xl bg-ink-100 p-4">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true" className="text-ink-400">
              <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" />
              <path d="M18 18L25 25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-sm font-medium text-ink-600">Describe your ideal role above to see ranked matches</p>
        </div>
      )}
    </div>
  );
}
