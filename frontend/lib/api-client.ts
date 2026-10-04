import { z } from "zod";

export class ApiError extends Error {
  constructor(message: string, public code: string, public status = 0, public retryable = false, public retryAfter: string | null = null) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function isCancelled(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

export async function request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}, timeoutMs = init.method && init.method !== "GET" ? 75_000 : 15_000): Promise<T> {
  const controller = new AbortController();
  const callerSignal = init.signal;
  let timedOut = false;
  const cancel = () => controller.abort();
  if (callerSignal?.aborted) cancel();
  callerSignal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  try {
    const response = await fetch(path, { ...init, headers, cache: "no-store", signal: controller.signal });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const parsed = z.object({ detail: z.string(), code: z.string().optional(), retryable: z.boolean().optional() }).safeParse(body);
      const fallback = response.status === 409 ? "Your saved work changed. Reload and try again."
        : response.status === 422 ? "Please check the information you entered."
        : response.status === 429 ? "The AI service reached its quota. Please try later."
        : "The request could not be completed. Please try again.";
      throw new ApiError(parsed.success ? parsed.data.detail : fallback,
        parsed.success ? parsed.data.code ?? "request_failed" : "request_failed", response.status,
        parsed.success ? parsed.data.retryable ?? false : response.status >= 500, response.headers.get("Retry-After"));
    }
    const body: unknown = await response.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ApiError("The server returned an unexpected response. Reload and try again.", "invalid_response", 502);
    return parsed.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (timedOut) throw new ApiError("This request took too long. Your previous saved work is still available.", "request_timeout", 504, true);
    if (isCancelled(error) || callerSignal?.aborted) throw new DOMException("Request cancelled", "AbortError");
    throw new ApiError("Could not connect to Career OS. Check that the backend is running and try again.", "connection_error", 0, true);
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", cancel);
  }
}
