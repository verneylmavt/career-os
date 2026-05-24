"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Dossier, ShortlistEntry } from "@/lib/api";
import { Spinner } from "@/components/Spinner";

const STATUS_PILL: Record<string, string> = {
  saved:        "pill",
  applied:      "pill-info",
  interviewing: "pill-warn",
  offer:        "pill-success",
  rejected:     "pill-danger",
};

const STATUS_BAR: Record<string, string> = {
  saved:        "bg-ink-300",
  applied:      "bg-sky-400",
  interviewing: "bg-amber-400",
  offer:        "bg-emerald-400",
  rejected:     "bg-rose-400",
};

const STATUS_LABELS = ["saved", "applied", "interviewing", "offer", "rejected"] as const;

export default function ShortlistPage() {
  const [items, setItems] = useState<ShortlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openDossier, setOpenDossier] = useState<string | null>(null);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [dossierLoading, setDossierLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setItems(await api.shortlist());
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function remove(id: string) {
    await api.removeFromShortlist(id);
    load();
  }

  async function showDossier(jobId: string) {
    if (openDossier === jobId) {
      setOpenDossier(null);
      setDossier(null);
      return;
    }
    setOpenDossier(jobId);
    setDossier(null);
    setDossierLoading(true);
    try {
      setDossier(await api.dossier(jobId));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setDossierLoading(false);
    }
  }

  async function updateStatus(jobId: string, status: ShortlistEntry["status"]) {
    await api.updateShortlist(jobId, status);
    load();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Shortlist</h1>
          <p className="page-subtitle">Jobs you've saved, with one-click prep for each.</p>
        </div>
        <Link href="/discover" className="btn-secondary">
          + Find more
        </Link>
      </header>

      {err && (
        <div className="card border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">{err}</div>
      )}
      {loading && (
        <div className="flex justify-center py-12">
          <Spinner label="Loading…" />
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="empty-state py-14">
          <div className="rounded-2xl bg-ink-100 p-4">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true" className="text-ink-400">
              <path d="M5 4h18a1 1 0 011 1v17l-9-4.5L5 22V5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-sm font-medium text-ink-600">Nothing saved yet</p>
          <Link href="/discover" className="btn-primary mt-1">
            Find matching roles →
          </Link>
        </div>
      )}

      <div className="grid gap-4">
        {items.map((e, i) => (
          <div
            key={e.job.id}
            className="card overflow-hidden animate-fade-up"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            {/* Status bar */}
            <div className={`h-1 w-full ${STATUS_BAR[e.status] ?? "bg-ink-200"}`} />

            <div className="p-5">
              {/* Job info */}
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-semibold text-ink-900">{e.job.title}</h3>
                    <span className={STATUS_PILL[e.status] ?? "pill"}>{e.status}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-ink-500">
                    {e.job.company} · {e.job.location} · {e.job.work_mode}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-400">{e.job.salary_range}</p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {e.job.must_have_skills.slice(0, 6).map((s) => (
                      <span key={s} className="pill-accent">{s}</span>
                    ))}
                  </div>
                </div>

                {/* Status selector */}
                <div className="shrink-0">
                  <label className="label sr-only">Stage</label>
                  <select
                    value={e.status}
                    onChange={(ev) => updateStatus(e.job.id, ev.target.value as ShortlistEntry["status"])}
                    className="rounded-xl border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-medium
                               text-ink-700 focus:outline-none focus:ring-2 focus:ring-accent/25"
                  >
                    {STATUS_LABELS.map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link href={`/resume?job=${e.job.id}`} className="btn-primary">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                    <rect x="1.5" y="1" width="10" height="11" rx="1.25" stroke="currentColor" strokeWidth="1.25" />
                    <path d="M4 4.5h5M4 6.5h5M4 8.5h3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                  </svg>
                  Tailor resume
                </Link>
                <Link href={`/interview?job=${e.job.id}`} className="btn-secondary">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                    <path d="M6.5 1C3.74 1 1.5 3.01 1.5 5.5c0 .94.29 1.81.79 2.54L2 12l3.2-.94c.41.11.84.19 1.3.19 2.76 0 5-2.01 5-4.5S9.26 1 6.5 1z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
                  </svg>
                  Mock interview
                </Link>
                <button
                  onClick={() => showDossier(e.job.id)}
                  className={openDossier === e.job.id ? "btn-ghost !bg-ink-100 text-ink-900" : "btn-ghost"}
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                    <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.25" />
                    <path d="M6.5 5.5v4M6.5 3.5v.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                  </svg>
                  {openDossier === e.job.id ? "Close dossier" : "Company dossier"}
                </button>
                <button
                  onClick={() => remove(e.job.id)}
                  className="btn-danger ml-auto"
                >
                  Remove
                </button>
              </div>

              {/* Dossier panel */}
              {openDossier === e.job.id && (
                <div className="mt-4 animate-fade-up rounded-2xl border border-ink-100 bg-ink-50 p-4">
                  {dossierLoading && <Spinner label="Researching…" />}
                  {dossier && (
                    <div className="space-y-4 text-sm">
                      <DossierBlock
                        icon="🏢"
                        title="Mission (guess)"
                        text={dossier.mission_guess}
                      />
                      <DossierList
                        icon="💡"
                        title="Talking points"
                        items={dossier.talking_points}
                      />
                      <DossierList
                        icon="❓"
                        title="Smart questions to ask"
                        items={dossier.smart_questions_to_ask}
                      />
                      <DossierList
                        icon="⚠️"
                        title="Watch-outs"
                        items={dossier.watch_outs}
                        warn
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DossierBlock({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 font-semibold text-ink-900">
        <span>{icon}</span> {title}
      </p>
      <p className="mt-1 text-ink-600 leading-relaxed">{text}</p>
    </div>
  );
}

function DossierList({
  icon,
  title,
  items,
  warn,
}: {
  icon: string;
  title: string;
  items: string[];
  warn?: boolean;
}) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="flex items-center gap-1.5 font-semibold text-ink-900">
        <span>{icon}</span> {title}
      </p>
      <ul className={`mt-1.5 space-y-1 pl-5 list-disc ${warn ? "text-amber-700" : "text-ink-600"}`}>
        {items.map((it, i) => (
          <li key={i} className="leading-relaxed">{it}</li>
        ))}
      </ul>
    </div>
  );
}
