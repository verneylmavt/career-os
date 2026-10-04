export function Spinner({ label, size = "md" }: { label?: string; size?: "sm" | "md" }) {
  const ring = size === "sm"
    ? "h-3.5 w-3.5 border-2"
    : "h-5 w-5 border-[2.5px]";
  return (
    <span role="status" className="inline-flex items-center gap-2.5 text-ink-600">
      <span
        aria-hidden="true"
        className={`block shrink-0 animate-spin rounded-full border-ink-200 border-t-accent ${ring}`}
      />
      <span className={label ? "text-sm text-ink-600" : "sr-only"}>{label || "Loading…"}</span>
    </span>
  );
}
