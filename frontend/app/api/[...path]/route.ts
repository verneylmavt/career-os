import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.API_BASE || "http://localhost:8000";

async function proxy(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const targetUrl = `${BACKEND}${url.pathname}${url.search}`;

  const contentType = req.headers.get("content-type") ?? "";
  const isMultipart = contentType.startsWith("multipart/form-data");

  const forwardHeaders: Record<string, string> = {};
  if (isMultipart) {
    // preserve content-type with boundary so the backend can parse the form
    forwardHeaders["Content-Type"] = contentType;
  } else if (req.method !== "GET" && req.method !== "HEAD") {
    forwardHeaders["Content-Type"] = "application/json";
  }

  let body: BodyInit | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = isMultipart ? await req.blob() : await req.text();
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body,
      cache: "no-store",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Backend unreachable", detail: String(err) },
      { status: 502 },
    );
  }

  const responseBody = await backendRes.arrayBuffer();
  const responseContentType =
    backendRes.headers.get("content-type") ?? "application/json";

  return new NextResponse(responseBody, {
    status: backendRes.status,
    headers: { "Content-Type": responseContentType },
  });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
