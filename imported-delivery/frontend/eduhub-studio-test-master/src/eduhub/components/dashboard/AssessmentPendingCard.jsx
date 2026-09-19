// AssessmentPendingCard.jsx — Dashboard's contextual shortcut for the
// Assessment Lab ("What do I need to do today?" — the Sidebar's
// "Assessments" entry answers "Where are my tests?" instead; see
// useAssessmentBadge.js's header for why these two surfaces intentionally
// share one hook/data source rather than reimplementing the same check).
//
// Renders NOTHING when there is no pending assessment — a real, honest
// empty state per this page's own established convention (DiscoveryCard,
// PromotionPanel, RecentAchievements all do the same), not an
// EmptyStateCard placeholder advertising a feature the student has no
// action to take on right now.
import { Link } from "react-router-dom";
import { ClipboardList, ArrowRight } from "lucide-react";
import useAssessmentBadge from "../../pages/assessments/useAssessmentBadge";
import { radius } from "../../styles/tokens/designTokens";
import Tappable from "../Tappable";

const GOLD = "#D4A843";

// Defensive display formatting only — some assessment titles arrive as
// slugified filenames (underscores, no spacing) rather than human-authored
// copy. Never changes the words themselves, only whitespace, so an
// already-clean title passes through byte-for-byte unchanged.
function formatAssessmentTitle(raw) {
  const s = String(raw || "").trim();
  return s.includes("_") ? s.replace(/_+/g, " ").replace(/\s+/g, " ").trim() : s;
}

export default function AssessmentPendingCard() {
  const { pendingAssessment, pendingCount, loading } = useAssessmentBadge();

  if (loading || !pendingAssessment) return null;

  const resubmit = pendingAssessment?.mySubmission?.status === "failed";

  return (
    <div className="px-4" data-testid="assessment-pending-card">
      {/* Dashboard Polish Round 2, Feature 2 — the shared Tappable
          affordance replaces this card's own bespoke whileTap treatment,
          so its hover/tap/idle-shimmer feel matches every other
          interactive Dashboard block instead of being tuned separately. */}
      <Tappable className="block overflow-hidden" style={{ borderRadius: radius.md }}>
        <Link
          to="/assessments"
          data-testid="assessment-pending-card-link"
          className="flex items-center gap-3 px-4 py-3.5 border border-zinc-900/[0.08] dark:border-white/[0.08] transition-colors duration-150 hover:bg-zinc-900/[0.02] dark:hover:bg-white/[0.03]"
          style={{
            borderRadius: radius.md,
            background: "linear-gradient(135deg, rgba(212,168,67,0.08), rgba(212,168,67,0.01) 70%)",
          }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "rgba(212,168,67,0.14)", border: "1px solid rgba(212,168,67,0.32)" }}
          >
            <ClipboardList size={17} style={{ color: GOLD }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[0.66rem] font-bold uppercase tracking-[0.1em]" style={{ color: GOLD }}>
              Assessment{pendingCount > 1 ? ` · ${pendingCount}` : ""}
            </div>
            <div className="text-[0.86rem] font-semibold text-ink dark:text-white truncate" data-testid="assessment-pending-card-title">
              {formatAssessmentTitle(pendingAssessment.title)}
            </div>
            <div className="text-[0.72rem] text-zinc-600 dark:text-white/50 mt-0.5">
              {resubmit ? "Couldn't process — try again" : "Ready to submit"} · Upload your answers
            </div>
          </div>
          <ArrowRight size={16} className="shrink-0" style={{ color: GOLD }} />
        </Link>
      </Tappable>
    </div>
  );
}
