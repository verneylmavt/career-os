import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = [
  { path: "/", heading: "Your career, in one view" },
  { path: "/discover", heading: "Discover your next role" },
  { path: "/shortlist", heading: "Shortlist" },
  { path: "/resume", heading: "Resume optimizer" },
  { path: "/interview", heading: "Mock interview" },
];

for (const { path, heading } of routes) {
  test(`${path} loads with offline API fixtures`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const fixtures: Record<string, unknown> = {
        "/api/jobs/shortlist": [],
        "/api/jobs": [],
        "/api/profile": {
          name: "", email: "", resume_text: "", skills: [],
          experience_years: 0, preferred_location: "", revision: 0, updated_at: "2026-01-01T00:00:00Z",
        },
        "/api/dashboard/stats": {
          pipeline: { saved: 0, applied: 0, interviewing: 0, offer: 0, rejected: 0 },
          total_saved: 0, tailored_resumes: 0, cover_letters: 0,
          interview_readiness: 0, practice_score: null, evaluated_answer_count: 0, top_skill_gaps: [], has_profile: false,
        },
      };
      if (route.request().method() !== "GET" || !(pathname in fixtures)) {
        throw new Error(`Unexpected API request: ${route.request().method()} ${pathname}`);
      }
      await route.fulfill({ json: fixtures[pathname] });
    });

    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(page.getByRole("navigation")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /^(Loading|Restoring)/ })).toHaveCount(0);
    await expect(page.getByRole("alert").filter({ hasText: /unexpected response/i })).toHaveCount(0);
    expect(pageErrors).toEqual([]);

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations.filter((item) => ["serious", "critical"].includes(item.impact || ""))).toEqual([]);
  });
}
