"use client";
import { useId, useState } from "react";
import { api } from "@/lib/api";
import type { Profile } from "@/lib/contracts";
import { useResourceAction } from "@/lib/resources";
import { Spinner } from "./Spinner";

export function ProfileEditor({ profile, onSaved, onCancel }: { profile: Profile; onSaved: (profile: Profile) => void; onCancel: () => void }) {
  const id = useId();
  const [values, setValues] = useState({ name: profile.name, email: profile.email, skills: profile.skills.join(", "), experience_years: profile.experience_years, preferred_location: profile.preferred_location, resume_text: profile.resume_text });
  const action = useResourceAction();
  const key = `profile-edit:${profile.revision}`;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const result = await action.run(key, (signal) => api.updateProfile({ ...values, skills: values.skills.split(",").map((skill) => skill.trim()).filter(Boolean), expected_revision: profile.revision }, signal));
    if (result) onSaved(result);
  }
  return (
    <form className="space-y-4" onSubmit={save}>
      <p className="text-sm text-ink-600">Review extracted facts before generating documents. Saving changes keeps existing work and labels it outdated.</p>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        {([ ["name", "Name"], ["email", "Email"], ["preferred_location", "Preferred location"] ] as const).map(([field, label]) => <div key={field}><label htmlFor={`${id}-${field}`} className="label">{label}</label><input id={`${id}-${field}`} className="input" type={field === "email" ? "email" : "text"} value={values[field]} maxLength={field === "name" ? 200 : 320} onChange={(event) => setValues((previous) => ({ ...previous, [field]: event.target.value }))} disabled={action.pending[key]} /></div>)}
        <div><label htmlFor={`${id}-years`} className="label">Years of experience</label><input id={`${id}-years`} className="input" type="number" min="0" max="80" step="1" required value={values.experience_years} onChange={(event) => setValues((previous) => ({ ...previous, experience_years: event.target.valueAsNumber }))} disabled={action.pending[key]} /></div>
        <div className="sm:col-span-2"><label htmlFor={`${id}-skills`} className="label">Skills (comma separated)</label><input id={`${id}-skills`} className="input" value={values.skills} onChange={(event) => setValues((previous) => ({ ...previous, skills: event.target.value }))} disabled={action.pending[key]} /></div>
        <div className="sm:col-span-2"><label htmlFor={`${id}-resume`} className="label">Resume source text</label><textarea id={`${id}-resume`} className="textarea min-h-56" value={values.resume_text} maxLength={40_000} onChange={(event) => setValues((previous) => ({ ...previous, resume_text: event.target.value }))} disabled={action.pending[key]} /></div>
      </div>
      {action.errors[key] && <p role="alert" className="text-sm text-rose-700">{action.errors[key]}</p>}
      <div className="flex flex-wrap gap-2"><button type="submit" className="btn-primary" disabled={action.pending[key]}>{action.pending[key] ? <><Spinner size="sm" /> Saving…</> : "Save profile"}</button><button type="button" className="btn-secondary" onClick={onCancel} disabled={action.pending[key]}>Cancel editing</button></div>
    </form>
  );
}
