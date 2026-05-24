"use client";
import { Job, JobMatch } from "@/lib/api";

type Props = {
  match?: JobMatch;
  job?: Job;
  onShortlist?: () => void;
  shortlisted?: boolean;
  rightSlot?: React.ReactNode;
};

function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 75 ? "score-high" : score >= 50 ? "score-mid" : "score-low";
  return (
    <div className={`score-badge h-14 w-14 flex-col gap-0 text-base leading-none ${cls}`}>
      <span className="font-bold">{score}</span>
      <span className="text-[9px] font-medium uppercase tracking-wide opacity-60">fit</span>
    </div>
  );
}

const WORK_MODE_COLOR: Record<string, string> = {
  Remote: "pill-success",
  Hybrid: "pill-info",
  "On-site": "pill",
};

export function JobCard({ match, job: jobProp, onShortlist, shortlisted, rightSlot }: Props) {
  const job = match?.job ?? jobProp;
  if (!job) return null;

  return (
    <div className="card-interactive p-5 animate-fade-up">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-ink-900 leading-snug">{job.title}</h3>
          <p className="mt-0.5 text-sm text-ink-500">
            {job.company} · {job.location}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className={`pill ${WORK_MODE_COLOR[job.work_mode] ?? "pill"}`}>
              {job.work_mode}
            </span>
            <span className="pill">{job.seniority}</span>
            <span className="pill">{job.employment_type}</span>
            <span className="pill font-medium text-ink-800">{job.salary_range}</span>
          </div>
        </div>
        {typeof match?.score === "number" && <ScoreBadge score={match.score} />}
      </div>

      {/* Description */}
      <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ink-600">
        {job.description}
      </p>

      {/* Why this fits */}
      {match && (
        <div className={`mt-3 rounded-xl p-3 text-xs ${
          match.score >= 60
            ? "bg-emerald-50 border border-emerald-100"
            : "bg-ink-50 border border-ink-100"
        }`}>
          <p className="font-semibold text-ink-800 mb-0.5">Why this fits</p>
          <p className="text-ink-600">{match.reason}</p>
          {match.missing_skills.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              <span className="text-ink-500 mr-0.5">Gaps:</span>
              {match.missing_skills.map((s) => (
                <span key={s} className="pill-warn">{s}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer: skills + actions */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {job.must_have_skills.slice(0, 5).map((s) => (
            <span key={s} className="pill-accent">{s}</span>
          ))}
          {job.must_have_skills.length > 5 && (
            <span className="pill text-ink-400">+{job.must_have_skills.length - 5}</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {rightSlot}
          {onShortlist && (
            <button
              onClick={onShortlist}
              disabled={shortlisted}
              className={shortlisted ? "btn-ghost text-emerald-600 !cursor-default" : "btn-primary"}
            >
              {shortlisted ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                    <path d="M2 7l3 3 6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Saved
                </>
              ) : (
                "+ Shortlist"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
