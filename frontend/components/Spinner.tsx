export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-ink-500">
      <span className="loading-dot" />
      <span className="loading-dot" />
      <span className="loading-dot" />
      {label && <span className="text-sm">{label}</span>}
    </span>
  );
}
