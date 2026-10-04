"use client";
import { useState } from "react";
import { api, type SearchResult } from "@/lib/api";
import { refreshWorkspace, useResourceAction, useShortlist } from "@/lib/resources";
import { ErrorNotice } from "@/components/ErrorNotice";
import { JobCard } from "@/components/JobCard";
import { Spinner } from "@/components/Spinner";

const EXAMPLES = ["AI Engineer in Singapore, hybrid", "Senior machine learning engineer, remote", "Jakarta internship with Python"];

export default function DiscoverPage() {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({ location: "", work_mode: "", seniority: "" });
  const [result, setResult] = useState<{ query: string; data: SearchResult } | null>(null);
  const shortlist = useShortlist();
  const action = useResourceAction();
  const saved = new Set(shortlist.data?.map((entry) => entry.job.id));
  async function search() {
    const submitted = query.trim();
    if (!submitted) return;
    const explicit = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
    const response = await action.run("search", (signal) => api.search(submitted, explicit, signal));
    if (response) setResult({ query: submitted, data: response });
  }
  async function save(id: string) {
    const response = await action.run(`save:${id}`, (signal) => api.addToShortlist(id, "saved", "", signal));
    if (response) await refreshWorkspace();
  }
  return <div className="space-y-6">
    <header><h1 className="page-title">Discover your next role</h1><p className="page-subtitle">Search ten curated example roles. Results reflect your request; skill coverage uses your profile.</p></header>
    <form className="card space-y-4 p-5" onSubmit={(event) => { event.preventDefault(); void search(); }}>
      <div><label className="label" htmlFor="job-query">What are you looking for?</label><textarea id="job-query" className="textarea text-base" rows={3} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void search(); } }} placeholder="e.g. AI engineer in Singapore, hybrid…" maxLength={2000} /></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="label" htmlFor="search-location">Location</label><input id="search-location" className="input" placeholder="Any location" value={filters.location} onChange={(event) => setFilters({ ...filters, location: event.target.value })} maxLength={200} /></div>
        <div><label className="label" htmlFor="search-mode">Work mode</label><select id="search-mode" className="input" value={filters.work_mode} onChange={(event) => setFilters({ ...filters, work_mode: event.target.value })}><option value="">From request / any</option>{["Remote", "Hybrid", "On-site"].map((value) => <option key={value}>{value}</option>)}</select></div>
        <div><label className="label" htmlFor="search-level">Seniority</label><select id="search-level" className="input" value={filters.seniority} onChange={(event) => setFilters({ ...filters, seniority: event.target.value })}><option value="">From request / any</option>{["Intern", "Junior", "Mid", "Mid-Senior", "Senior", "Staff"].map((value) => <option key={value}>{value}</option>)}</select></div>
      </div>
      <div className="flex flex-wrap gap-2">{EXAMPLES.map((example) => <button key={example} type="button" className="btn-ghost !border !border-ink-200 !text-xs" onClick={() => setQuery(example)}>{example}</button>)}</div>
      <div className="flex flex-wrap items-center gap-3"><button className="btn-primary" disabled={!query.trim() || action.pending.search}>{action.pending.search ? <><Spinner size="sm" /> Searching…</> : "Find matches"}</button>{action.pending.search && <button type="button" className="btn-secondary" onClick={() => action.cancel("search")}>Cancel search</button>}<p className="text-xs text-ink-600">Ctrl or ⌘ + Enter to search. Explicit filters override the request.</p></div>
    </form>
    <ErrorNotice error={action.errors.search} />
    <ErrorNotice error={shortlist.error} retry={() => void shortlist.mutate()} />
    {result && <>
      <p role="status" className="text-sm text-ink-700">{result.data.results.length} {result.data.results.length === 1 ? "role" : "roles"} for “{result.query}” · request relevance, then skill coverage</p>
      <div className="flex flex-wrap gap-2">{[result.data.filters.location, result.data.filters.work_mode, result.data.filters.seniority].filter(Boolean).map((value) => <span className="pill" key={value}>{value}</span>)}</div>
      {result.data.warnings.map((warning) => <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900" key={warning}>{warning}</p>)}
      {!result.data.personalized && <p className="text-sm text-ink-700">Add skills to calculate fit. You can review your profile on Resume.</p>}
      <div className="grid gap-3">{result.data.results.map((match) => <div key={match.job.id}><JobCard match={match} shortlisted={saved.has(match.job.id)} pending={action.pending[`save:${match.job.id}`]} onShortlist={() => void save(match.job.id)} /><ErrorNotice error={action.errors[`save:${match.job.id}`]} /></div>)}</div>
      {result.data.results.length === 0 && <div className="empty-state"><p className="font-medium text-ink-700">No matching roles in this curated dataset</p><p className="text-sm text-ink-600">Try broader criteria or a different role. This is a sample catalog, not a live job feed.</p></div>}
    </>}
    {!result && !action.pending.search && <div className="empty-state"><p>Describe your next role to explore the curated catalog.</p><p className="text-sm text-ink-600">AI helps parse your request; local keyword search is available when AI is unavailable.</p></div>}
  </div>;
}
