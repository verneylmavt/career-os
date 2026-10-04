import { errorMessage } from "@/lib/api-client";

export function ErrorNotice({ error, retry }: { error: unknown; retry?: () => void }) {
  if (!error) return null;
  return <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
    <p>{typeof error === "string" ? error : errorMessage(error)}</p>
    {retry && <button className="btn-secondary mt-2" onClick={retry}>Try again</button>}
  </div>;
}
