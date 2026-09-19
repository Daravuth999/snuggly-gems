/**
 * productionStages.js — the ONE definition of the Video Factory production
 * workflow. Each stage derives its status from the real lesson document —
 * never a stored "wizard step", so the stage rail is always truthful even
 * if the lesson was edited elsewhere.
 */
import { Info as InfoIcon, UploadCloud as UploadIcon, Wand2 as WandIcon, Mic2 as VoiceIcon, ClipboardCheck as ReviewIcon, MonitorPlay as TpIcon, Rocket as PublishIcon, BarChart3 as StatsIcon } from "lucide-react";

export const STAGES = [
  { key: "info", label: "Lesson Info", Icon: InfoIcon },
  { key: "media", label: "Media", Icon: UploadIcon },
  { key: "pipeline", label: "AI Processing", Icon: WandIcon },
  { key: "voice", label: "Voice Production", Icon: VoiceIcon },
  { key: "review", label: "Sync Review", Icon: ReviewIcon },
  { key: "teleprompter", label: "Teleprompter", Icon: TpIcon },
  { key: "publish", label: "Publishing", Icon: PublishIcon },
  { key: "analytics", label: "Analytics", Icon: StatsIcon },
];

/** complete | active | blocked | pending, per stage, from the lesson doc.
 * `narrationJob` (optional — the AI Narration production job, see
 * videoLibraryApi.js's getNarration) drives the "voice" stage only; it is
 * an entirely OPTIONAL, additive parallel track — a lesson can reach
 * "published" having never touched Voice Production at all, so its status
 * never gates review/teleprompter/publish the way pipeline completion does.
 *
 * "voice" is gated on `hasMedia`, NOT pipeline completion: Voice
 * Production's Story Analysis (video_narration_tools.run_story_analysis)
 * only ever requires the lesson's mediaRef/syncId to exist — both are set
 * at upload time — and gracefully treats a still-empty transcript as a
 * valid state, so it is fully usable the moment media is uploaded, even
 * while AI Processing (the separate, ASR-focused pipeline below) is still
 * running, blocked, or was skipped entirely for a silent video. Gating it
 * on `pipelineDone` here was a real bug: a lesson whose AI Processing was
 * stuck showed Voice Production as merely "pending" (dimmed, looking
 * unavailable) even though it was fully clickable and functional. */
export function stageStatus(lesson, sync, narrationJob) {
  const hasInfo = Boolean(lesson.title && (lesson.category || lesson.difficulty));
  const hasMedia = Boolean(lesson.mediaRef);
  const pipeline = lesson.pipeline || null;
  // 2026-09 fix (confirmed production defect: the manual transcript-import
  // choice screen in MediaPanel.jsx was never visible to real admins).
  // MediaPanel's upload now genuinely stops after attaching media and
  // waits for the admin to pick Auto-generate vs. Import transcript
  // (`awaitTranscriptChoice: true` — the backend does NOT auto-schedule a
  // pipeline run during that wait, so `lesson.pipeline` stays unset).
  // Treating `hasMedia` ALONE as "media stage complete / pipeline stage
  // active" (the previous logic) meant `currentStage()` skipped straight
  // past "media" the instant upload finished — ProductionStudio's
  // auto-advance-to-live-stage effect then yanked the admin off
  // MediaPanel's still-unresolved choice UI and onto the unrelated AI
  // Processing tab (PipelinePanel's own "Process lesson" button,
  // which has no transcript-import option at all) before the choice
  // could ever be seen or used. `pipelineStarted` requires a REAL
  // scheduled run — any status at all — which only exists once the admin
  // has actually made that choice (or the legacy default path scheduled
  // it for them automatically).
  const pipelineStarted = Boolean(pipeline && pipeline.state);
  const pipelineDone = pipeline?.state === "complete";
  const pipelineRunning = pipeline?.state === "running";
  const pipelineFailed = pipeline?.state === "failed";
  const reviewStatus = sync?.reviewStatus || null;
  const approved = reviewStatus === "approved";
  const published = lesson.status === "published";

  const narrationPublished = Boolean(narrationJob?.published);
  const narrationAssembled = narrationJob?.assembly?.state === "completed";
  const narrationStarted = narrationJob?.storyAnalysis?.state
    && narrationJob.storyAnalysis.state !== "pending";

  return {
    info: hasInfo ? "complete" : "active",
    media: pipelineStarted ? "complete" : hasMedia ? "active" : hasInfo ? "active" : "pending",
    pipeline: pipelineDone ? "complete"
      : pipelineRunning ? "active"
        : pipelineFailed ? "blocked"
          : pipelineStarted ? "active" : "pending",
    voice: narrationPublished ? "complete"
      : narrationAssembled || narrationStarted ? "active"
        : hasMedia ? "active" : "pending",
    review: approved ? "complete"
      : (pipelineDone || reviewStatus) ? "active"
        : "pending",
    teleprompter: approved || pipelineDone ? "active" : "pending",
    publish: published ? "complete" : (hasMedia ? "active" : "pending"),
    analytics: published ? "active" : "pending",
  };
}

/** The lesson's current production stage — the first non-complete stage.
 * `stages` defaults to the full STAGES list; callers hiding a stage (e.g.
 * "voice" while Video Factory's narration flag is off) pass a filtered
 * list so a hidden stage can never be auto-selected as the active one. */
export function currentStage(statuses, stages = STAGES) {
  for (const s of stages) {
    if (statuses[s.key] === "active" || statuses[s.key] === "blocked") return s.key;
  }
  return "analytics";
}
