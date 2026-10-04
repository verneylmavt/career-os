import { NextRequest } from "next/server";
import { afterEach, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/[...path]/route";

afterEach(() => vi.unstubAllGlobals());

it("forwards query strings and retry timing", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response('{"detail":"Quota reached","code":"provider_quota","retryable":true}', { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "30" } }));
  vi.stubGlobal("fetch", fetchMock);
  const response = await GET(new NextRequest("http://localhost:3000/api/interview/job-001/session?session_id=old"));
  expect(fetchMock.mock.calls[0][0]).toContain("/api/interview/job-001/session?session_id=old");
  expect(response.headers.get("Retry-After")).toBe("30");
  expect(response.status).toBe(429);
  expect(fetchMock.mock.calls[0][1].signal).toBeDefined();
});

it("preserves actual multipart bytes and boundary", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response('{"saved":true}', { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  const form = new FormData(); form.set("pasted_text", "Synthetic resume text");
  const response = await POST(new NextRequest("http://localhost:3000/api/profile/upload", { method: "POST", body: form }));
  expect(response.status).toBe(200);
  const forwarded = fetchMock.mock.calls[0][1];
  expect(new Headers(forwarded.headers).get("Content-Type")).toMatch(/^multipart\/form-data; boundary=/);
  expect(forwarded.body).toBeDefined();
});

it("does not expose backend connection details", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("internal connection details")));
  const response = await GET(new NextRequest("http://localhost:3000/api/profile"));
  const body = await response.json();
  expect(body).toMatchObject({ code: "proxy_unavailable", retryable: true });
  expect(JSON.stringify(body)).not.toContain("internal connection details");
});
