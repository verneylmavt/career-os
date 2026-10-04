import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { GeneratedDocument } from "@/components/GeneratedDocument";
import { ResumeUpload } from "@/components/ResumeUpload";
import { ProfileEditor } from "@/components/ProfileEditor";
import { RoleSelector } from "@/components/RoleSelector";
import { api } from "@/lib/api";
import type { Documents, InterviewSession, JobContext, Profile } from "@/lib/contracts";
import ResumePage from "@/app/resume/page";
import InterviewPage from "@/app/interview/page";

const navigation = vi.hoisted(() => ({ query: "job=job-test", replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(navigation.query), useRouter: () => ({ replace: navigation.replace }) }));

const profile: Profile = { name: "Maya", email: "maya@example.com", resume_text: "Built React interfaces.", skills: ["React"], experience_years: 2, preferred_location: "Bangkok", revision: 3, updated_at: "2026-10-01T10:00:00Z" };
const context: JobContext = { shortlisted: false, has_preparation: true, job: { id: "job-test", title: "Engineer", company: "Example", location: "Bangkok", work_mode: "Remote", employment_type: "Full-time", seniority: "Mid-level", salary_range: "", posted_at: "", source: "Curated", url: "https://example.com", must_have_skills: ["React"], nice_to_have_skills: [], description: "Build tools", responsibilities: [], requirements: [] } };
const secondContext: JobContext = { ...context, job: { ...context.job, id: "job-second", title: "Second Engineer" } };
const documents: Documents = { job_id: "job-test", tailored_resume: { job_id: "job-test", profile_revision: 3, generated_at: "2026-10-01T10:00:00Z", model: "fake", prompt_version: "test", is_stale: false, tailored_resume_md: "# Saved resume\nCandidate facts", ats_keywords: ["React"], summary_rewrite: "Candidate facts" }, cover_letter: null };
const session: InterviewSession = { job_id: "job-test", session_id: "session-current", profile_revision: 3, created_at: "2026-10-01T10:00:00Z", is_current: true, is_stale: false, questions: [{ id: "question-1", category: "behavioral", question: "Tell us about your React work.", what_we_look_for: "A clear example." }], answers: { "question-1": "My saved answer" }, answer_versions: { "question-1": 2 }, scores: { "question-1": 7 }, feedback: { "question-1": { score: 7, strengths: ["Clear example"], gaps: ["Add the outcome"], improved_answer_example: "My React work led to [add a true outcome].", submitted_answer: "My saved answer", rubric: { clarity: 8, specificity: 6, role_alignment: 7, technical_accuracy: null } } }, history: [{ session_id: "session-current", created_at: "2026-10-01T10:00:00Z", evaluated_count: 1, is_current: true, is_stale: false }, { session_id: "session-old", created_at: "2026-09-01T10:00:00Z", evaluated_count: 1, is_current: false, is_stale: true }] };

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
function savedReads(input: RequestInfo | URL) {
  const path = String(input);
  if (path === "/api/profile") return response(profile);
  if (path === "/api/jobs") return response([context, secondContext]);
  if (path.includes("job-second/documents")) return response({ ...documents, job_id: "job-second", tailored_resume: { ...documents.tailored_resume, job_id: "job-second", tailored_resume_md: "# Second role resume" } });
  if (path.includes("/documents")) return response(documents);
  if (path.includes("session_id=session-old")) return response({ ...session, session_id: "session-old", is_current: false, is_stale: true });
  if (path.includes("/session")) return response(session);
  return response({ detail: "Unexpected fixture request", code: "fixture_error", retryable: false }, 404);
}
let resourceCache = new Map();
const cacheProvider = () => resourceCache;
function resumeView() { return <SWRConfig value={{ provider: cacheProvider, dedupingInterval: 0, revalidateOnFocus: false, revalidateOnReconnect: false }}><ResumePage /></SWRConfig>; }
function interviewView() { return <SWRConfig value={{ provider: cacheProvider, dedupingInterval: 0, revalidateOnFocus: false, revalidateOnReconnect: false }}><InterviewPage /></SWRConfig>; }

beforeEach(() => { navigation.query = "job=job-test"; resourceCache = new Map(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("saved preparation controls", () => {
  it("renders Markdown safely and reports clipboard failure without claiming success", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("blocked")) } });
    render(<GeneratedDocument title="Tailored resume" content={'# Maya\n<script>alert("x")</script>\n[unsafe](javascript:alert(1))'} fileName="resume-job-test.md" generatedAt="2026-10-01T10:00:00Z" isStale />);
    expect(screen.getByRole("heading", { name: "Maya" })).toBeVisible();
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText("Outdated profile")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Copy Tailored resume" }));
    expect(await screen.findByText(/Clipboard access was blocked/)).toBeVisible();
    expect(screen.queryByText("Copied")).not.toBeInTheDocument();
  });

  it("downloads the exact saved content with a role-specific filename", async () => {
    const createUrl = vi.fn().mockReturnValue("blob:test");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("resume-job-test.md");
      expect(this.href).toBe("blob:test");
    });
    render(<GeneratedDocument title="Tailored resume" content={"# Saved\nOriginal content"} fileName="resume-job-test.md" generatedAt="2026-10-01T10:00:00Z" />);
    await userEvent.click(screen.getByRole("button", { name: "Download Tailored resume" }));
    expect(click).toHaveBeenCalledOnce();
    const blob = createUrl.mock.calls[0][0] as Blob;
    expect(blob.size).toBe(new TextEncoder().encode("# Saved\nOriginal content").length);
  });

  it("offers retained work after its role was removed from the shortlist", () => {
    render(<RoleSelector contexts={[context]} value="job-test" onChange={vi.fn()} />);
    expect(screen.getByRole("option", { name: /Engineer.*retained work/ })).toBeVisible();
    expect(screen.getByLabelText("Role")).toHaveValue("job-test");
  });

  it("cancels an unsaved resume replacement without calling the upload API", async () => {
    const upload = vi.spyOn(api, "uploadResume");
    const cancel = vi.fn();
    render(<ResumeUpload onSaved={vi.fn()} onCancel={cancel} replacing />);
    await userEvent.type(screen.getByLabelText("Resume text"), "New candidate facts");
    await userEvent.click(screen.getByRole("button", { name: "Cancel replacement" }));
    expect(cancel).toHaveBeenCalledOnce();
    expect(upload).not.toHaveBeenCalled();
  });

  it("rejects an oversized upload before submitting personal data", async () => {
    const upload = vi.spyOn(api, "uploadResume");
    render(<ResumeUpload onSaved={vi.fn()} />);
    const file = new File(["resume"], "resume.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: 5 * 1024 * 1024 + 1 });
    await userEvent.upload(screen.getByLabelText("Resume file"), file);
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a file no larger than 5 MiB.");
    expect(upload).not.toHaveBeenCalled();
  });

  it("saves reviewed facts against the displayed profile revision", async () => {
    const update = vi.spyOn(api, "updateProfile").mockResolvedValue({ ...profile, name: "Maya Chen", revision: 4 });
    const saved = vi.fn();
    render(<ProfileEditor profile={profile} onSaved={saved} onCancel={vi.fn()} />);
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "Maya Chen");
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ name: "Maya Chen", expected_revision: 3 }), expect.any(AbortSignal));
  });
});

describe("saved preparation pages", () => {
  it("restores a saved document without generating and preserves it after failed regeneration", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST" ? response({ detail: "AI is temporarily unavailable.", code: "provider_unavailable", retryable: false }, 503) : savedReads(input));
    vi.stubGlobal("fetch", fetch);
    render(resumeView());
    expect(await screen.findByRole("heading", { name: "Saved resume" })).toBeVisible();
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Regenerate resume" }));
    expect(await screen.findByText("AI is temporarily unavailable.")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Saved resume" })).toBeVisible();
  });

  it("keeps a delayed role A result associated with A after the URL changes to B", async () => {
    let finish: (value: Response) => void = () => { throw new Error("Generation did not start"); };
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST" ? new Promise<Response>((resolve) => { finish = resolve; }) : Promise.resolve(savedReads(input))));
    const view = render(resumeView());
    await screen.findByRole("heading", { name: "Saved resume" });
    await userEvent.click(screen.getByRole("button", { name: "Regenerate resume" }));
    navigation.query = "job=job-second";
    view.rerender(resumeView());
    expect(await screen.findByRole("heading", { name: "Second role resume" })).toBeVisible();
    await act(async () => finish(response({ ...documents.tailored_resume, tailored_resume_md: "# Late first role resume" })));
    expect(screen.getByRole("heading", { name: "Second role resume" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Late first role resume" })).not.toBeInTheDocument();
  });

  it("updates the shared resume after a delayed generation across tone caches while keeping each letter", async () => {
    let finish: (value: Response) => void = () => { throw new Error("Generation did not start"); };
    const directLetter = { job_id: "job-test", profile_revision: 3, generated_at: "2026-10-01T10:00:00Z", model: "fake", prompt_version: "test", is_stale: false, cover_letter: "Direct letter kept" };
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return new Promise<Response>((resolve) => { finish = resolve; });
      if (String(input).endsWith("documents?tone=direct")) return Promise.resolve(response({ ...documents, cover_letter: directLetter }));
      return Promise.resolve(savedReads(input));
    }));
    render(resumeView());
    await screen.findByRole("heading", { name: "Saved resume" });
    await userEvent.click(screen.getByRole("button", { name: "Regenerate resume" }));
    await userEvent.selectOptions(screen.getByLabelText("Letter tone"), "direct");
    await screen.findByText("Direct letter kept");
    expect(screen.getByRole("heading", { name: "Saved resume" })).toBeVisible();
    await act(async () => finish(response({ ...documents.tailored_resume, tailored_resume_md: "# Updated shared resume" })));
    expect(await screen.findByRole("heading", { name: "Updated shared resume" })).toBeVisible();
    expect(screen.getByText("Direct letter kept")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Saved resume" })).not.toBeInTheDocument();
  });

  it("makes an unknown role deep link recoverable without reading unknown documents", async () => {
    navigation.query = "job=unknown";
    const fetch = vi.fn(async (input: RequestInfo | URL) => savedReads(input));
    vi.stubGlobal("fetch", fetch);
    render(resumeView());
    expect(await screen.findByText(/This role link is unavailable/)).toBeVisible();
    expect(screen.getByRole("link", { name: "discover a role" })).toHaveAttribute("href", "/discover");
    expect(screen.getByRole("button", { name: "Tailor resume" })).toBeDisabled();
    expect(fetch.mock.calls.some(([input]) => String(input).includes("unknown/documents"))).toBe(false);
  });

  it("restores answer drafts and full feedback while archived sessions stay read only", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => savedReads(input)));
    const view = render(interviewView());
    const answer = await screen.findByLabelText("Your answer to question 1");
    expect(answer).toHaveValue("My saved answer");
    expect(screen.getByRole("region", { name: "Answer feedback" })).toBeVisible();
    expect(screen.getAllByText("7/10")[0]).toBeVisible();
    navigation.query = "job=job-test&session=session-old";
    view.rerender(interviewView());
    expect(await screen.findByText("Archived session · read only")).toBeVisible();
    expect(screen.getByLabelText("Your answer to question 1")).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Session history")).toHaveValue("session-old");
  });

  it("merges simultaneous question saves without replacing another question's newer draft", async () => {
    const twoQuestions: InterviewSession = { ...session, questions: [...session.questions, { ...session.questions[0], id: "question-2", question: "Describe a second project." }], answers: { ...session.answers, "question-2": "Second saved draft" }, answer_versions: { ...session.answer_versions, "question-2": 0 } };
    let finishFirst: (value: Response) => void = () => { throw new Error("First save did not start"); };
    const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (init?.method === "PATCH" && path.endsWith("/question-1")) return new Promise<Response>((resolve) => { finishFirst = resolve; });
      if (init?.method === "PATCH") return Promise.resolve(response({ ...twoQuestions, answers: { ...twoQuestions.answers, "question-2": "New second draft" }, answer_versions: { ...twoQuestions.answer_versions, "question-2": 1 } }));
      if (path.endsWith("/session")) return Promise.resolve(response(twoQuestions));
      return Promise.resolve(savedReads(input));
    });
    vi.stubGlobal("fetch", fetch);
    render(interviewView());
    const first = await screen.findByLabelText("Your answer to question 1");
    const second = screen.getByLabelText("Your answer to question 2");
    await userEvent.clear(first);
    await userEvent.type(first, "New first draft");
    await userEvent.click(screen.getAllByRole("button", { name: "Save draft" })[0]);
    await userEvent.clear(second);
    await userEvent.type(second, "New second draft");
    await userEvent.click(screen.getAllByRole("button", { name: "Save draft" })[1]);
    await screen.findByText("Draft saved");
    await act(async () => finishFirst(response({ ...twoQuestions, answers: { ...twoQuestions.answers, "question-1": "New first draft" }, answer_versions: { ...twoQuestions.answer_versions, "question-1": 3 }, feedback: {}, scores: {} })));
    expect(screen.queryByText("Unsaved changes. Save your draft before leaving this page.")).not.toBeInTheDocument();
    expect(screen.getAllByText("Draft saved")).toHaveLength(2);
    const body = JSON.parse(fetch.mock.calls.find(([path, init]) => String(path).endsWith("/question-1") && init?.method === "PATCH")?.[1]?.body as string);
    expect(body).toEqual({ session_id: "session-current", answer: "New first draft", expected_version: 2 });
  });

  it("opens retained preparation through cache-only reads after shortlist removal", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => String(input).endsWith("/dossier") && init?.method !== "POST" ? response({ job_id: "job-test", profile_revision: 3, generated_at: "2026-10-01T10:00:00Z", model: "fake", prompt_version: "test", is_stale: false, mission_guess: "Build accessible tools from the posting.", talking_points: ["React experience"], smart_questions_to_ask: ["What would success look like?"], watch_outs: ["Clarify ownership"] }) : savedReads(input));
    vi.stubGlobal("fetch", fetch);
    render(interviewView());
    await screen.findByLabelText("Your answer to question 1");
    await userEvent.click(screen.getByRole("button", { name: "Preparation brief" }));
    expect(await screen.findByText("Build accessible tools from the posting.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Refresh brief" })).toBeVisible();
    expect(fetch.mock.calls.some(([input]) => String(input) === "/api/jobs/job-test/dossier")).toBe(true);
    expect(fetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("reveals the newly created current session after successful generation from an archive", async () => {
    navigation.query = "job=job-test&session=session-old";
    window.history.replaceState(null, "", `/interview?${navigation.query}`);
    const replacement = { ...session, session_id: "session-new", questions: [{ ...session.questions[0], question: "Question in the new current session." }], answers: {}, feedback: {}, scores: {} };
    let created = false;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") { created = true; return response(replacement); }
      if (created && String(input) === "/api/interview/job-test/session") return response(replacement);
      return savedReads(input);
    }));
    const view = render(interviewView());
    await screen.findByText("Archived session · read only");
    await userEvent.click(screen.getByRole("button", { name: "Create new session" }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/interview?job=job-test", { scroll: false }));
    navigation.query = "job=job-test";
    view.rerender(interviewView());
    expect(await screen.findByRole("heading", { name: "Question in the new current session." })).toBeVisible();
    expect(screen.getByLabelText("Your answer to question 1")).not.toHaveAttribute("readonly");
  });

  it("does not navigate back to role A when its delayed generation completes on role B", async () => {
    navigation.query = "job=job-test&session=session-old";
    window.history.replaceState(null, "", `/interview?${navigation.query}`);
    let finish: (value: Response) => void = () => { throw new Error("Generation did not start"); };
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST" ? new Promise<Response>((resolve) => { finish = resolve; }) : Promise.resolve(savedReads(input))));
    const view = render(interviewView());
    await screen.findByText("Archived session · read only");
    await userEvent.click(screen.getByRole("button", { name: "Create new session" }));
    navigation.query = "job=job-second";
    window.history.replaceState(null, "", `/interview?${navigation.query}`);
    view.rerender(interviewView());
    await screen.findByLabelText("Your answer to question 1");
    await act(async () => finish(response({ ...session, session_id: "session-new" })));
    expect(navigation.replace).not.toHaveBeenCalledWith("/interview?job=job-test", { scroll: false });
    expect(screen.getByLabelText("Role")).toHaveValue("job-second");
  });

  it("allows draft editing but gates feedback for a session from an outdated profile", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input).endsWith("/session") ? response({ ...session, is_stale: true }) : savedReads(input)));
    render(interviewView());
    const answer = await screen.findByLabelText("Your answer to question 1");
    expect(answer).toBeEnabled();
    expect(screen.getByRole("button", { name: "Evaluate again" })).toBeDisabled();
    await userEvent.type(answer, " More detail");
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Get feedback" })).toBeDisabled();
    expect(screen.getByText("Generate new questions to evaluate answers against your current profile.")).toBeVisible();
  });
});
