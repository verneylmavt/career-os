"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, DashboardStats, ShortlistEntry } from "@/lib/api";
import { Spinner } from "@/components/Spinner";

const STAGES = ["saved", "applied", "interviewing", "offer", "rejected"] as const;
type Stage = (typeof STAGES)[number];

const STAGE_META: Record<Stage, { label: string; bar: string; dot: string }> = {
  saved:        { label: "Saved",        bar: "bg-ink-300",     dot: "bg-ink-400"     },
  applied:      { label: "Applied",      bar: "bg-sky-400",     dot: "bg-sky-400"     },
  interviewing: { label: "Interviewing", bar: "bg-amber-400",   dot: "bg-amber-400"   },
  offer:        { label: "Offer",        bar: "bg-emerald-400", dot: "bg-emerald-400" },
  rejected:     { label: "Rejected",     bar: "bg-rose-400",    dot: "bg-rose-400"    },
};

const STATUS_PILL: Record<Stage, string> = {
  saved:        "pill",
  applied:      "pill-info",
  interviewing: "pill-warn",
  offer:        "pill-success",
  rejected:     "pill-danger",
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

  useEffect(() => { load(); }, []);

  async function move(job_id: string, status: Stage) {
    await api.updateShortlist(job_id, status);
    await load();
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Your career, in one view</h1>
          <p className="page-subtitle">
            Track every application, surface skill gaps, and measure interview readiness.
          </p>
        </div>
        <Link href="/discover" className="btn-primary">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 10L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Discover jobs
        </Link>
      </header>

      {err && (
        <div className="card border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">{err}</div>
      )}
      {loading && (
        <div className="flex justify-center py-12">
          <Spinner label="Loading dashboard…" />
        </div>
      )}

      {stats && (
        <div className="animate-fade-up space-y-8">
          {/* Resume nudge */}
          {!stats.has_profile && (
            <div className="card border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-amber-900">Upload your resume to unlock everything</p>
                  <p className="mt-0.5 text-sm text-amber-700">
                    Job matches won't be personalised and tailoring is disabled until you do.
                  </p>
                </div>
                <Link href="/resume" className="btn-accent shrink-0">
                  Upload resume →
                </Link>
              </div>
            </div>
          )}

          {/* Stat cards */}
          <section className="grid grid-cols-2 gap-4 md:grid-cols-4 stagger">
            <StatCard
              label="Saved jobs"
              value={stats.total_saved}
              iconBg="icon-bg-purple"
              icon={<BookmarkIcon />}
            />
            <StatCard
              label="Tailored resumes"
              value={stats.tailored_resumes}
              iconBg="icon-bg-emerald"
              icon={<DocumentIcon />}
            />
            <StatCard
              label="Cover letters"
              value={stats.cover_letters}
              iconBg="icon-bg-amber"
              icon={<MailIcon />}
            />
            <ReadinessCard value={stats.interview_readiness} />
          </section>

          {/* Pipeline */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="section-title">Application pipeline</h2>
              <span className="text-xs text-ink-400">{shortlist.length} total</span>
            </div>
            {shortlist.length === 0 ? (
              <div className="empty-state py-10">
                <div className="rounded-2xl bg-ink-100 p-4">
                  <InboxIcon />
                </div>
                <p className="text-sm font-medium text-ink-600">No jobs saved yet</p>
                <Link href="/discover" className="btn-primary mt-1">
                  Find your first match →
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                {STAGES.map((stage) => {
                  const meta = STAGE_META[stage];
                  const items = shortlist.filter((e) => e.status === stage);
                  return (
                    <div key={stage} className="card overflow-hidden">
                      <div className={`h-1 w-full ${meta.bar}`} />
                      <div className="p-3">
                        <div className="mb-2.5 flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-700">
                            <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                            {meta.label}
                          </span>
                          <span className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[10px] font-bold text-ink-500">
                            {items.length}
                          </span>
                        </div>
                        <ul className="space-y-2">
                          {items.length === 0 && (
                            <li className="rounded-lg border border-dashed border-ink-100 py-3 text-center text-[10px] text-ink-300">
                              empty
                            </li>
                          )}
                          {items.map((e) => (
                            <li key={e.job.id} className="rounded-xl border border-ink-100 bg-ink-50 p-2.5">
                              <p className="text-xs font-semibold text-ink-900 line-clamp-1">
                                {e.job.title}
                              </p>
                              <p className="text-[10px] text-ink-400 line-clamp-1">{e.job.company}</p>
                              <select
                                value={e.status}
                                onChange={(ev) => move(e.job.id, ev.target.value as Stage)}
                                className="mt-1.5 w-full rounded-lg border border-ink-200 bg-white px-1.5 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-accent/30"
                              >
                                {STAGES.map((s) => (
                                  <option key={s} value={s}>
                                    {STAGE_META[s].label}
                                  </option>
                                ))}
                              </select>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Skill gaps */}
          {stats.top_skill_gaps.length > 0 && (
            <section className="card p-5">
              <h2 className="section-title">Top skill gaps</h2>
              <p className="mt-1 text-sm text-ink-500">
                Skills required across your shortlist that aren't in your profile yet.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {stats.top_skill_gaps.map((g) => (
                  <span key={g.skill} className="pill-warn">
                    {g.skill}
                    <span className="ml-1.5 rounded-full bg-amber-200/60 px-1 text-[10px] font-bold text-amber-900">
                      ×{g.count}
                    </span>
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

/* ---- Sub-components ---- */

function StatCard({
  label,
  value,
  icon,
  iconBg,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  iconBg: string;
}) {
  return (
    <div className="card animate-fade-up p-5">
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}>
        {icon}
      </div>
      <p className="mt-3 text-2xl font-bold text-ink-900">{value}</p>
      <p className="mt-0.5 text-sm text-ink-500">{label}</p>
    </div>
  );
}

function ReadinessCard({ value }: { value: number }) {
  return (
    <div className="card animate-fade-up p-5">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl icon-bg-sky">
        <LightningIcon />
      </div>
      <div className="mt-3 flex items-end gap-1">
        <p className="text-2xl font-bold text-ink-900">{value}%</p>
      </div>
      <p className="mt-0.5 text-sm text-ink-500">Interview readiness</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-100">
        <div
          className="h-1.5 rounded-full bg-accent transition-all duration-700 ease-out"
          style={{ width: `${Math.max(value, 2)}%` }}
        />
      </div>
    </div>
  );
}

/* ---- Icons ---- */
function BookmarkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M4 3h10a1 1 0 011 1v11l-5-2.8L5 15V4a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
function DocumentIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="3" y="1.5" width="12" height="15" rx="1.75" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.5 6.5h5M6.5 9.5h5M6.5 12.5h3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}
function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="1.5" y="3.5" width="15" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1.5 6l7.5 5 7.5-5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}
function LightningIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M10 2L4 10h6l-1 6 7-8h-6l1-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
function InboxIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true" className="text-ink-400">
      <rect x="3" y="3" width="22" height="22" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 18h5l2 3h8l2-3h5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
