"use client";
import Link from "next/link";
import { api, type ShortlistEntry } from "@/lib/api";
import { useResourceAction, useShortlist, useStats } from "@/lib/resources";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Spinner } from "@/components/Spinner";

const STAGES = ["saved", "applied", "interviewing", "offer", "rejected"] as const;
const COLORS = { saved: "bg-ink-300", applied: "bg-sky-400", interviewing: "bg-amber-400", offer: "bg-emerald-400", rejected: "bg-rose-400" };
const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export default function DashboardPage() {
  const stats = useStats();
  const shortlist = useShortlist();
  const action = useResourceAction();
  const items = shortlist.data ?? [];
  async function move(id: string, status: ShortlistEntry["status"]) {
    const result = await action.run(id, (signal) => api.updateShortlist(id, status, undefined, signal));
    if (result) await Promise.allSettled([shortlist.mutate(), stats.mutate()]);
  }
  return <div className="space-y-8">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="page-title">Your career, in one view</h1><p className="page-subtitle">Track applications, surface skill gaps, and review your interview practice.</p></div>
      <Link href="/discover" className="btn-primary">Discover jobs →</Link>
    </header>
    <ErrorNotice error={stats.error} retry={() => void stats.mutate()} />
    {stats.isLoading && !stats.data && <Spinner label="Loading workspace summary…" />}
    {stats.data && <>
      {!stats.data.has_profile && <div className="card border-amber-200 bg-amber-50 p-5"><p className="font-semibold text-amber-900">Add your resume to personalize your workspace</p><p className="mt-1 text-sm text-amber-900">Review extracted facts, calculate skill coverage, and create grounded documents.</p><Link href="/resume" className="btn-accent mt-3">Add resume →</Link></div>}
      <section aria-label="Workspace summary" className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[{ title: "Saved jobs", value: stats.data.total_saved }, { title: "Tailored resumes", value: stats.data.tailored_resumes }, { title: "Cover letters", value: stats.data.cover_letters }].map((stat) => <div key={stat.title} className="card p-5"><p className="text-3xl font-bold text-ink-900">{stat.value}</p><p className="mt-2 text-sm text-ink-600">{stat.title}</p></div>)}
        <div className="card border-accent-soft bg-accent-soft/30 p-5"><p className="text-3xl font-bold text-accent">{stats.data.practice_score === null ? "—" : `${stats.data.practice_score}%`}</p><p className="mt-2 text-sm font-semibold text-ink-700">Practice score</p><p className="mt-1 text-xs text-ink-600">{stats.data.evaluated_answer_count} evaluated {stats.data.evaluated_answer_count === 1 ? "answer" : "answers"}</p></div>
      </section>
      <p className="text-sm text-ink-600">Practice score averages saved feedback for your current profile and active roles. It does not predict hiring outcomes.</p>
    </>}
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="section-title">Application pipeline</h2><span className="text-sm text-ink-600">{items.length} saved roles</span></div>
      <ErrorNotice error={shortlist.error} retry={() => void shortlist.mutate()} />
      {shortlist.isLoading && !shortlist.data && <Spinner label="Loading pipeline…" />}
      {shortlist.data && items.length === 0 && <div className="empty-state"><p>No jobs saved yet</p><Link href="/discover" className="btn-primary">Find your first role →</Link></div>}
      {items.length > 0 && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {STAGES.map((stage) => {
          const entries = items.filter((entry) => entry.status === stage);
          return <div key={stage} className="card overflow-hidden"><div className={`h-1 ${COLORS[stage]}`} /><div className="p-3"><h3 className="mb-3 flex justify-between text-sm font-semibold text-ink-800"><span>{label(stage)}</span><span>{entries.length}</span></h3><ul className="space-y-3">
            {entries.length === 0 && <li className="rounded-xl border border-dashed border-ink-200 p-3 text-sm text-ink-600">No roles</li>}
            {entries.map((entry) => <li key={entry.job.id} className="rounded-xl border border-ink-100 bg-ink-50 p-3"><Link href={`/shortlist#${entry.job.id}`} className="text-sm font-semibold text-ink-900 hover:text-accent">{entry.job.title}</Link><p className="mt-1 text-xs text-ink-600">{entry.job.company}</p><label htmlFor={`stage-${entry.job.id}`} className="label mt-3">Stage</label><select id={`stage-${entry.job.id}`} className="input !px-2 !text-sm" value={entry.status} disabled={action.pending[entry.job.id]} onChange={(event) => void move(entry.job.id, event.target.value as ShortlistEntry["status"])}>{STAGES.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select><ErrorNotice error={action.errors[entry.job.id]} /></li>)}
          </ul></div></div>;
        })}
      </div>}
    </section>
    {stats.data && stats.data.top_skill_gaps.length > 0 && <section className="card p-5"><h2 className="section-title">Top skill gaps</h2><p className="mt-1 text-sm text-ink-600">Required skills across active shortlisted roles that are absent from your profile.</p><div className="mt-4 flex flex-wrap gap-2">{stats.data.top_skill_gaps.map((gap) => <span className="pill-warn" key={gap.skill}>{gap.skill} · {gap.count} {gap.count === 1 ? "role" : "roles"}</span>)}</div></section>}
  </div>;
}
