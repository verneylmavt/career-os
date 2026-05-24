"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, Profile, ShortlistEntry } from "@/lib/api";
import { Spinner } from "@/components/Spinner";

function ResumePageInner() {
  const sp = useSearchParams();
  const queryJobId = sp.get("job");

  const [profile, setProfile] = useState<Profile | null>(null);
  const [shortlist, setShortlist] = useState<ShortlistEntry[]>([]);
  const [pasted, setPasted] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tailoring, setTailoring] = useState(false);
  const [coverLoading, setCoverLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<string>(queryJobId || "");
  const [tailored, setTailored] = useState<{
    md: string;
    keywords: string[];
    summary: string;
  } | null>(null);
  const [coverLetter, setCoverLetter] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    try {
      const [p, sl] = await Promise.all([api.getProfile(), api.shortlist()]);
      setProfile(p);
      setShortlist(sl);
      if (!selectedJob && sl.length) setSelectedJob(sl[0].job.id);
    } catch (e: any) {
      setErr(e.message);
    }
  }
  useEffect(() => { load(); }, []);

  async function upload(file?: File) {
    setErr(null);
    setUploading(true);
    try {
      const form = new FormData();
      if (file) {
        form.append("file", file);
      } else if (pasted.trim()) {
        form.append("pasted_text", pasted);
      } else {
        throw new Error("Choose a PDF or paste resume text");
      }
      const p = await api.uploadResume(form);
      setProfile(p);
      setPasted("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function tailor() {
    if (!selectedJob) { setErr("Pick a shortlisted job first"); return; }
    setTailoring(true);
    setTailored(null);
    setErr(null);
    try {
      const r = await api.tailorResume(selectedJob);
      setTailored({ md: r.tailored_resume_md, keywords: r.ats_keywords, summary: r.summary_rewrite });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setTailoring(false);
    }
  }

  async function makeCover() {
    if (!selectedJob) return;
    setCoverLoading(true);
    setCoverLetter("");
    try {
      const r = await api.coverLetter(selectedJob);
      setCoverLetter(r.cover_letter);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setCoverLoading(false);
    }
  }

  function download(name: string, content: string, type = "text/markdown") {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  }

  const hasResume = profile && profile.resume_text;
  const selectedJobEntry = shortlist.find((e) => e.job.id === selectedJob)?.job;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="page-title">Resume optimizer</h1>
        <p className="page-subtitle">Upload once. Tailor for every role, in seconds.</p>
      </header>

      {err && (
        <div className="card border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">{err}</div>
      )}

      {/* Step 1 — Resume */}
      <section className="card p-6">
        <div className="flex items-center gap-2.5 mb-4">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-900 text-white text-xs font-bold">
            1
          </span>
          <h2 className="section-title">Your resume</h2>
        </div>

        {hasResume ? (
          <div className="animate-fade-up space-y-4">
            {/* Profile summary */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ProfileField label="Name" value={profile!.name} />
              <ProfileField label="Email" value={profile!.email} />
              <ProfileField label="Experience" value={`${profile!.experience_years} yrs`} />
              <ProfileField label="Location" value={profile!.preferred_location} />
            </div>

            {profile!.skills.length > 0 && (
              <div>
                <p className="label">Extracted skills</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {profile!.skills.map((s) => (
                    <span key={s} className="pill-accent">{s}</span>
                  ))}
                </div>
              </div>
            )}

            <details>
              <summary className="cursor-pointer text-xs text-ink-400 hover:text-ink-600 transition-colors">
                View raw resume text
              </summary>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-ink-50 p-4 text-xs text-ink-600 leading-relaxed">
                {profile!.resume_text}
              </pre>
            </details>

            <button
              onClick={() => {
                setProfile({ ...profile!, resume_text: "" });
                setTailored(null);
                setCoverLetter("");
              }}
              className="btn-ghost text-xs px-2 py-1"
            >
              ↩ Replace resume
            </button>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {/* Drop zone */}
            <div>
              <p className="label">Upload PDF or text file</p>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed
                            px-6 py-10 text-center transition-colors duration-150
                            ${dragging
                              ? "border-accent bg-accent-soft/30"
                              : "border-ink-200 bg-ink-50 hover:border-ink-300 hover:bg-ink-100"
                            }`}
              >
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true"
                     className={dragging ? "text-accent" : "text-ink-400"}>
                  <path d="M14 4v14M9 9l5-5 5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5 22h18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-ink-700">
                    Drop here or{" "}
                    <span className="text-accent font-semibold">browse</span>
                  </p>
                  <p className="text-xs text-ink-400 mt-0.5">PDF, TXT, or MD</p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.txt,.md"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) upload(f);
                  }}
                />
              </div>
            </div>

            {/* Paste zone */}
            <div className="flex flex-col">
              <p className="label">…or paste text</p>
              <textarea
                className="textarea flex-1"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder="Paste your resume here…"
              />
            </div>

            <div className="md:col-span-2">
              <button
                onClick={() => upload()}
                disabled={uploading || (!pasted.trim())}
                className="btn-primary"
              >
                {uploading ? (
                  <><Spinner size="sm" /> Parsing…</>
                ) : (
                  "Save resume"
                )}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Step 2 — Tailor */}
      <section className="card p-6">
        <div className="flex items-center gap-2.5 mb-4">
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold
                          ${hasResume ? "bg-ink-900 text-white" : "bg-ink-200 text-ink-500"}`}>
            2
          </span>
          <h2 className="section-title">Tailor for a specific role</h2>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="grow">
            <label className="label">Shortlisted job</label>
            <select
              className="input"
              value={selectedJob}
              onChange={(e) => { setSelectedJob(e.target.value); setTailored(null); setCoverLetter(""); }}
              disabled={!shortlist.length}
            >
              <option value="">— Pick a job —</option>
              {shortlist.map((e) => (
                <option key={e.job.id} value={e.job.id}>
                  {e.job.title} @ {e.job.company}
                </option>
              ))}
            </select>
            {!shortlist.length && (
              <p className="mt-1 text-xs text-ink-400">Shortlist a job from Discover first.</p>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={tailor}
              disabled={!hasResume || !selectedJob || tailoring}
              className="btn-primary"
            >
              {tailoring ? <><Spinner size="sm" /> Tailoring…</> : "Tailor resume"}
            </button>
            <button
              onClick={makeCover}
              disabled={!hasResume || !selectedJob || coverLoading}
              className="btn-secondary"
            >
              {coverLoading ? <><Spinner size="sm" /> Writing…</> : "Cover letter"}
            </button>
          </div>
        </div>

        {selectedJobEntry && (
          <p className="mt-2 text-xs text-ink-400">
            Tailoring for: <strong className="text-ink-700">{selectedJobEntry.title}</strong>{" "}
            @ {selectedJobEntry.company}
          </p>
        )}

        {/* Tailored output */}
        {tailored && (
          <div className="mt-6 space-y-4 animate-fade-up">
            {tailored.summary && (
              <div className="rounded-2xl border border-accent-soft bg-accent-soft/40 p-4">
                <p className="text-xs uppercase tracking-wide font-semibold text-accent mb-1">
                  Rewritten summary
                </p>
                <p className="text-sm text-ink-800 leading-relaxed">{tailored.summary}</p>
              </div>
            )}

            {tailored.keywords.length > 0 && (
              <div>
                <p className="label">ATS keywords to weave in</p>
                <div className="flex flex-wrap gap-1.5">
                  {tailored.keywords.map((k) => (
                    <span key={k} className="pill-accent">{k}</span>
                  ))}
                </div>
              </div>
            )}

            <details open>
              <summary className="cursor-pointer text-sm font-semibold text-ink-800 hover:text-ink-600">
                Tailored resume (Markdown)
              </summary>
              <div className="relative mt-2">
                <pre className="max-h-[36rem] overflow-auto whitespace-pre-wrap rounded-2xl bg-ink-50 p-5 text-xs text-ink-700 leading-relaxed border border-ink-100">
                  {tailored.md}
                </pre>
                <button
                  onClick={() => copyToClipboard(tailored.md)}
                  className="absolute right-3 top-3 rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-xs font-medium text-ink-600 hover:bg-ink-50 transition-colors"
                >
                  {copied ? "✓ Copied" : "Copy"}
                </button>
              </div>
            </details>

            <button
              onClick={() => download(`resume-${selectedJob}.md`, tailored.md)}
              className="btn-secondary"
            >
              ↓ Download .md
            </button>
          </div>
        )}

        {/* Cover letter output */}
        {coverLetter && (
          <div className="mt-6 space-y-3 animate-fade-up">
            <p className="section-title">Cover letter</p>
            <div className="relative">
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-2xl bg-ink-50 p-5 text-sm text-ink-700 leading-relaxed border border-ink-100">
                {coverLetter}
              </pre>
              <button
                onClick={() => copyToClipboard(coverLetter)}
                className="absolute right-3 top-3 rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-xs font-medium text-ink-600 hover:bg-ink-50 transition-colors"
              >
                {copied ? "✓ Copied" : "Copy"}
              </button>
            </div>
            <button
              onClick={() => download(`cover-${selectedJob}.md`, coverLetter)}
              className="btn-secondary"
            >
              ↓ Download .md
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-ink-50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-ink-800 truncate">{value || "—"}</p>
    </div>
  );
}

export default function ResumePage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-12"><Spinner label="Loading…" /></div>}>
      <ResumePageInner />
    </Suspense>
  );
}
