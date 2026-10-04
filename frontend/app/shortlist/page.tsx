"use client";
import { useState } from "react";
import Link from "next/link";
import { mutate } from "swr";
import { api, type ShortlistEntry } from "@/lib/api";
import { keys, refreshWorkspace, useResourceAction, useShortlist } from "@/lib/resources";
import { ErrorNotice } from "@/components/ErrorNotice";
import { PreparationBrief } from "@/components/PreparationBrief";
import { Spinner } from "@/components/Spinner";

const STAGES = ["saved", "applied", "interviewing", "offer", "rejected"] as const;
const LABEL = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const COLORS = { saved: "bg-ink-300", applied: "bg-sky-400", interviewing: "bg-amber-400", offer: "bg-emerald-400", rejected: "bg-rose-400" };

function SavedRole({ entry }: { entry: ShortlistEntry }) {
  const [notes, setNotes] = useState(entry.notes);
  const [openBrief, setOpenBrief] = useState(false);
  const [message, setMessage] = useState("");
  const action = useResourceAction();
  const id = entry.job.id;
  async function update(patch: { status?: ShortlistEntry["status"]; notes?: string }) {
    const result = await action.run(id, (signal) => api.updateShortlist(id, patch, undefined, signal));
    if (result) {
      await mutate(keys.shortlist, (current: ShortlistEntry[] | undefined) => current?.map((item) => item.job.id === id ? result : item), false);
      setMessage(patch.notes !== undefined ? "Notes saved" : "Stage saved");
      await refreshWorkspace();
    }
  }
  async function remove() {
    const result = await action.run(id, (signal) => api.removeFromShortlist(id, signal));
    if (result) { await mutate(keys.shortlist, (current: ShortlistEntry[] | undefined) => current?.filter((item) => item.job.id !== id), false); await refreshWorkspace(); }
  }
  return <article id={id} className="card min-w-0 overflow-hidden"><div className={`h-1 ${COLORS[entry.status]}`} /><div className="space-y-4 p-4 sm:p-5">
    <div className="flex min-w-0 flex-col justify-between gap-3 sm:flex-row"><div className="min-w-0"><h2 className="break-words text-lg font-semibold text-ink-900">{entry.job.title}</h2><p className="mt-1 text-sm text-ink-600">{entry.job.company} · {entry.job.location} · {entry.job.work_mode}</p><p className="mt-1 text-sm text-ink-600">{entry.job.salary_range} · curated example role</p></div><div className="sm:w-40 sm:shrink-0"><label className="label" htmlFor={`stage-${id}`}>Stage</label><select id={`stage-${id}`} className="input" value={entry.status} disabled={action.pending[id]} onChange={(event) => void update({ status: event.target.value as ShortlistEntry["status"] })}>{STAGES.map((value) => <option key={value} value={value}>{LABEL(value)}</option>)}</select></div></div>
    <div className="flex flex-wrap gap-2">{entry.job.must_have_skills.map((skill) => <span className="pill-accent" key={skill}>{skill}</span>)}</div>
    <form onSubmit={(event) => { event.preventDefault(); void update({ notes }); }}><label className="label" htmlFor={`notes-${id}`}>Notes</label><textarea id={`notes-${id}`} className="textarea !min-h-24" value={notes} onChange={(event) => { setNotes(event.target.value); setMessage(""); }} maxLength={10000} placeholder="Keep application details and questions here…" disabled={action.pending[id]} /><button className="btn-secondary mt-2" disabled={notes === entry.notes || action.pending[id]}>Save notes</button></form>
    <p role="status" className="text-sm text-ink-600">{action.pending[id] ? "Saving changes…" : notes !== entry.notes ? "Unsaved notes" : message}</p><ErrorNotice error={action.errors[id]} />
    <div className="flex flex-wrap gap-2"><Link className="btn-primary" href={`/resume?job=${id}`}>Tailor resume</Link><Link className="btn-secondary" href={`/interview?job=${id}`}>Mock interview</Link><button className="btn-ghost" aria-expanded={openBrief} aria-controls={`brief-${id}`} onClick={() => setOpenBrief(!openBrief)}>Preparation brief</button><button className="btn-danger" disabled={action.pending[id]} onClick={() => void remove()}>Remove</button></div>
    <p className="text-xs text-ink-600">Removing a role keeps its saved documents and interview history available on Resume and Interview.</p>
    {openBrief && <div id={`brief-${id}`}><PreparationBrief jobId={id} /></div>}
  </div></article>;
}

export default function ShortlistPage() {
  const resource = useShortlist();
  return <div className="space-y-6"><header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="page-title">Shortlist</h1><p className="page-subtitle">Manage stages, keep notes, and prepare for each saved role.</p></div><Link className="btn-secondary" href="/discover">Find more roles →</Link></header><ErrorNotice error={resource.error} retry={() => void resource.mutate()} />{resource.isLoading && !resource.data && <Spinner label="Loading saved roles…" />}<div className="grid gap-4">{resource.data?.map((entry) => <SavedRole entry={entry} key={entry.job.id} />)}</div>{resource.data?.length === 0 && <div className="empty-state"><p className="font-medium">Nothing shortlisted yet</p><Link className="btn-primary" href="/discover">Find matching roles →</Link><p className="text-sm text-ink-600">Previously saved preparation remains accessible on Resume and Interview.</p></div>}</div>;
}
