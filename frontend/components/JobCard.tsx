"use client";
import { Job, JobMatch } from "@/lib/api";

type Props = {
  match?: JobMatch;
  job?: Job;
  onShortlist?: () => void;
  shortlisted?: boolean;
  rightSlot?: React.ReactNode;
};

export function JobCard({ match, job: jobProp, onShortlist, shortlisted, rightSlot }: Props) {
  const job = match?.job || jobProp;
  if (!job) return null;
  const score = match?.score;

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-ink-900">{job.title}</h3>
          <p className="text-sm text-ink-600">
            {job.company} · {job.location} · <span className="text-ink-500">{job.work_mode}</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="pill">{job.seniority}</span>
            <span className="pill">{job.employment_type}</span>
            <span className="pill">{job.salary_range}</span>
          </div>
        </div>
        {typeof score === "number" && (
          <div className="shrink-0 text-right">
            <div className={
              "inline-flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold " +
              (score >= 75 ? "bg-emerald-100 text-emerald-700"
                : score >= 50 ? "bg-amber-100 text-amber-800"
                : "bg-ink-100 text-ink-700")
            }>
              {score}
            </div>
            <p className="mt-1 text-[10px] uppercase tracking-wide text-ink-400">Fit</p>
          </div>
        )}
      </div>

      <p className="mt-3 line-clamp-2 text-sm text-ink-700">{job.description}</p>

      {match && (
        <div className="mt-3 rounded-lg bg-ink-50 p-3 text-xs text-ink-700">
          <p className="font-medium text-ink-800">Why this fits</p>
          <p className="mt-0.5">{match.reason}</p>
          {match.missing_skills.length > 0 && (
            <p className="mt-1.5">
              <span className="font-medium">Skill gaps:</span>{" "}
              {match.missing_skills.map((s) => (
                <span key={s} className="pill-warn mr-1">{s}</span>
              ))}
            </p>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {job.must_have_skills.slice(0, 5).map((s) => (
            <span key={s} className="pill-accent">{s}</span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {rightSlot}
          {onShortlist && (
            <button
              onClick={onShortlist}
              className={shortlisted ? "btn-secondary" : "btn-primary"}
              disabled={shortlisted}
            >
              {shortlisted ? "✓ Shortlisted" : "+ Shortlist"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
