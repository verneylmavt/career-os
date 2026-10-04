"use client";
import { useId } from "react";
import Link from "next/link";
import type { JobContext } from "@/lib/contracts";

export function RoleSelector({ contexts, value, onChange, disabled = false }: {
  contexts: JobContext[]; value: string; onChange: (value: string) => void; disabled?: boolean;
}) {
  const id = useId();
  const roles = contexts.filter((context) => context.shortlisted || context.has_preparation || context.job.id === value);
  const unknown = !disabled && !!value && !contexts.some((context) => context.job.id === value);
  return (
    <div className="min-w-0 flex-1">
      <label className="label" htmlFor={id}>Role</label>
      <select id={id} className="input" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled || !roles.length}>
        <option value="">Choose a role</option>
        {unknown && <option value={value}>Unavailable role</option>}
        {roles.map(({ job, shortlisted, has_preparation }) => <option key={job.id} value={job.id}>{job.title} @ {job.company}{!shortlisted ? has_preparation ? " (retained work)" : " (not shortlisted)" : ""}</option>)}
      </select>
      {unknown && <p role="alert" className="mt-2 text-sm text-rose-700">This role link is unavailable. Choose a saved role or <Link className="text-accent underline" href="/discover">discover a role</Link>.</p>}
      {disabled ? <p className="mt-2 text-sm text-ink-600" role="status">Loading saved roles…</p> : !roles.length && !unknown && <p className="mt-2 text-sm text-ink-600"><Link className="text-accent underline" href="/discover">Shortlist a curated role</Link> to begin. Saved preparation remains available here after removal.</p>}
    </div>
  );
}
