"use client";
import { useId, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Profile } from "@/lib/contracts";
import { useResourceAction } from "@/lib/resources";
import { Spinner } from "./Spinner";

export function ResumeUpload({ onSaved, onCancel, replacing = false, expectedRevision = 0 }: { onSaved: (profile: Profile) => void; onCancel?: () => void; replacing?: boolean; expectedRevision?: number }) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const action = useResourceAction();
  const key = "profile-upload";
  function choose(candidate?: File) {
    setError("");
    if (!candidate) return;
    if (!/\.(pdf|txt|md)$/i.test(candidate.name)) { setFile(null); setError("Choose a PDF, TXT, or MD file."); return; }
    if (candidate.size > 5 * 1024 * 1024) { setFile(null); setError("Choose a file no larger than 5 MiB."); return; }
    setFile(candidate);
    setText("");
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!file && !text.trim()) return;
    const form = new FormData();
    form.append("expected_revision", String(expectedRevision));
    if (file) form.append("file", file);
    else form.append("pasted_text", text);
    const result = await action.run(key, (signal) => api.uploadResume(form, signal));
    if (result) onSaved(result);
  }
  return (
    <form className="space-y-4" onSubmit={save}>
      {replacing && <p className="text-sm text-ink-600">Your current profile and saved work stay available until the replacement is saved successfully.</p>}
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!action.pending[key]) choose(event.dataTransfer.files[0]); }} className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-ink-200 bg-ink-50 p-5 text-center">
          <label htmlFor={`${id}-file`} className="text-sm font-semibold text-ink-800">Resume file</label>
          <input id={`${id}-file`} ref={fileRef} type="file" accept=".pdf,.txt,.md" className="sr-only" onChange={(event) => choose(event.target.files?.[0])} disabled={action.pending[key]} />
          <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()} disabled={action.pending[key]}>Choose file</button>
          <p className="max-w-full break-all text-sm text-ink-700">{file?.name || "Drop a PDF, TXT, or MD here"}</p>
          <p className="text-xs text-ink-600">Maximum 5 MiB, 25 PDF pages, and 40,000 text characters. Scanned PDFs need selectable text.</p>
        </div>
        <div>
          <label htmlFor={`${id}-text`} className="label">Resume text</label>
          <textarea id={`${id}-text`} className="textarea min-h-44" value={text} maxLength={40_000} placeholder="Or paste your resume text" onChange={(event) => { setText(event.target.value); setFile(null); setError(""); if (fileRef.current) fileRef.current.value = ""; }} disabled={action.pending[key]} />
          <p className="mt-1 text-xs text-ink-600">{text.length.toLocaleString()} / 40,000 characters</p>
        </div>
      </div>
      {(error || action.errors[key]) && <p role="alert" className="text-sm text-rose-700">{error || action.errors[key]}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary" disabled={action.pending[key] || (!file && !text.trim())}>{action.pending[key] ? <><Spinner size="sm" /> Saving resume…</> : replacing ? "Save replacement" : "Save resume"}</button>
        {onCancel && <button type="button" className="btn-secondary" onClick={() => { action.cancel(key); onCancel(); }}>Cancel replacement</button>}
      </div>
      <p role="status" className="text-sm text-ink-600">{action.pending[key] ? "Extracting and validating candidate facts. Your current profile is preserved if this fails." : ""}</p>
    </form>
  );
}
