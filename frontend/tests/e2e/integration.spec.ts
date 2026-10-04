import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { documentsSchema, profileSchema, searchSchema, sessionSchema } from "../../lib/contracts";

const backend = "http://127.0.0.1:8124";
const supervisor = "http://127.0.0.1:8125";
const jobId = "job-001";
const resumeText = "Ada Example\nada@example.test\nPython, SQL, React\nBuilt a Python reporting tool.";
const answerText = "I clarified the reporting requirements with the user and built a Python reporting tool.";
const routes = ["/", "/discover", "/shortlist", `/resume?job=${jobId}`, `/interview?job=${jobId}`];

async function upload(request: APIRequestContext) {
  const response = await request.post("/api/profile/upload", {
    multipart: { file: { name: "synthetic-resume.md", mimeType: "text/markdown", buffer: Buffer.from(resumeText) } },
  });
  expect(response.status(), await response.text()).toBe(200);
  return profileSchema.parse(await response.json());
}

async function seedWorkspace(request: APIRequestContext) {
  const profile = profileSchema.parse(await (await request.get("/api/profile")).json());
  if (profile.resume_text !== resumeText) await upload(request);
  const added = await request.post("/api/jobs/shortlist", { data: { job_id: jobId } });
  expect(added.ok()).toBeTruthy();
}

async function seedPreparation(request: APIRequestContext) {
  await seedWorkspace(request);
  for (const path of ["/api/resume/tailor", "/api/resume/cover-letter", "/api/interview/questions"]) {
    const response = await request.post(path, { data: { job_id: jobId } });
    expect(response.status(), await response.text()).toBe(200);
  }
  const session = sessionSchema.parse(await (await request.get(`/api/interview/${jobId}/session`)).json());
  const evaluation = await request.post("/api/interview/evaluate", {
    data: { job_id: jobId, session_id: session.session_id, question_id: "q1", answer: answerText },
  });
  expect(evaluation.status(), await evaluation.text()).toBe(200);
}

async function setFailure(request: APIRequestContext, operation: string, mode: string) {
  const response = await request.post(`${backend}/__test/fail`, { data: { operation, mode } });
  expect(response.ok()).toBeTruthy();
}

async function providerCalls(request: APIRequestContext): Promise<Record<string, number>> {
  return (await request.get(`${backend}/__test/calls`)).json();
}

async function checkPage(page: Page) {
  await expect(page.locator("main h1")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /^(Loading|Restoring)/ })).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: /unexpected response|could not|failed|unavailable/i })).toHaveCount(0);
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(dimensions.pageWidth, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.width + 1);
  expect(dimensions.bodyWidth, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.width + 1);
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((item) => ["serious", "critical"].includes(item.impact || ""))
    .map((item) => ({ id: item.id, description: item.description, elements: item.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })) }))).toEqual([]);
}

test("real proxy, multipart, saved artifacts, canonical evaluations and process restart", async ({ request }) => {
  const profile = await upload(request);
  expect(profile.name).toBe("Ada Example");
  expect(profile.skills).toEqual(["Python", "SQL", "React"]);
  expect(profile.resume_text).toBe(resumeText);
  const first = await request.post("/api/jobs/shortlist", { data: { job_id: jobId, status: "applied", notes: "Initial note" } });
  const original = await first.json();
  const duplicate = await request.post("/api/jobs/shortlist", { data: { job_id: jobId } });
  expect(await duplicate.json()).toEqual(original);
  const notes = await request.patch(`/api/jobs/shortlist/${jobId}`, { data: { notes: "Discuss team priorities" } });
  expect(await notes.json()).toMatchObject({ status: "applied", notes: "Discuss team priorities" });

  const initialCalls = await providerCalls(request);
  expect(await (await request.get(`/api/jobs/${jobId}/dossier`)).json()).toBeNull();
  expect(await providerCalls(request)).toEqual(initialCalls);
  const brief = await request.post(`/api/jobs/${jobId}/dossier`, { data: {} });
  expect(brief.status(), await brief.text()).toBe(200);
  expect(await (await request.get(`/api/jobs/${jobId}/dossier`)).json()).toMatchObject({
    mission_guess: "The posting emphasizes reliable delivery and useful team outcomes.",
  });
  const tailored = await request.post("/api/resume/tailor", { data: { job_id: jobId } });
  expect(tailored.status(), await tailored.text()).toBe(200);
  const savedResume = await tailored.json();
  const callsAfterTailoring = await providerCalls(request);
  const cached = await request.post("/api/resume/tailor", { data: { job_id: jobId } });
  expect(await cached.json()).toEqual(savedResume);
  expect(await providerCalls(request)).toEqual(callsAfterTailoring);
  const letter = await request.post("/api/resume/cover-letter", { data: { job_id: jobId, tone: "warm" } });
  expect(letter.status(), await letter.text()).toBe(200);
  const documents = documentsSchema.parse(await (await request.get(`/api/resume/${jobId}/documents`)).json());
  expect(documents.tailored_resume?.tailored_resume_md).toContain("Built a Python reporting tool.");
  expect(documents.cover_letter?.cover_letter).toContain("Dear hiring team");

  const generated = await request.post("/api/interview/questions", { data: { job_id: jobId } });
  expect(generated.status(), await generated.text()).toBe(200);
  const session = sessionSchema.parse(await generated.json());
  expect(session.questions).toHaveLength(6);
  const draft = await request.patch(`/api/interview/${jobId}/session/answers/q1`, {
    data: { session_id: session.session_id, answer: answerText, expected_version: 0 },
  });
  expect(draft.status(), await draft.text()).toBe(200);
  const evaluation = await request.post("/api/interview/evaluate", {
    data: { job_id: jobId, session_id: session.session_id, question_id: "q1", answer: answerText },
  });
  expect(evaluation.status(), await evaluation.text()).toBe(200);
  expect(await evaluation.json()).toMatchObject({ score: 7, submitted_answer: answerText });
  const unknown = await request.post("/api/interview/evaluate", {
    data: { job_id: jobId, session_id: session.session_id, question_id: "invented", answer: answerText },
  });
  expect(unknown.status()).toBe(404);

  const restart = await request.post(`${supervisor}/restart`);
  expect(restart.status(), await restart.text()).toBe(200);
  const processIds = await restart.json();
  expect(processIds.pid).not.toBe(processIds.previousPid);
  expect(profileSchema.parse(await (await request.get("/api/profile")).json())).toEqual(profile);
  expect(documentsSchema.parse(await (await request.get(`/api/resume/${jobId}/documents`)).json())).toEqual(documents);
  const restored = sessionSchema.parse(await (await request.get(`/api/interview/${jobId}/session`)).json());
  expect(restored.answers.q1).toBe(answerText);
  expect(restored.feedback.q1.score).toBe(7);
  expect((await (await request.get("/api/jobs/shortlist")).json())[0].notes).toBe("Discuss team priorities");
  const searchResponse = await request.post("/api/jobs/search", { data: { query: "Python engineer" } });
  expect(searchResponse.status(), await searchResponse.text()).toBe(200);
  const search = searchSchema.parse(await searchResponse.json());
  expect(search.source).toBe("curated");
  expect(search.personalized).toBeTruthy();
  expect(search.results.length).toBeGreaterThan(0);
  const filtered = await request.post("/api/jobs/search", { data: { query: "Python engineer", location: "Atlantis" } });
  expect(searchSchema.parse(await filtered.json()).results).toEqual([]);
  await setFailure(request, "search", "unavailable");
  const fallback = await request.post("/api/jobs/search", { data: { query: "Python engineer" } });
  expect(fallback.status(), await fallback.text()).toBe(200);
  const local = searchSchema.parse(await fallback.json());
  expect(local.warnings.length).toBeGreaterThan(0);
  expect(local.results.length).toBeGreaterThan(0);
});

test("proxy forwards retry headers and failed replacement/regeneration preserves saved work", async ({ request }) => {
  await seedPreparation(request);
  const before = profileSchema.parse(await (await request.get("/api/profile")).json());
  await setFailure(request, "extraction", "malformed");
  const invalidUpload = await request.post("/api/profile/upload", { multipart: { pasted_text: "Invalid replacement" } });
  expect(invalidUpload.status()).toBe(502);
  expect(await invalidUpload.json()).toMatchObject({ code: "generation_invalid", retryable: false });
  expect(profileSchema.parse(await (await request.get("/api/profile")).json())).toEqual(before);
  const saved = documentsSchema.parse(await (await request.get(`/api/resume/${jobId}/documents`)).json());
  await setFailure(request, "tailor", "quota");
  const quota = await request.post("/api/resume/tailor", { data: { job_id: jobId, regenerate: true } });
  expect(quota.status()).toBe(429);
  expect(quota.headers()["retry-after"]).toBe("7");
  expect(await quota.json()).toMatchObject({ code: "quota_exceeded", retryable: true });
  expect(documentsSchema.parse(await (await request.get(`/api/resume/${jobId}/documents`)).json())).toEqual(saved);
  const current = sessionSchema.parse(await (await request.get(`/api/interview/${jobId}/session`)).json());
  await setFailure(request, "questions", "unavailable");
  const failed = await request.post("/api/interview/questions", { data: { job_id: jobId, regenerate: true } });
  expect(failed.status()).toBe(503);
  expect(sessionSchema.parse(await (await request.get(`/api/interview/${jobId}/session`)).json())).toEqual(current);
  const next = await request.post("/api/interview/questions", { data: { job_id: jobId, regenerate: true } });
  const replacement = sessionSchema.parse(await next.json());
  expect(replacement.session_id).not.toBe(current.session_id);
  const historical = sessionSchema.parse(await (await request.get(`/api/interview/${jobId}/session?session_id=${current.session_id}`)).json());
  expect(historical.is_current).toBeFalsy();
  expect(historical.answers.q1).toBe(answerText);
});

test("saved documents download exactly and removed roles keep accessible preparation", async ({ page, request }) => {
  await seedPreparation(request);
  const oldSession = sessionSchema.parse(await (await request.get(`/api/interview/${jobId}/session`)).json());
  if (!oldSession.history.some((item) => !item.is_current)) {
    const response = await request.post("/api/interview/questions", { data: { job_id: jobId, regenerate: true } });
    expect(response.status(), await response.text()).toBe(200);
  }
  await page.goto(`/resume?job=${jobId}`);
  await expect(page.getByRole("heading", { name: "Tailored resume", exact: true })).toBeVisible();
  expect(await page.evaluate(() => "syntheticUnsafe" in window)).toBeFalsy();
  expect(await page.locator("main script").count()).toBe(0);
  const documents = documentsSchema.parse(await (await request.get(`/api/resume/${jobId}/documents`)).json());
  const [download] = await Promise.all([
    page.waitForEvent("download"), page.getByRole("button", { name: "Download Tailored resume", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toContain(jobId);
  const path = await download.path();
  expect(path).not.toBeNull();
  expect(await readFile(path!, "utf8")).toBe(documents.tailored_resume!.tailored_resume_md);
  const [letterDownload] = await Promise.all([
    page.waitForEvent("download"), page.getByRole("button", { name: "Download Cover letter", exact: true }).click(),
  ]);
  expect(letterDownload.suggestedFilename()).toBe(`cover-letter-${jobId}-warm.md`);
  expect(await readFile((await letterDownload.path())!, "utf8")).toBe(documents.cover_letter!.cover_letter);
  await setFailure(request, "tailor", "quota");
  await page.getByRole("button", { name: "Regenerate resume", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /Synthetic quota reached/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tailored resume", exact: true })).toBeVisible();
  await request.delete(`/api/jobs/shortlist/${jobId}`);
  await page.reload();
  await expect(page.getByRole("option", { name: /retained work/ })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Tailored resume", exact: true })).toBeVisible();
  await page.goto(`/interview?job=${jobId}`);
  await expect(page.getByRole("heading", { name: "Mock interview", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: /retained work/ })).toHaveCount(1);
  const selected = page.getByLabel("Session history");
  await expect(selected).toBeVisible();
  const current = sessionSchema.parse(await (await request.get(`/api/interview/${jobId}/session`)).json());
  const prior = current.history.find((item) => !item.is_current);
  expect(prior).toBeDefined();
  await selected.selectOption(prior!.session_id);
  await expect(page.getByLabel("Your answer to question 1")).toHaveValue(answerText);
  await expect(page.getByLabel("Your answer to question 1")).toHaveAttribute("readonly", "");
  await expect(page.getByRole("region", { name: "Answer feedback" })).toBeVisible();
  await seedWorkspace(request);
});

test("profile review/replacement and interview drafts survive browser navigation", async ({ page, request }) => {
  await seedPreparation(request);
  await page.goto(`/resume?job=${jobId}`);
  await page.getByRole("button", { name: "Replace resume", exact: true }).click();
  await page.getByLabel("Resume text").fill("Unsaved synthetic replacement");
  await page.getByRole("button", { name: "Cancel replacement", exact: true }).click();
  expect(profileSchema.parse(await (await request.get("/api/profile")).json()).resume_text).toBe(resumeText);
  await page.getByRole("button", { name: "Review and edit profile", exact: true }).click();
  await page.getByLabel("Preferred location", { exact: true }).fill("Bangkok");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByRole("button", { name: "Review and edit profile", exact: true })).toBeVisible();
  await expect(page.getByText("Outdated profile", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Replace resume", exact: true }).click();
  await page.getByLabel("Resume file").setInputFiles({ name: "synthetic-resume.md", mimeType: "text/markdown", buffer: Buffer.from(resumeText) });
  await page.getByRole("button", { name: "Save replacement", exact: true }).click();
  await expect(page.getByRole("button", { name: "Review and edit profile", exact: true })).toBeVisible();
  expect(profileSchema.parse(await (await request.get("/api/profile")).json()).preferred_location).toBe("Bangkok");

  await page.goto(`/interview?job=${jobId}`);
  await page.getByRole("button", { name: "Regenerate questions", exact: true }).click();
  await expect(page.getByLabel("Your answer to question 1")).toHaveValue("");
  await page.getByLabel("Your answer to question 1").fill(answerText);
  await page.getByRole("button", { name: "Save draft", exact: true }).first().click();
  await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await page.goto(`/interview?job=${jobId}`);
  await expect(page.getByLabel("Your answer to question 1")).toHaveValue(answerText);
  await page.getByRole("button", { name: "Get feedback", exact: true }).first().click();
  await expect(page.getByRole("region", { name: "Answer feedback" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Answer feedback" })).toBeVisible();
  await expect(page.getByLabel("Your answer to question 1")).toHaveValue(answerText);
});

test("invalid role and session deep links provide a recovery path", async ({ page, request }) => {
  await seedPreparation(request);
  for (const route of ["/resume?job=missing-role", "/interview?job=missing-role"]) {
    await page.goto(route);
    await expect(page.getByRole("alert").filter({ hasText: "This role link is unavailable" })).toBeVisible();
    await expect(page.getByRole("link", { name: "discover a role", exact: true })).toBeVisible();
    await page.getByLabel("Role", { exact: true }).selectOption(jobId);
    await expect(page.getByRole("alert").filter({ hasText: "This role link is unavailable" })).toHaveCount(0);
  }
  await page.goto(`/interview?job=${jobId}&session=missing-session`);
  await page.getByRole("button", { name: "Return to current session", exact: true }).click();
  await expect(page.getByLabel("Your answer to question 1")).toBeVisible();
  await expect(page).not.toHaveURL(/missing-session/);
});

test("shortlist notes, stage and preparation brief use explicit saved actions", async ({ page, request }) => {
  await seedWorkspace(request);
  await page.goto("/shortlist");
  await expect(page.getByRole("heading", { name: "Shortlist", exact: true })).toBeVisible();
  await page.getByLabel("Notes", { exact: true }).first().fill("Ask about the team roadmap");
  await page.getByRole("button", { name: "Save notes", exact: true }).first().click();
  await expect.poll(async () => (await (await request.get("/api/jobs/shortlist")).json())[0].notes).toBe("Ask about the team roadmap");
  await page.getByLabel("Stage", { exact: true }).first().selectOption("interviewing");
  await expect.poll(async () => (await (await request.get("/api/jobs/shortlist")).json())[0].status).toBe("interviewing");
  const before = await providerCalls(request);
  await page.getByRole("button", { name: "Preparation brief", exact: true }).first().click();
  const generate = page.getByRole("button", { name: /^(Generate|Refresh) brief$/ }).first();
  await expect(generate).toBeVisible();
  expect(await providerCalls(request)).toEqual(before);
  await generate.click();
  await expect(page.getByText("The posting emphasizes reliable delivery and useful team outcomes.")).toBeVisible();
  await expect(page.getByText(/derived from.*posting/i).first()).toBeVisible();
  expect((await providerCalls(request)).dossier).toBe((before.dossier ?? 0) + 1);
  await page.reload();
  await expect(page.getByLabel("Notes", { exact: true }).first()).toHaveValue("Ask about the team roadmap");
  await expect(page.getByLabel("Stage", { exact: true }).first()).toHaveValue("interviewing");
});

for (const width of [320, 390, 768, 1280]) {
  test(`all five workflows at ${width}px have no page overflow or serious accessibility violations`, async ({ page, request }, testInfo) => {
    await seedPreparation(request);
    await page.setViewportSize({ width, height: 900 });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    for (const route of routes) {
      await page.goto(route);
      if (route === "/discover") {
        await page.getByLabel("What are you looking for?").fill("Python engineer");
        await page.getByRole("button", { name: "Find matches", exact: true }).click();
        await expect(page.getByRole("status").filter({ hasText: /\d+ roles? for .*Python engineer/ })).toBeVisible();
      }
      await checkPage(page);
      if (width === 320 || width === 1280) {
        const name = route.split("?")[0].replaceAll("/", "") || "dashboard";
        await page.screenshot({ path: testInfo.outputPath(`${name}-${width}.png`), fullPage: true });
      }
    }
    expect(pageErrors).toEqual([]);
  });
}

test("keyboard navigation, 200% zoom and reduced motion remain usable", async ({ page, request }) => {
  await seedPreparation(request);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveText(/Skip to content/i);
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  for (const route of routes) {
    await page.goto(route);
    await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
    await checkPage(page);
    const motion = await page.locator("main").evaluate((element) => {
      const animated = [element, ...element.querySelectorAll("*")].filter((item) => getComputedStyle(item).animationName !== "none");
      return animated.map((item) => getComputedStyle(item).animationDuration);
    });
    expect(motion.every((duration) => duration.split(",").every((value) => parseFloat(value) <= 0.01))).toBeTruthy();
  }
  await page.goto("/discover");
  await page.getByLabel("What are you looking for?").fill("Python engineer");
  await page.keyboard.press("Control+Enter");
  await expect(page.getByRole("status").filter({ hasText: /\d+ roles? for .*Python engineer/ })).toBeVisible();
  await checkPage(page);
});
