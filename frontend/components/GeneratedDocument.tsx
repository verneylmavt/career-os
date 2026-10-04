"use client";
import { useState } from "react";
import { SafeMarkdown } from "./SafeMarkdown";

export function savedTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Saved" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function GeneratedDocument({ title, content, fileName, generatedAt, isStale = false }: {
  title: string; content: string; fileName: string; generatedAt: string; isStale?: boolean;
}) {
  const [copyStatus, setCopyStatus] = useState("");
  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(content);
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Clipboard access was blocked. Download the document or select the text to copy it.");
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([new TextEncoder().encode(content)], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="min-w-0 space-y-3 rounded-2xl border border-ink-200 bg-ink-50 p-4 sm:p-5" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="section-title">{title}</h3>
        {isStale && <span className="pill-warn">Outdated profile</span>}
      </div>
      <p className="text-xs text-ink-600">Generated <time dateTime={generatedAt}>{savedTime(generatedAt)}</time>{isStale && ". Your profile changed since this was generated."}</p>
      <SafeMarkdown>{content}</SafeMarkdown>
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" onClick={copy} aria-label={`Copy ${title}`}>Copy</button>
        <button className="btn-secondary" onClick={download} aria-label={`Download ${title}`}>Download .md</button>
      </div>
      <p role="status" className="text-sm text-ink-700">{copyStatus}</p>
    </section>
  );
}
