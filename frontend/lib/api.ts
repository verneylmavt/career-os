import { z } from "zod";
import { request } from "./api-client";
import { contextSchema, documentsSchema, dossierSchema, feedbackSchema, letterSchema, profileSchema, resumeSchema, searchSchema, sessionSchema, shortlistSchema, statsSchema, type Profile, type ShortlistEntry } from "./contracts";

export type * from "./contracts";
export { ApiError, errorMessage, isCancelled } from "./api-client";
const json = (value: unknown) => JSON.stringify(value);
const jobPath = (jobId: string) => encodeURIComponent(jobId);

export const api = {
  getProfile: (signal?: AbortSignal) => request("/api/profile", profileSchema, { signal }),
  updateProfile: (patch: Partial<Profile> & { expected_revision?: number }, signal?: AbortSignal) =>
    request("/api/profile", profileSchema, { method: "PATCH", body: json(patch), signal }),
  uploadResume: (form: FormData, signal?: AbortSignal) =>
    request("/api/profile/upload", profileSchema, { method: "POST", body: form, signal }),
  search: (query: string, filters: { location?: string; work_mode?: string; seniority?: string } = {}, signal?: AbortSignal) =>
    request("/api/jobs/search", searchSchema, { method: "POST", body: json({ query, ...filters }), signal }),
  contexts: (signal?: AbortSignal) => request("/api/jobs", z.array(contextSchema), { signal }),
  shortlist: (signal?: AbortSignal) => request("/api/jobs/shortlist", z.array(shortlistSchema), { signal }),
  addToShortlist: (job_id: string, status: ShortlistEntry["status"] = "saved", notes = "", signal?: AbortSignal) =>
    request("/api/jobs/shortlist", shortlistSchema, { method: "POST", body: json({ job_id, status, notes }), signal }),
  updateShortlist: (job_id: string, patch: ShortlistEntry["status"] | { status?: ShortlistEntry["status"]; notes?: string }, notes?: string, signal?: AbortSignal) =>
    request(`/api/jobs/shortlist/${jobPath(job_id)}`, shortlistSchema, { method: "PATCH", body: json(typeof patch === "string" ? { status: patch, ...(notes !== undefined ? { notes } : {}) } : patch), signal }),
  removeFromShortlist: (job_id: string, signal?: AbortSignal) =>
    request(`/api/jobs/shortlist/${jobPath(job_id)}`, z.object({ status: z.string() }), { method: "DELETE", signal }),
  dossier: (job_id: string, signal?: AbortSignal) => request(`/api/jobs/${jobPath(job_id)}/dossier`, dossierSchema.nullable(), { signal }),
  generateDossier: (job_id: string, regenerate = false, signal?: AbortSignal) =>
    request(`/api/jobs/${jobPath(job_id)}/dossier`, dossierSchema, { method: "POST", body: json({ regenerate }), signal }),
  documents: (job_id: string, tone = "warm", signal?: AbortSignal) =>
    request(`/api/resume/${jobPath(job_id)}/documents?tone=${encodeURIComponent(tone)}`, documentsSchema, { signal }),
  tailorResume: (job_id: string, regenerate = false, signal?: AbortSignal) =>
    request("/api/resume/tailor", resumeSchema, { method: "POST", body: json({ job_id, regenerate }), signal }),
  coverLetter: (job_id: string, tone = "warm", regenerate = false, signal?: AbortSignal) =>
    request("/api/resume/cover-letter", letterSchema, { method: "POST", body: json({ job_id, tone, regenerate }), signal }),
  session: (job_id: string, session_id = "", signal?: AbortSignal) =>
    request(`/api/interview/${jobPath(job_id)}/session${session_id ? `?session_id=${encodeURIComponent(session_id)}` : ""}`, sessionSchema, { signal }),
  questions: (job_id: string, regenerate = false, signal?: AbortSignal) =>
    request("/api/interview/questions", sessionSchema, { method: "POST", body: json({ job_id, regenerate }), signal }),
  saveDraft: (job_id: string, session_id: string, question_id: string, answer: string, expected_version?: number, signal?: AbortSignal) =>
    request(`/api/interview/${jobPath(job_id)}/session/answers/${encodeURIComponent(question_id)}`, sessionSchema, { method: "PATCH", body: json({ session_id, answer, expected_version }), signal }),
  evaluateAnswer: (job_id: string, session_id: string, question_id: string, answer: string, regenerate = false, signal?: AbortSignal) =>
    request("/api/interview/evaluate", feedbackSchema, { method: "POST", body: json({ job_id, session_id, question_id, answer, regenerate }), signal }),
  stats: (signal?: AbortSignal) => request("/api/dashboard/stats", statsSchema, { signal }),
};
