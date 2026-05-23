"use client";
import { useEffect, useState } from "react";
import { api, JobMatch } from "@/lib/api";
import { JobCard } from "@/components/JobCard";
import { Spinner } from "@/components/Spinner";

const EXAMPLES = [
  "I want an AI Engineer role focused on generative AI and NLP in Singapore with hybrid work flexibility.",
  "Remote senior ML engineer in healthcare, ideally in APAC.",
  "Internship in Jakarta — happy to learn Python and prompt engineering.",
];

export default function DiscoverPage() {
  const [q, setQ] = useState(EXAMPLES[0]);
  const [results, setResults] = useState<JobMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shortlisted, setShortlisted] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.shortlist().then((sl) => setShortlisted(new Set(sl.map((e) => e.job.id)))).catch(() => {});
  }, []);

  async function run() {
    if (!q.trim()) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await api.search(q);
      setResults(r);
    } catch (e: any) {
      setErr(e.message || "Search failed");
    } finally {
      setLoading(false);
    }
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
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Describe your ideal role</h1>
        <p className="mt-1 text-ink-600">
          Plain English in → ranked, explained matches out. We'll filter by location, mode, seniority, and skills automatically.
        </p>
      </header>

      <div className="card p-5">
        <label className="label">Your wish</label>
        <textarea
          className="textarea"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. Senior NLP engineer in Singapore, hybrid, working on multilingual LLMs"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={run} disabled={loading} className="btn-primary">
            {loading ? "Searching…" : "Find matches"}
          </button>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setQ(ex)}
              className="rounded-md border border-ink-200 bg-white px-2.5 py-1 text-xs text-ink-600 hover:bg-ink-100"
            >
              Try: {ex.slice(0, 38)}…
            </button>
          ))}
        </div>
      </div>

      {err && <div className="card p-4 text-rose-700">{err}</div>}
      {loading && <Spinner label="Matching…" />}

      <div className="grid gap-4">
        {results.map((m) => (
          <JobCard
            key={m.job.id}
            match={m}
            shortlisted={shortlisted.has(m.job.id)}
            onShortlist={() => add(m.job.id)}
          />
        ))}
      </div>

      {!loading && results.length === 0 && (
        <div className="card p-8 text-center text-ink-500">
          Run a search to see ranked matches.
        </div>
      )}
    </div>
  );
}
