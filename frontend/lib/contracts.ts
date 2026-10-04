import { z } from "zod";

const text = z.string();
const texts = z.array(text);
export const stageSchema = z.enum(["saved", "applied", "interviewing", "offer", "rejected"]);
export const jobSchema = z.object({
  id: text, title: text, company: text, location: text, work_mode: text,
  employment_type: text, seniority: text, salary_range: text, posted_at: text,
  source: text, url: text, must_have_skills: texts, nice_to_have_skills: texts,
  description: text, responsibilities: texts, requirements: texts,
});
export const profileSchema = z.object({
  name: text, email: text, resume_text: text, skills: texts,
  experience_years: z.number().int().min(0).max(80), preferred_location: text,
  revision: z.number().int().nonnegative(), updated_at: text,
});
export const shortlistSchema = z.object({ job: jobSchema, status: stageSchema, notes: text, added_at: text });
export const contextSchema = z.object({ job: jobSchema, shortlisted: z.boolean(), has_preparation: z.boolean() });
export const matchSchema = z.object({
  job: jobSchema, score: z.number().min(0).max(100).nullable(), matched_skills: texts,
  missing_skills: texts, reason: text, relevance: z.number().optional(),
});
export const filtersSchema = z.object({
  role_keywords: texts, location: text, work_mode: text, seniority: text, skills: texts, industries: texts,
});
export const searchSchema = z.object({
  results: z.array(matchSchema), filters: filtersSchema, warnings: texts,
  source: z.literal("curated"), personalized: z.boolean(),
});
const provenance = {
  job_id: text, profile_revision: z.number().int().nonnegative(), generated_at: text,
  model: text, prompt_version: text, is_stale: z.boolean(),
};
export const resumeSchema = z.object({ ...provenance, tailored_resume_md: text, ats_keywords: texts, summary_rewrite: text });
export const letterSchema = z.object({ ...provenance, cover_letter: text });
export const documentsSchema = z.object({ job_id: text, tailored_resume: resumeSchema.nullable(), cover_letter: letterSchema.nullable() });
export const dossierSchema = z.object({ ...provenance, mission_guess: text, talking_points: texts, smart_questions_to_ask: texts, watch_outs: texts });
export const questionSchema = z.object({
  id: text, category: z.enum(["behavioral", "technical", "role-specific"]), question: text, what_we_look_for: text,
});
const score = z.number().min(1).max(10);
export const feedbackSchema = z.object({
  score, strengths: texts, gaps: texts, improved_answer_example: text, submitted_answer: text,
  rubric: z.object({ clarity: score, specificity: score, role_alignment: score, technical_accuracy: score.nullable() }),
});
export const sessionSchema = z.object({
  job_id: text, session_id: text.nullable(), profile_revision: z.number().int().nullable(), created_at: text.nullable(),
  is_stale: z.boolean(), is_current: z.boolean(), questions: z.array(questionSchema),
  answers: z.record(text, text), answer_versions: z.record(text, z.number().int().nonnegative()),
  scores: z.record(text, score), feedback: z.record(text, feedbackSchema),
  history: z.array(z.object({ session_id: text, created_at: text, evaluated_count: z.number().int().nonnegative(), is_current: z.boolean(), is_stale: z.boolean() })),
});
export const statsSchema = z.object({
  pipeline: z.record(stageSchema, z.number().int().nonnegative()), total_saved: z.number().int().nonnegative(),
  tailored_resumes: z.number().int().nonnegative(), cover_letters: z.number().int().nonnegative(),
  interview_readiness: z.number(), practice_score: z.number().min(0).max(100).nullable(), evaluated_answer_count: z.number().int().nonnegative(),
  top_skill_gaps: z.array(z.object({ skill: text, count: z.number().int().nonnegative() })), has_profile: z.boolean(),
});
export type Job = z.infer<typeof jobSchema>;
export type JobMatch = z.infer<typeof matchSchema>;
export type SearchResult = z.infer<typeof searchSchema>;
export type SearchFilters = z.infer<typeof filtersSchema>;
export type ShortlistEntry = z.infer<typeof shortlistSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type JobContext = z.infer<typeof contextSchema>;
export type DashboardStats = z.infer<typeof statsSchema>;
export type InterviewQuestion = z.infer<typeof questionSchema>;
export type AnswerFeedback = z.infer<typeof feedbackSchema>;
export type InterviewSession = z.infer<typeof sessionSchema>;
export type Dossier = z.infer<typeof dossierSchema>;
export type TailoredResume = z.infer<typeof resumeSchema>;
export type CoverLetter = z.infer<typeof letterSchema>;
export type Documents = z.infer<typeof documentsSchema>;
