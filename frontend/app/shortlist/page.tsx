"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Dossier, ShortlistEntry } from "@/lib/api";
import { Spinner } from "@/components/Spinner";

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
      const sl = await api.shortlist();
      setItems(sl);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function remove(id: string) {
    await api.removeFromShortlist(id);
    load();
  }

  async function showDossier(jobId: string) {
    setOpenDossier(jobId);
    setDossier(null);
    setDossierLoading(true);
    try {
      const d = await api.dossier(jobId);
      setDossier(d);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setDossierLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Shortlist</h1>
          <p className="mt-1 text-ink-600">Jobs you've bookmarked, with one-click prep.</p>
        </div>
        <Link href="/discover" className="btn-secondary">+ Find more</Link>
      </header>

      {err && <div className="card p-4 text-rose-700">{err}</div>}
      {loading && <Spinner label="Loading…" />}

      {!loading && items.length === 0 && (
        <div className="card p-8 text-center text-ink-500">
          Nothing here yet. <Link href="/discover" className="text-accent underline">Find some matches →</Link>
        </div>
      )}

      <div className="grid gap-4">
        {items.map((e) => (
          <div key={e.job.id} className="card p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-base font-semibold">{e.job.title}</h3>
                <p className="text-sm text-ink-600">
                  {e.job.company} · {e.job.location} · {e.job.work_mode}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {e.job.must_have_skills.slice(0, 6).map((s) => (
                    <span key={s} className="pill-accent">{s}</span>
                  ))}
                </div>
              </div>
              <span className="pill">{e.status}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/resume?job=${e.job.id}`} className="btn-primary">Tailor resume</Link>
              <Link href={`/interview?job=${e.job.id}`} className="btn-secondary">Mock interview</Link>
              <button onClick={() => showDossier(e.job.id)} className="btn-secondary">Company dossier</button>
              <button onClick={() => remove(e.job.id)} className="ml-auto rounded-md px-2 py-1 text-xs text-ink-500 hover:bg-rose-50 hover:text-rose-700">
                Remove
              </button>
            </div>

            {openDossier === e.job.id && (
              <div className="mt-4 rounded-lg border border-ink-200 bg-ink-50 p-4">
                {dossierLoading && <Spinner label="Researching…" />}
                {dossier && (
                  <div className="space-y-3 text-sm">
                    <div>
                      <p className="font-semibold text-ink-900">Mission (guess)</p>
                      <p className="text-ink-700">{dossier.mission_guess}</p>
                    </div>
                    <DossierList title="Talking points" items={dossier.talking_points} />
                    <DossierList title="Smart questions to ask" items={dossier.smart_questions_to_ask} />
                    <DossierList title="Watch-outs" items={dossier.watch_outs} />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DossierList({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="font-semibold text-ink-900">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-700">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}
