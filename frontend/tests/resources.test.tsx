import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useResourceAction } from "@/lib/resources";

afterEach(() => vi.restoreAllMocks());

it("keeps a late failure associated with its original resource", async () => {
  const { result } = renderHook(() => useResourceAction());
  let rejectA: (error: Error) => void = () => {};
  let resolveB: (value: string) => void = () => {};
  let a: Promise<unknown>;
  let b: Promise<unknown>;
  act(() => {
    a = result.current.run("role-a", () => new Promise((_, reject) => { rejectA = reject; }));
    b = result.current.run("role-b", () => new Promise((resolve) => { resolveB = resolve; }));
  });
  await act(async () => { rejectA(new Error("A failed")); await a; });
  expect(result.current.errors["role-a"]).toBe("A failed");
  expect(result.current.errors["role-b"]).toBe("");
  expect(result.current.pending["role-b"]).toBe(true);
  await act(async () => { resolveB("B succeeded"); expect(await b).toBe("B succeeded"); });
});

it("cancels an operation without publishing an error", async () => {
  const { result } = renderHook(() => useResourceAction());
  let task: Promise<unknown>;
  act(() => { task = result.current.run("role-a", (signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError"))))); });
  await act(async () => { result.current.cancel("role-a"); await task; });
  expect(result.current.errors["role-a"]).toBe("");
  expect(result.current.pending["role-a"]).toBe(false);
});

it("does not hide another saved resource when one dashboard request fails", async () => {
  const resourceMocks = await import("@/lib/resources");
  const job = { id: "job-001", title: "Saved role", company: "Example", location: "Singapore", work_mode: "Hybrid", employment_type: "Full-time", seniority: "Mid", salary_range: "Sample", posted_at: "2026-05-10", source: "Curated", url: "https://example.com", must_have_skills: [], nice_to_have_skills: [], description: "Example", responsibilities: [], requirements: [] };
  vi.spyOn(resourceMocks, "useStats").mockReturnValue({ data: undefined, error: new Error("Stats unavailable"), isLoading: false, isValidating: false, mutate: vi.fn() });
  vi.spyOn(resourceMocks, "useShortlist").mockReturnValue({ data: [{ job, status: "saved", notes: "", added_at: "2026-05-10" }], error: undefined, isLoading: false, isValidating: false, mutate: vi.fn() });
  const { default: Dashboard } = await import("@/app/page");
  render(<Dashboard />);
  expect(screen.getByText("Saved role")).toBeVisible();
  expect(screen.getByText("Stats unavailable")).toBeVisible();
});
