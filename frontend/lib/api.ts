async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  work_mode: string;
  employment_type: string;
  seniority: string;
  salary_range: string;
  posted_at: string;
  source: string;
  url: string;
  must_have_skills: string[];
  nice_to_have_skills: string[];
  description: string;
  responsibilities: string[];
  requirements: string[];
};

export type JobMatch = {
  job: Job;
  score: number;
  matched_skills: string[];
  missing_skills: string[];
  reason: string;
};

export type ShortlistEntry = {
  job: Job;
  status: "saved" | "applied" | "interviewing" | "offer" | "rejected";
  notes: string;
  added_at: string;
};

export type Profile = {
  name: string;
  email: string;
  resume_text: string;
  skills: string[];
  experience_years: number;
  preferred_location: string;
};

export type DashboardStats = {
  pipeline: Record<string, number>;
  total_saved: number;
  tailored_resumes: number;
  cover_letters: number;
  interview_readiness: number;
  top_skill_gaps: { skill: string; count: number }[];
  has_profile: boolean;
};

export type InterviewQuestion = {
  id: string;
  category: "behavioral" | "technical" | "role-specific";
  question: string;
  what_we_look_for: string;
};

export type AnswerFeedback = {
  score: number;
  strengths: string[];
  gaps: string[];
  improved_answer_example: string;
};

export type Dossier = {
  job_id: string;
  mission_guess: string;
  talking_points: string[];
  smart_questions_to_ask: string[];
  watch_outs: string[];
};

export const api = {
  // profile
  getProfile: () => request<Profile>("/api/profile"),
  updateProfile: (patch: Partial<Profile>) =>
    request<Profile>("/api/profile", { method: "PATCH", body: JSON.stringify(patch) }),
  uploadResume: async (form: FormData) => {
    const res = await fetch("/api/profile/upload", { method: "POST", body: form });
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()) as Profile;
  },

  // jobs
  search: (query: string) =>
    request<JobMatch[]>("/api/jobs/search", { method: "POST", body: JSON.stringify({ query }) }),
  shortlist: () => request<ShortlistEntry[]>("/api/jobs/shortlist"),
  addToShortlist: (job_id: string, status = "saved", notes = "") =>
    request<ShortlistEntry>("/api/jobs/shortlist", {
      method: "POST",
      body: JSON.stringify({ job_id, status, notes }),
    }),
  updateShortlist: (job_id: string, status: ShortlistEntry["status"], notes?: string) =>
    request<ShortlistEntry>(`/api/jobs/shortlist/${job_id}`, {
      method: "PATCH",
      body: JSON.stringify({ job_id, status, notes }),
    }),
  removeFromShortlist: (job_id: string) =>
    request<{ status: string }>(`/api/jobs/shortlist/${job_id}`, { method: "DELETE" }),
  dossier: (job_id: string) => request<Dossier>(`/api/jobs/${job_id}/dossier`),

  // resume
  tailorResume: (job_id: string) =>
    request<{
      job_id: string;
      tailored_resume_md: string;
      ats_keywords: string[];
      summary_rewrite: string;
    }>("/api/resume/tailor", { method: "POST", body: JSON.stringify({ job_id }) }),
  coverLetter: (job_id: string, tone = "warm") =>
    request<{ job_id: string; cover_letter: string }>("/api/resume/cover-letter", {
      method: "POST",
      body: JSON.stringify({ job_id, tone }),
    }),

  // interview
  questions: (job_id: string) =>
    request<{ job_id: string; questions: InterviewQuestion[] }>("/api/interview/questions", {
      method: "POST",
      body: JSON.stringify({ job_id }),
    }),
  evaluate: (job_id: string, question_id: string, question: string, answer: string) =>
    request<AnswerFeedback>("/api/interview/evaluate", {
      method: "POST",
      body: JSON.stringify({ job_id, question_id, question, answer }),
    }),

  // dashboard
  stats: () => request<DashboardStats>("/api/dashboard/stats"),
};
