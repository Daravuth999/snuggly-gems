/**
 * ProductionStudio.jsx — one lesson's full-screen production workspace:
 * the staged workflow (Lesson Info → Media → AI Processing → Sync Review →
 * Teleprompter → Publishing → Analytics) with a stage rail whose statuses
 * derive from the REAL lesson + sync documents. The admin always knows
 * exactly which stage a lesson is in.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { X, Check, Loader2, AlertTriangle, Circle, ClipboardCheck, ArrowRight } from "lucide-react";
import { listLessonsAdmin, getSyncAdmin, getNarration, getVideoFactoryStatus } from "./videoLibraryApi";
import { STAGES, stageStatus, currentStage } from "./productionStages";
import InfoPanel from "./panels/InfoPanel";
import MediaPanel from "./panels/MediaPanel";
import PipelinePanel from "./panels/PipelinePanel";
import VoiceProductionPanel from "./panels/VoiceProductionPanel";
import TeleprompterPanel from "./panels/TeleprompterPanel";
import PublishPanel from "./panels/PublishPanel";
import AnalyticsPanel from "./panels/AnalyticsPanel";
import SyncReviewStudio from "./SyncReviewStudio";
import { studioSafeAreaTop } from "../safeArea";

const GOLD = "#D4A843";

/** A calm, transient signal that the workflow moved itself forward — not
 * an abrupt jump. Fades/slides in on mount (a fresh `notice` object each
 * time it fires); the parent auto-clears it after a few seconds. */
function AutoAdvanceNotice({ notice }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!notice) return undefined;
    setVisible(false);
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [notice]);
  if (!notice) return null;
  return (
    <div className={`mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] transition-all duration-300 ease-out ${
      visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"
    }`} style={{ borderColor: "rgba(212,168,67,0.3)", background: "rgba(212,168,67,0.08)", color: "#FFE19A" }}
         data-testid="production-auto-advance-notice">
      <Check size={13} className="text-emerald-300 flex-shrink-0" />
      <span>{notice.fromLabel} complete — moved to <b>{notice.toLabel}</b></span>
      <ArrowRight size={12} className="ml-auto opacity-60 flex-shrink-0" />
    </div>
  );
}

function StageDot({ status }) {
  if (status === "complete") return <Check size={11} className="text-emerald-300" />;
  if (status === "blocked") return <AlertTriangle size={11} className="text-red-400" />;
  if (status === "active") return <Circle size={9} style={{ color: GOLD, fill: GOLD }} />;
  return <Circle size={9} className="text-white/20" />;
}

export default function ProductionStudio({ lesson: initialLesson, onClose, onChanged }) {
  const [lesson, setLesson] = useState(initialLesson);
  const [sync, setSync] = useState(null);
  const [narrationJob, setNarrationJob] = useState(null);
  const [stage, setStage] = useState(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Video Factory's Voice Production visibility/enabled gate — mirrors
  // Book Factory's bfStatus pattern (StudioPage.jsx) so this genuinely new,
  // not-yet-live-tested surface can be staged/hidden without deleting any
  // code. Fail-closed default: the stage is absent from the rail until the
  // backend confirms visible:true.
  const [vfStatus, setVfStatus] = useState({ visible: false, enabled: false });

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const all = await listLessonsAdmin();
      const fresh = all.find((l) => l.lessonId === initialLesson.lessonId);
      if (fresh) {
        setLesson(fresh);
        if (fresh.syncId) {
          try { setSync(await getSyncAdmin(fresh.syncId)); } catch { setSync(null); }
        } else {
          setSync(null);
        }
      }
      try { setNarrationJob(await getNarration(initialLesson.lessonId)); } catch { /* non-fatal — rail badge only */ }
      onChanged();
    } finally {
      setRefreshing(false);
    }
  }, [initialLesson.lessonId, onChanged]);

  useEffect(() => {
    if (initialLesson.syncId) {
      getSyncAdmin(initialLesson.syncId).then(setSync).catch(() => {});
    }
    getNarration(initialLesson.lessonId).then(setNarrationJob).catch(() => {});
  }, [initialLesson.lessonId, initialLesson.syncId]);

  useEffect(() => {
    let cancelled = false;
    getVideoFactoryStatus()
      .then((s) => { if (!cancelled) setVfStatus(s || { visible: false, enabled: false }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const statuses = stageStatus(lesson, sync, narrationJob);
  const visibleStages = vfStatus.visible ? STAGES : STAGES.filter((s) => s.key !== "voice");
  const liveStage = currentStage(statuses, visibleStages);

  // Auto-advance (2026-09 fix): `stage` used to be a one-way manual
  // override — the FIRST click anywhere (including MediaPanel's own
  // onPipelineStarted below) froze it forever, so `liveStage`'s live
  // re-computation from the real lesson/sync/narration documents could
  // never reach the screen again even as the lesson kept progressing.
  //
  // The fix distinguishes "the admin is currently sitting at the live
  // edge of the workflow" from "the admin deliberately navigated
  // somewhere else (including backward, to review a finished stage)":
  // `stageRef` mirrors `stage` and `prevLiveStageRef` remembers the last
  // live stage this effect observed. An auto-advance only fires when the
  // admin's current `stage` still equals that PREVIOUS live stage — i.e.
  // they were genuinely at the front line when it moved — never when
  // they've clicked away to a different stage, so a background refresh
  // completing some OTHER stage can never yank them off wherever they
  // chose to be.
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const prevLiveStageRef = useRef(null);
  const [autoAdvanceNotice, setAutoAdvanceNotice] = useState(null);
  const noticeTimerRef = useRef(null);

  useEffect(() => {
    const prevLive = prevLiveStageRef.current;
    prevLiveStageRef.current = liveStage;
    if (prevLive === null || prevLive === liveStage) return;
    if (stageRef.current !== prevLive) return; // admin had navigated elsewhere — leave them there
    setStage(liveStage);
    const fromLabel = visibleStages.find((s) => s.key === prevLive)?.label || prevLive;
    const toLabel = visibleStages.find((s) => s.key === liveStage)?.label || liveStage;
    setAutoAdvanceNotice({ fromLabel, toLabel });
    clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setAutoAdvanceNotice(null), 4000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStage]);

  useEffect(() => () => clearTimeout(noticeTimerRef.current), []);

  const activeStage = stage || liveStage;

  const openStage = (key) => {
    setAutoAdvanceNotice(null);
    if (key === "review") { setReviewOpen(true); return; }
    setStage(key);
  };

  return (
    <div className="fixed inset-0 z-[190] flex flex-col" style={{ background: "#0F0A16" }}
         data-testid="production-studio">
      {/* Header — iOS safe-area fix via the shared studioSafeAreaTop()
          convention (safeArea.js). This is a `fixed inset-0` overlay
          outside AppShell, so it never inherited the app shell's
          safe-area handling and rendered flush against the Dynamic
          Island / status bar on iPhone. */}
      <div className="flex items-center gap-3 px-4 pb-2.5 border-b border-white/10 flex-shrink-0"
           style={{ paddingTop: studioSafeAreaTop(10) }}>
        <button onClick={onClose} data-testid="production-studio-close" aria-label="Close production studio"
                className="p-1.5 rounded-lg hover:bg-white/10 text-parchment"><X size={16} /></button>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold text-parchment truncate">{lesson.title}</div>
          <div className="text-[10.5px] text-faded">
            {[lesson.category, lesson.difficulty, lesson.cefrLevel].filter(Boolean).join(" · ") || "Video lesson production"}
          </div>
        </div>
        {refreshing && <Loader2 size={13} className="animate-spin text-faded" />}
        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border"
              data-testid="production-status-chip"
              style={lesson.status === "published"
                ? { color: "#6ee7b7", borderColor: "rgba(52,211,153,0.4)", background: "rgba(52,211,153,0.08)" }
                : lesson.status === "archived"
                  ? { color: "#fbbf24", borderColor: "rgba(245,158,11,0.4)", background: "rgba(245,158,11,0.08)" }
                  : { color: "#9ca3af", borderColor: "rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.04)" }}>
          {lesson.status}
        </span>
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* Stage rail */}
        <div className="flex lg:flex-col gap-1 p-2 lg:p-3 lg:w-52 border-b lg:border-b-0 lg:border-r border-white/10 overflow-x-auto lg:overflow-x-visible flex-shrink-0"
             data-testid="production-stage-rail">
          {visibleStages.map((s) => {
            const st = statuses[s.key];
            const isActive = activeStage === s.key && !reviewOpen;
            const justAutoAdvancedHere = isActive && autoAdvanceNotice;
            return (
              <button key={s.key} onClick={() => openStage(s.key)}
                      data-testid={`production-stage-${s.key}`}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-left whitespace-nowrap transition-all duration-500"
                      style={isActive
                        ? {
                            background: "rgba(212,168,67,0.10)",
                            border: "1px solid rgba(212,168,67,0.35)",
                            boxShadow: justAutoAdvancedHere ? "0 0 0 3px rgba(212,168,67,0.18)" : "none",
                          }
                        : { border: "1px solid transparent" }}>
                <StageDot status={st} />
                <s.Icon size={13} style={{ color: isActive ? GOLD : "rgba(255,255,255,0.45)" }} />
                <span className="text-[12px] font-semibold"
                      style={{ color: isActive ? "#FFE19A" : st === "pending" ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.75)" }}>
                  {s.label}
                </span>
                {s.key === "review" && sync?.reviewStatus && (
                  <span className="ml-auto text-[9px] font-bold uppercase"
                        style={{ color: sync.reviewStatus === "approved" ? "#6ee7b7" : "#FFE19A" }}>
                    {sync.reviewStatus}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Stage content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 lg:p-6">
          <AutoAdvanceNotice notice={autoAdvanceNotice} />
          {activeStage === "info" && <InfoPanel lesson={lesson} onChanged={refresh} />}
          {activeStage === "media" && (
            <MediaPanel lesson={lesson} onChanged={refresh}
                        onPipelineStarted={() => setStage("pipeline")} />
          )}
          {activeStage === "pipeline" && <PipelinePanel lesson={lesson} onChanged={refresh} />}
          {activeStage === "voice" && vfStatus.visible && (
            <VoiceProductionPanel lesson={lesson} onChanged={refresh} enabled={vfStatus.enabled}
                                   musicStatus={vfStatus.music} sfxStatus={vfStatus.sfx} />
          )}
          {activeStage === "review" && !reviewOpen && (
            <div className="rounded-xl border border-dashed border-white/10 p-8 text-center">
              <ClipboardCheck size={22} className="mx-auto mb-2 text-amber-300" />
              <button onClick={() => setReviewOpen(true)}
                      data-testid="production-open-review"
                      className="rounded-lg bg-amber-500/90 text-black text-sm font-semibold px-4 py-2">
                Open Synchronization Review Studio
              </button>
            </div>
          )}
          {activeStage === "teleprompter" && <TeleprompterPanel lesson={lesson} onChanged={refresh} />}
          {activeStage === "publish" && (
            <PublishPanel lesson={lesson} sync={sync} onChanged={refresh}
                          onDeleted={() => { onChanged(); onClose(); }} />
          )}
          {activeStage === "analytics" && <AnalyticsPanel lesson={lesson} />}
        </div>
      </div>

      {reviewOpen && (
        <SyncReviewStudio lesson={lesson}
                          onClose={() => { setReviewOpen(false); refresh(); }}
                          onChanged={() => {}} />
      )}
    </div>
  );
}
