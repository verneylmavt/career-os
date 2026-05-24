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
  const [uploading, setUploading] = useState(false);
  const [tailoring, setTailoring] = useState(false);
  const [coverLoading, setCoverLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<string>(queryJobId || "");
  const [tailored, setTailored] = useState<{ md: string; keywords: string[]; summary: string } | null>(null);
  const [coverLetter, setCoverLetter] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

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
  useEffect(() => {
    load();
  }, []);

  async function upload() {
    setErr(null);
    setUploading(true);
    try {
      const form = new FormData();
      const file = fileRef.current?.files?.[0];
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
    if (!selectedJob) {
      setErr("Pick a shortlisted job first");
      return;
    }
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

  const hasResume = profile && profile.resume_text;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Resume optimizer</h1>
        <p className="mt-1 text-ink-600">Upload once. Tailor for every role.</p>
      </header>

      {err && <div className="card p-4 text-rose-700">{err}</div>}

      <section className="card p-5">
        <h2 className="text-lg font-semibold">1. Your resume</h2>
        {hasResume ? (
          <div className="mt-3 space-y-2 text-sm">
            <p><span className="label inline">Name</span> {profile!.name || "—"}</p>
            <p><span className="label inline">Email</span> {profile!.email || "—"}</p>
            <p><span className="label inline">Experience</span> {profile!.experience_years} years</p>
            <p><span className="label inline">Location</span> {profile!.preferred_location || "—"}</p>
            <div>
              <span className="label">Skills</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {profile!.skills.length === 0 && <span className="text-ink-400 text-sm">—</span>}
                {profile!.skills.map((s) => (
                  <span key={s} className="pill-accent">{s}</span>
                ))}
              </div>
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-sm text-ink-500">View raw text</summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-ink-50 p-3 text-xs text-ink-700">
                {profile!.resume_text}
              </pre>
            </details>
            <button
              onClick={() => {
                setProfile({ ...profile!, resume_text: "" });
                setTailored(null);
                setCoverLetter("");
              }}
              className="text-xs text-ink-500 underline"
            >
              Replace resume
            </button>
          </div>
        ) : (
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Upload PDF</label>
              <input ref={fileRef} type="file" accept=".pdf,.txt,.md" className="input" />
            </div>
            <div>
              <label className="label">…or paste text</label>
              <textarea
                className="textarea"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder="Paste your resume here"
              />
            </div>
            <div className="md:col-span-2">
              <button onClick={upload} disabled={uploading} className="btn-primary">
                {uploading ? "Parsing…" : "Save resume"}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-semibold">2. Tailor for a job</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="grow">
            <label className="label">Shortlisted job</label>
            <select
              className="input"
              value={selectedJob}
              onChange={(e) => setSelectedJob(e.target.value)}
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
              <p className="mt-1 text-xs text-ink-500">Shortlist a job from Discover first.</p>
            )}
          </div>
          <button
            onClick={tailor}
            disabled={!hasResume || !selectedJob || tailoring}
            className="btn-primary"
          >
            {tailoring ? "Tailoring…" : "Tailor resume"}
          </button>
          <button
            onClick={makeCover}
            disabled={!hasResume || !selectedJob || coverLoading}
            className="btn-secondary"
          >
            {coverLoading ? "Writing…" : "Generate cover letter"}
          </button>
        </div>

        {tailoring && <div className="mt-4"><Spinner label="Rewriting…" /></div>}

        {tailored && (
          <div className="mt-5 space-y-4">
            {tailored.summary && (
              <div className="rounded-lg border border-accent-soft bg-accent-soft/50 p-4">
                <p className="text-xs uppercase tracking-wide text-accent">Rewritten summary</p>
                <p className="mt-1 text-sm text-ink-800">{tailored.summary}</p>
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
              <summary className="cursor-pointer text-sm font-medium">Tailored resume (markdown)</summary>
              <pre className="mt-2 max-h-[40rem] overflow-auto whitespace-pre-wrap rounded bg-ink-50 p-4 text-xs text-ink-800">
                {tailored.md}
              </pre>
            </details>
            <button
              onClick={() => download(`resume-${selectedJob}.md`, tailored.md)}
              className="btn-secondary"
            >
              ↓ Download .md
            </button>
          </div>
        )}

        {coverLetter && (
          <div className="mt-5 space-y-2">
            <p className="label">Cover letter</p>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-ink-50 p-4 text-sm text-ink-800">
              {coverLetter}
            </pre>
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

export default function ResumePage() {
  return (
    <Suspense fallback={<Spinner label="Loading…" />}>
      <ResumePageInner />
    </Suspense>
  );
}
