"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import { z } from "zod";
import { ApiError, errorMessage, isCancelled, request } from "./api-client";
import { contextSchema, documentsSchema, dossierSchema, profileSchema, sessionSchema, shortlistSchema, statsSchema } from "./contracts";

export const keys = {
  profile: "/api/profile", shortlist: "/api/jobs/shortlist", contexts: "/api/jobs", stats: "/api/dashboard/stats",
  documents: (jobId: string, tone = "warm") => `/api/resume/${encodeURIComponent(jobId)}/documents?tone=${encodeURIComponent(tone)}`,
  dossier: (jobId: string) => `/api/jobs/${encodeURIComponent(jobId)}/dossier`,
  session: (jobId: string, sessionId = "") => `/api/interview/${encodeURIComponent(jobId)}/session${sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ""}`,
};

function useSaved<T>(key: string | null, schema: z.ZodType<T>) {
  return useSWR(key, (path: string) => request(path, schema), {
    errorRetryCount: 1,
    shouldRetryOnError: (error: unknown) => error instanceof ApiError && error.retryable,
  });
}

export const useProfile = () => useSaved(keys.profile, profileSchema);
export const useShortlist = () => useSaved(keys.shortlist, z.array(shortlistSchema));
export const useContexts = () => useSaved(keys.contexts, z.array(contextSchema));
export const useStats = () => useSaved(keys.stats, statsSchema);
export const useDocuments = (jobId: string, tone = "warm") => useSaved(jobId ? keys.documents(jobId, tone) : null, documentsSchema);
export const useDossier = (jobId: string) => useSaved(jobId ? keys.dossier(jobId) : null, dossierSchema.nullable());
export const useSession = (jobId: string, sessionId = "") => useSaved(jobId ? keys.session(jobId, sessionId) : null, sessionSchema);

export async function refreshWorkspace() {
  await mutate((key) => typeof key === "string" && key.startsWith("/api/"));
}

/** Pending state and errors belong to the resource that started the operation. */
export function useResourceAction() {
  const controllers = useRef(new Map<string, AbortController>());
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    const active = controllers.current;
    return () => { for (const controller of active.values()) controller.abort(); active.clear(); };
  }, []);
  const run = useCallback(async <T,>(key: string, action: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> => {
    if (controllers.current.has(key)) return undefined;
    const controller = new AbortController();
    controllers.current.set(key, controller);
    setPending((previous) => ({ ...previous, [key]: true }));
    setErrors((previous) => ({ ...previous, [key]: "" }));
    try {
      const value = await action(controller.signal);
      return controller.signal.aborted ? undefined : value;
    } catch (error) {
      if (!isCancelled(error) && !controller.signal.aborted) setErrors((previous) => ({ ...previous, [key]: errorMessage(error) }));
      return undefined;
    } finally {
      if (controllers.current.get(key) === controller) {
        controllers.current.delete(key);
        setPending((previous) => ({ ...previous, [key]: false }));
      }
    }
  }, []);
  const cancel = useCallback((key: string) => controllers.current.get(key)?.abort(), []);
  return { run, pending, errors, cancel };
}
