"use client";
import { mutate } from "swr";
import { api } from "@/lib/api";
import { keys, refreshWorkspace, useDossier, useResourceAction } from "@/lib/resources";
import { ErrorNotice } from "@/components/ErrorNotice";
import { SafeMarkdown } from "@/components/SafeMarkdown";
import { savedTime } from "@/components/GeneratedDocument";
import { Spinner } from "@/components/Spinner";
export function PreparationBrief({ jobId }: { jobId: string }) {
  const resource = useDossier(jobId);
  const action = useResourceAction();
  async function generate() {
    const result = await action.run(jobId, (signal) => api.generateDossier(jobId, !!resource.data, signal));
    if (result) { await mutate(keys.dossier(jobId), result, false); await refreshWorkspace(); }
  }
  return <section aria-label="Preparation brief" className="mt-4 space-y-4 rounded-2xl border border-ink-200 bg-ink-50 p-4">
    <h3 className="section-title">Preparation brief</h3><p className="text-sm text-ink-700">Derived from the curated job posting. Review these interpretations; this is not independent company research.</p>
    <ErrorNotice error={resource.error} retry={() => void resource.mutate()} /><ErrorNotice error={action.errors[jobId]} />
    {resource.isLoading && !resource.data && <Spinner label="Restoring preparation brief…" />}
    <button className="btn-secondary" onClick={() => void generate()} disabled={resource.isLoading || action.pending[jobId]}>{action.pending[jobId] ? "Generating brief…" : resource.data ? "Refresh brief" : "Generate brief"}</button>
    <p role="status" className="text-sm text-ink-600">{action.pending[jobId] ? "Existing preparation remains visible while the brief is refreshed." : ""}</p>
    {resource.data && <><p className="text-xs text-ink-600">Generated <time dateTime={resource.data.generated_at}>{savedTime(resource.data.generated_at)}</time> {resource.data.is_stale && <span className="pill-warn">Outdated profile</span>}</p><div><h4 className="mb-2 font-semibold text-ink-800">Role mission from the posting</h4><SafeMarkdown>{resource.data.mission_guess}</SafeMarkdown></div>{[{ title: "Talking points", items: resource.data.talking_points }, { title: "Questions to ask", items: resource.data.smart_questions_to_ask }, { title: "Things to clarify", items: resource.data.watch_outs }].map((section) => <div key={section.title}><h4 className="font-semibold text-ink-800">{section.title}</h4><ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-700">{section.items.map((item, index) => <li key={index}>{item}</li>)}</ul></div>)}</>}
    {resource.data === null && <p className="text-sm text-ink-600">No saved brief yet. Generation starts when you choose Generate brief.</p>}
  </section>;
}
