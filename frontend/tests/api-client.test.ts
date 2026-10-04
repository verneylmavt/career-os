import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, request } from "@/lib/api-client";

afterEach(() => vi.unstubAllGlobals());

it("validates successful payloads before exposing them to the UI", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"count":"wrong"}', { status: 200 })));
  await expect(request("/api/test", z.object({ count: z.number() }))).rejects.toMatchObject({ code: "invalid_response" });
});

it("preserves readable errors and retry timing without dumping transport content", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "Quota reached. Try later.", code: "quota_exceeded", retryable: false }), { status: 429, headers: { "Retry-After": "30" } })));
  const error = await request("/api/test", z.object({ count: z.number() })).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ message: "Quota reached. Try later.", code: "quota_exceeded", retryAfter: "30", status: 429, retryable: false });
});

it("does not set JSON content type on a multipart upload", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  await request("/api/profile/upload", z.object({ ok: z.boolean() }), { method: "POST", body: new FormData() });
  const headers = fetchMock.mock.calls[0][1].headers as Headers;
  expect(headers.has("Content-Type")).toBe(false);
  expect(fetchMock.mock.calls[0][1].signal).toBeDefined();
});

it("turns connection errors into useful messages and honors cancellation", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("internal address")));
  await expect(request("/api/test", z.object({}))).rejects.toMatchObject({ code: "connection_error", retryable: true });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError")));
  await expect(request("/api/test", z.object({}))).rejects.toMatchObject({ name: "AbortError" });
});
