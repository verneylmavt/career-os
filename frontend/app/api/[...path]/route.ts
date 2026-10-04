import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 75;
const BACKEND = (process.env.API_BASE || "http://127.0.0.1:8000").replace(/\/$/, "");
const MAX_BODY = 6 * 1024 * 1024; // Allows a 5 MiB resume plus multipart framing.

async function readBody(req: NextRequest, signal: AbortSignal): Promise<ArrayBuffer | undefined> {
  if (!req.body) return undefined;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const chunk = await reader.read();
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); throw new RangeError("Request too large"); }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes.buffer;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

async function proxy(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  req.signal.addEventListener("abort", cancel, { once: true });
  if (req.signal.aborted) cancel();
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, req.method === "GET" ? 15_000 : 70_000);
  try {
    if (Number(req.headers.get("Content-Length")) > MAX_BODY) throw new RangeError("Request too large");
    const headers = new Headers();
    const contentType = req.headers.get("Content-Type");
    if (contentType) headers.set("Content-Type", contentType);
    const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req, controller.signal);
    const response = await fetch(`${BACKEND}${url.pathname}${url.search}`, { method: req.method, headers, body, cache: "no-store", signal: controller.signal });
    const result = await response.arrayBuffer();
    const responseHeaders = new Headers({ "Content-Type": response.headers.get("Content-Type") || "application/json", "Cache-Control": "no-store" });
    const retryAfter = response.headers.get("Retry-After");
    if (retryAfter) responseHeaders.set("Retry-After", retryAfter);
    return new NextResponse(response.status === 204 || req.method === "HEAD" ? null : result, { status: response.status, headers: responseHeaders });
  } catch (error) {
    if (error instanceof RangeError) return NextResponse.json({ detail: "Upload exceeds the request size limit.", code: "upload_too_large", retryable: false }, { status: 413 });
    if (timedOut) return NextResponse.json({ detail: "The backend took too long. Your previous saved work is still available.", code: "proxy_timeout", retryable: true }, { status: 504 });
    if (req.signal.aborted) return NextResponse.json({ detail: "Request cancelled.", code: "request_cancelled", retryable: false }, { status: 499 });
    return NextResponse.json({ detail: "Could not connect to Career OS. Check that the backend is running and try again.", code: "proxy_unavailable", retryable: true }, { status: 502 });
  } finally {
    clearTimeout(timer);
    req.signal.removeEventListener("abort", cancel);
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
