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
        "/api/profile": {
          name: "", email: "", resume_text: "", skills: [],
          experience_years: 0, preferred_location: "",
        },
        "/api/dashboard/stats": {
          pipeline: { saved: 0, applied: 0, interviewing: 0, offer: 0, rejected: 0 },
          total_saved: 0, tailored_resumes: 0, cover_letters: 0,
          interview_readiness: 0, top_skill_gaps: [], has_profile: false,
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
    await expect(page.getByText(/^Loading(?: dashboard)?…$/)).toHaveCount(0);
    expect(pageErrors).toEqual([]);

    // Establish the document baseline; flow-level accessibility is checked as UI evolves.
    const accessibility = await new AxeBuilder({ page })
      .withRules(["document-title", "html-has-lang", "landmark-one-main"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
  });
}
