/**
 * JourneyTimeline.jsx — the vertical Submitted → AI checked → Teacher
 * review → Points awarded lifecycle rail, rendered from buildJourney()'s
 * honest projection of one submission. Shared by the detail sheet and the
 * results sheet so both surfaces always tell the same story.
 */
import { Check, X, Loader2 } from "lucide-react";
import { buildJourney } from "./lifecycle";

function Dot({ state }) {
  if (state === "done") {
    return (
      <span className="asmt-tl-dot asmt-tl-dot-done">
        <Check size={11} strokeWidth={3.2} />
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="asmt-tl-dot asmt-tl-dot-failed">
        <X size={11} strokeWidth={3.2} />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="asmt-tl-dot asmt-tl-dot-active">
        <Loader2 size={11} className="animate-spin" />
      </span>
    );
  }
  return <span className="asmt-tl-dot asmt-tl-dot-pending" />;
}

export default function JourneyTimeline({ submission, compact = false, testId = "assessment-journey-timeline" }) {
  const steps = buildJourney(submission);
  return (
    <ol className="asmt-tl" data-testid={testId}>
      {steps.map((s, i) => (
        <li key={s.key} className="asmt-tl-row" data-testid={`${testId}-step-${s.key}`} data-state={s.state}>
          <div className="asmt-tl-rail">
            <Dot state={s.state} />
            {i < steps.length - 1 && <span className={`asmt-tl-line ${s.state === "done" ? "asmt-tl-line-done" : ""}`} />}
          </div>
          <div className={`min-w-0 flex-1 ${i < steps.length - 1 ? "pb-4" : ""}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className={`text-[12.5px] ${s.state === "active" ? "font-bold text-white" : s.state === "done" ? "font-semibold text-white/85" : "font-semibold text-white/40"}`}>
                {s.label}
              </span>
              {s.when && <span className="text-[10.5px] text-white/35 tnum flex-shrink-0">{s.when}</span>}
            </div>
            {!compact && (
              <div className={`text-[11.5px] leading-snug mt-0.5 ${s.state === "failed" ? "text-rose-300" : s.state === "pending" ? "text-white/30" : "text-white/50"}`}>
                {s.desc}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
