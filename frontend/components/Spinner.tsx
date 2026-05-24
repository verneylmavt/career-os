export function Spinner({ label, size = "md" }: { label?: string; size?: "sm" | "md" }) {
  const ring = size === "sm"
    ? "h-3.5 w-3.5 border-2"
    : "h-5 w-5 border-[2.5px]";
  return (
    <span className="inline-flex items-center gap-2.5 text-ink-400">
      <span
        className={`block shrink-0 animate-spin rounded-full border-ink-200 border-t-accent ${ring}`}
      />
      {label && <span className="text-sm text-ink-500">{label}</span>}
    </span>
  );
}
