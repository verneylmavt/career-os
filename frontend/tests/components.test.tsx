import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { JobCard } from "@/components/JobCard";
import { NavBar } from "@/components/NavBar";
import { Spinner } from "@/components/Spinner";
import type { Job, JobMatch } from "@/lib/api";

const navigation = vi.hoisted(() => ({ pathname: "/discover" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

const job: Job = {
  id: "job-test",
  title: "Frontend Engineer",
  company: "Example Co",
  location: "Bangkok",
  work_mode: "Remote",
  employment_type: "Full-time",
  seniority: "Mid-level",
  salary_range: "$60k–80k",
  posted_at: "2026-10-01",
  source: "Test fixture",
  url: "https://example.com/job",
  must_have_skills: ["React", "TypeScript"],
  nice_to_have_skills: ["Python"],
  description: "Build accessible career tools.",
  responsibilities: [],
  requirements: [],
};

describe("shared components", () => {
  it("shows a loading label when supplied", () => {
    render(<Spinner label="Loading jobs…" />);
    expect(screen.getByText("Loading jobs…")).toBeVisible();
  });

  it("renders fit context and invokes the shortlist action", async () => {
    const onShortlist = vi.fn();
    const match: JobMatch = {
      job,
      score: 82,
      matched_skills: ["React"],
      missing_skills: ["Python"],
      reason: "Strong React experience",
    };
    render(<JobCard match={match} onShortlist={onShortlist} />);

    expect(screen.getByRole("heading", { name: job.title })).toBeVisible();
    expect(screen.getByText("Strong React experience")).toBeVisible();
    expect(screen.getByText("Python")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "+ Shortlist" }));
    expect(onShortlist).toHaveBeenCalledOnce();
  });

  it("prevents saving an already shortlisted job", async () => {
    const onShortlist = vi.fn();
    render(<JobCard job={job} shortlisted onShortlist={onShortlist} />);
    const button = screen.getByRole("button", { name: "Saved" });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onShortlist).not.toHaveBeenCalled();
  });

  it("omits a card when no job is provided", () => {
    const { container } = render(<JobCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it("links every primary route and highlights the current route", () => {
    render(<NavBar />);
    for (const [label, href] of [
      ["Dashboard", "/"],
      ["Discover", "/discover"],
      ["Shortlist", "/shortlist"],
      ["Resume", "/resume"],
      ["Interview", "/interview"],
    ]) {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
    }
    expect(screen.getByRole("link", { name: "Discover" })).toHaveClass("bg-ink-900");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveClass("bg-ink-900");
  });
});
