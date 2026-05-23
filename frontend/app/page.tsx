"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, DashboardStats, ShortlistEntry } from "@/lib/api";
import { Spinner } from "@/components/Spinner";

const PIPELINE_STAGES = ["saved", "applied", "interviewing", "offer", "rejected"] as const;
const STAGE_LABEL: Record<(typeof PIPELINE_STAGES)[number], string> = {
  saved: "Saved",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
};
const STAGE_COLOR: Record<string, string> = {
  saved: "bg-ink-100 text-ink-700",
  applied: "bg-sky-100 text-sky-800",
  interviewing: "bg-amber-100 text-amber-800",
  offer: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [shortlist, setShortlist] = useState<ShortlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [s, sl] = await Promise.all([api.stats(), api.shortlist()]);
      setStats(s);
      setShortlist(sl);
    } catch (e: any) {
      setErr(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function move(job_id: string, status: ShortlistEntry["status"]) {
    await api.updateShortlist(job_id, status);
    await load();
  }

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Your career, in one view</h1>
          <p className="mt-1 text-ink-600">
            Track pipeline, skill gaps, and interview readiness — all from your shortlist.
          </p>
        </div>
        <Link href="/discover" className="btn-primary">+ Discover jobs</Link>
      </header>

      {err && <div className="card p-4 text-rose-700">{err}</div>}
      {loading && <Spinner label="Loading dashboard…" />}

      {stats && (
        <>
          {!stats.has_profile && (
            <div className="card border-amber-200 bg-amber-50 p-5">
              <p className="font-medium text-amber-900">Upload your resume to unlock everything</p>
              <p className="mt-1 text-sm text-amber-800">
                Without a profile, job matches won't be personalised and tailoring is disabled.
              </p>
              <Link href="/resume" className="btn-primary mt-3">Upload resume →</Link>
            </div>
          )}

          <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Saved jobs" value={stats.total_saved} />
            <StatCard label="Tailored resumes" value={stats.tailored_resumes} />
            <StatCard label="Cover letters" value={stats.cover_letters} />
            <StatCard label="Interview readiness" value={`${stats.interview_readiness}%`} />
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Pipeline</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
              {PIPELINE_STAGES.map((stage) => {
                const items = shortlist.filter((e) => e.status === stage);
                return (
                  <div key={stage} className="card p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STAGE_COLOR[stage]}`}>
                        {STAGE_LABEL[stage]}
                      </span>
                      <span className="text-xs text-ink-500">{items.length}</span>
                    </div>
                    <ul className="space-y-2">
                      {items.length === 0 && <li className="text-xs text-ink-400">—</li>}
                      {items.map((e) => (
                        <li key={e.job.id} className="rounded-md border border-ink-100 bg-ink-50 p-2">
                          <p className="text-xs font-medium text-ink-900 line-clamp-1">{e.job.title}</p>
                          <p className="text-[10px] text-ink-500 line-clamp-1">{e.job.company}</p>
                          <select
                            value={e.status}
                            onChange={(ev) => move(e.job.id, ev.target.value as any)}
                            className="mt-1 w-full rounded border border-ink-200 bg-white px-1 py-0.5 text-[10px]"
                          >
                            {PIPELINE_STAGES.map((s) => (
                              <option key={s} value={s}>{STAGE_LABEL[s]}</option>
                            ))}
                          </select>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>

          {stats.top_skill_gaps.length > 0 && (
            <section className="card p-5">
              <h2 className="text-lg font-semibold">Top skill gaps across your shortlist</h2>
              <p className="mt-1 text-sm text-ink-600">
                Skills required by jobs you've saved but missing from your profile.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {stats.top_skill_gaps.map((g) => (
                  <span key={g.skill} className="pill-warn">
                    {g.skill} <span className="ml-1 text-amber-700/70">×{g.count}</span>
                  </span>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
    </div>
  );
}
