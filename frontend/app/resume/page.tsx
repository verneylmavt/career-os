"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSWRConfig } from "swr";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/api-client";
import type { Documents, Profile } from "@/lib/contracts";
import { keys, useContexts, useDocuments, useProfile, useResourceAction } from "@/lib/resources";
import { GeneratedDocument, savedTime } from "@/components/GeneratedDocument";
import { ProfileEditor } from "@/components/ProfileEditor";
import { ResumeUpload } from "@/components/ResumeUpload";
import { RoleSelector } from "@/components/RoleSelector";
import { Spinner } from "@/components/Spinner";

function ResumePageInner() {
  const search = useSearchParams();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const profileResource = useProfile();
  const contextResource = useContexts();
  const contexts = contextResource.data ?? [];
  const jobId = search.get("job") || contexts.find((context) => context.shortlisted || context.has_preparation)?.job.id || "";
  const selected = contexts.find((context) => context.job.id === jobId);
  const [tone, setTone] = useState("warm");
  const documents = useDocuments(selected ? jobId : "", tone);
  const action = useResourceAction();
  const [profileMode, setProfileMode] = useState<"review" | "edit" | "replace">("review");
  const profile = profileResource.data;
  const hasResume = !!profile?.resume_text.trim();
  const resumeKey = `${jobId}:resume`;
  const letterKey = `${jobId}:letter:${tone}`;

  async function saveProfile(saved: Profile) {
    await profileResource.mutate(saved, false);
    setProfileMode("review");
    await mutate((key) => typeof key === "string" && (key.startsWith("/api/resume/") || key.startsWith("/api/interview/") || key.endsWith("/dossier") || key === keys.stats));
  }
  async function tailor() {
    if (!selected || !hasResume) return;
    const capturedJob = jobId;
    const capturedKey = keys.documents(capturedJob, tone);
    const regenerate = !!documents.data?.tailored_resume;
    await action.run(resumeKey, async (signal) => {
      const result = await api.tailorResume(capturedJob, regenerate, signal);
      await mutate(capturedKey, (previous: Documents | undefined) => ({ job_id: capturedJob, tailored_resume: result, cover_letter: previous?.cover_letter ?? null }), false);
      void mutate(keys.contexts);
      void mutate(keys.stats);
      return result;
    });
  }
  async function coverLetter() {
    if (!selected || !hasResume) return;
    const capturedJob = jobId;
    const capturedTone = tone;
    const capturedKey = keys.documents(capturedJob, capturedTone);
    const regenerate = !!documents.data?.cover_letter;
    await action.run(letterKey, async (signal) => {
      const result = await api.coverLetter(capturedJob, capturedTone, regenerate, signal);
      await mutate(capturedKey, (previous: Documents | undefined) => ({ job_id: capturedJob, tailored_resume: previous?.tailored_resume ?? null, cover_letter: result }), false);
      void mutate(keys.contexts);
      void mutate(keys.stats);
      return result;
    });
  }
  return (
    <div className="min-w-0 space-y-6">
      <header><h1 className="page-title">Resume optimizer</h1><p className="page-subtitle">Review your candidate facts, then create and keep documents for each role.</p></header>
      <section className="card min-w-0 space-y-4 p-4 sm:p-6" aria-labelledby="profile-heading">
        <h2 id="profile-heading" className="section-title">1. Your profile</h2>
        {profileResource.error && <p role="alert" className="text-sm text-rose-700">{errorMessage(profileResource.error)} <button className="underline" onClick={() => void profileResource.mutate()}>Retry profile</button></p>}
        {profileResource.isLoading && <Spinner label="Loading your profile…" />}
        {profile && (profileMode === "replace" || !hasResume) ? <ResumeUpload onSaved={saveProfile} replacing={hasResume} expectedRevision={profile.revision} onCancel={hasResume ? () => setProfileMode("review") : undefined} /> : profile && profileMode === "edit" ? <ProfileEditor key={profile.revision} profile={profile} onSaved={saveProfile} onCancel={() => setProfileMode("review")} /> : profile && hasResume ? (
          <div className="space-y-4">
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <ProfileField label="Name" value={profile.name} /><ProfileField label="Email" value={profile.email} /><ProfileField label="Experience" value={`${profile.experience_years} years`} /><ProfileField label="Preferred location" value={profile.preferred_location} />
            </div>
            <div><p className="label">Candidate skills</p><div className="flex flex-wrap gap-1.5">{profile.skills.length ? profile.skills.map((skill) => <span key={skill} className="pill-accent">{skill}</span>) : <p className="text-sm text-ink-600">No skills extracted. Review your profile to add them.</p>}</div></div>
            <details><summary className="cursor-pointer text-sm font-medium text-ink-700">View resume source text</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-ink-50 p-4 text-sm leading-relaxed text-ink-700">{profile.resume_text}</pre></details>
            <div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={() => setProfileMode("edit")}>Review and edit profile</button><button className="btn-ghost" onClick={() => setProfileMode("replace")}>Replace resume</button></div>
            <p className="text-xs text-ink-600">Profile revision {profile.revision} · Updated <time dateTime={profile.updated_at}>{savedTime(profile.updated_at)}</time></p>
          </div>
        ) : null}
      </section>
      <section className="card min-w-0 space-y-5 p-4 sm:p-6" aria-labelledby="documents-heading">
        <h2 id="documents-heading" className="section-title">2. Documents for your role</h2>
        {contextResource.error && <p role="alert" className="text-sm text-rose-700">{errorMessage(contextResource.error)} <button className="underline" onClick={() => void contextResource.mutate()}>Retry roles</button></p>}
        <div className="flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-end"><RoleSelector contexts={contexts} value={jobId} disabled={contextResource.isLoading} onChange={(value) => router.replace(`/resume${value ? `?job=${encodeURIComponent(value)}` : ""}`, { scroll: false })} /><div className="sm:w-40"><label htmlFor="letter-tone" className="label">Letter tone</label><select id="letter-tone" className="input" value={tone} onChange={(event) => setTone(event.target.value)}><option value="warm">Warm</option><option value="direct">Direct</option><option value="formal">Formal</option></select></div></div>
        <div className="flex flex-wrap gap-2"><button className="btn-primary" onClick={tailor} disabled={!hasResume || !selected || documents.isLoading || action.pending[resumeKey]}>{action.pending[resumeKey] ? <><Spinner size="sm" /> Tailoring…</> : documents.data?.tailored_resume ? "Regenerate resume" : "Tailor resume"}</button><button className="btn-secondary" onClick={coverLetter} disabled={!hasResume || !selected || documents.isLoading || action.pending[letterKey]}>{action.pending[letterKey] ? <><Spinner size="sm" /> Writing…</> : documents.data?.cover_letter ? "Regenerate cover letter" : "Write cover letter"}</button></div>
        {!hasResume && <p className="text-sm text-ink-600">Save a resume above to generate documents. Previously saved documents remain readable.</p>}
        <p role="status" className="text-sm text-ink-600">{action.pending[resumeKey] || action.pending[letterKey] ? "Generating for this role. Existing documents remain visible." : documents.isLoading ? "Restoring saved documents…" : ""}</p>
        {(action.errors[resumeKey] || action.errors[letterKey] || documents.error) && <p role="alert" className="text-sm text-rose-700">{action.errors[resumeKey] || action.errors[letterKey] || errorMessage(documents.error)}</p>}
        {documents.data?.tailored_resume && <div className="space-y-3"><GeneratedDocument key={`${jobId}:resume:${documents.data.tailored_resume.generated_at}`} title="Tailored resume" content={documents.data.tailored_resume.tailored_resume_md} fileName={`resume-${jobId}.md`} generatedAt={documents.data.tailored_resume.generated_at} isStale={documents.data.tailored_resume.is_stale} />{documents.data.tailored_resume.ats_keywords.length > 0 && <div><p className="label">Posting keywords to review</p><p className="mb-2 text-xs text-ink-600">Use these only where they match your experience.</p><div className="flex flex-wrap gap-1.5">{documents.data.tailored_resume.ats_keywords.map((keyword) => <span className="pill-accent" key={keyword}>{keyword}</span>)}</div></div>}</div>}
        {documents.data?.cover_letter && <GeneratedDocument key={`${jobId}:letter:${tone}:${documents.data.cover_letter.generated_at}`} title="Cover letter" content={documents.data.cover_letter.cover_letter} fileName={`cover-letter-${jobId}-${tone}.md`} generatedAt={documents.data.cover_letter.generated_at} isStale={documents.data.cover_letter.is_stale} />}
        {selected && documents.data && !documents.data.tailored_resume && !documents.data.cover_letter && <p className="rounded-xl bg-ink-50 p-4 text-sm text-ink-600">No documents saved for this role and tone yet. Generation starts only when you choose an action.</p>}
      </section>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-xl bg-ink-50 p-3"><p className="text-xs font-semibold text-ink-600">{label}</p><p className="mt-1 break-words text-sm font-medium text-ink-900">{value || "Not provided"}</p></div>;
}

export default function ResumePage() {
  return <Suspense fallback={<Spinner label="Loading resume workspace…" />}><ResumePageInner /></Suspense>;
}
