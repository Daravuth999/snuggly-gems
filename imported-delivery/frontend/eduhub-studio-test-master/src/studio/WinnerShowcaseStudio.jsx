/**
 * WinnerShowcaseStudio.jsx — Author Studio › Winner Showcase (Dashboard
 * Polish Round 2, Feature 1's admin controls).
 *
 * Unlike its sibling *ExperienceStudio.jsx pages (WelcomeExperienceStudio,
 * AchievementExperienceStudio, PromotionExperienceStudio), an admin never
 * AUTHORS a winner_showcase config here — the backend auto-publishes one
 * per settled Lucky Draw (event_engine.py's `_publish_winner_showcase`,
 * fired right after finalize). This page exists only to let an admin:
 *   1. see the classroom Speaking Lab's own recent/current showcases
 *      (filtered to content.source === "speaking_lab_classroom_draw" —
 *      the same tag WinnerShowcaseBanner.jsx/FridaySpeakingWinnersPanel.jsx
 *      already key off of, reused here rather than inventing a second
 *      filter convention);
 *   2. force one off the Dashboard early via the EXISTING generic
 *      POST /experience-configs/{id}/unpublish route (no new backend
 *      endpoint — same "unpublish" action every other *ExperienceStudio
 *      page already uses);
 *   3. remove one entry from content.topWinners and save via the
 *      EXISTING generic PUT /experience-configs/{id} route.
 *
 * PUT replaces the WHOLE `content` domain, not a per-field merge (see
 * experience_config_tools.py's update_experience_config: `updates["content"]
 * = _as_domain_dict(payload.get("content"))`) — so the save action below
 * always sends the FULL existing content object with only `topWinners`
 * edited, never a partial patch that would silently drop eventName/
 * champion/distributionCompleted/etc.
 *
 * Reward/wallet separation: this editor's save action calls ONLY
 * updateExperienceConfig(id, { content }) — the generic experience-configs
 * PUT route touches nothing but the `experience_configs` collection (see
 * that route's own implementation). Removing a name from `topWinners`
 * here can never reach the wallet/grant/claim path that already ran
 * server-side at settlement time; it only changes what the Dashboard
 * displays.
 */
import { useCallback, useEffect, useState } from "react";
import { Trophy, RefreshCw, Undo2, Pencil, X, Check, AlertTriangle, Save } from "lucide-react";
import { listExperienceConfigs, updateExperienceConfig, unpublishExperienceConfig } from "./api";

const EXPERIENCE_TYPE = "winner_showcase";
const CLASSROOM_SOURCE = "speaking_lab_classroom_draw";

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

function WinnerEditor({ config, onSaved, onCancel }) {
  const content = config.content || {};
  const [winners, setWinners] = useState(() => [...(content.topWinners || [])]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const removeWinner = (idx) => setWinners((prev) => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    setErr(null);
    setSaving(true);
    try {
      // Full content object, only topWinners changed — PUT replaces the
      // whole domain, so every other field must round-trip unchanged.
      await updateExperienceConfig(config.id, {
        content: { ...content, topWinners: winners },
      });
      onSaved();
    } catch (e) {
      setErr(e.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gold/25 p-4 mb-3" style={{ background: "rgba(20,14,32,0.55)" }} data-testid={`winnershowcase-editor-${config.id}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="font-display text-[13px] text-parchment">
          Edit winners — <span className="text-faded">{content.eventName || "Friday Speaking Lab"}</span>
        </p>
        <button onClick={onCancel} data-testid={`winnershowcase-editor-cancel-${config.id}`} className="text-faded hover:text-parchment">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-1.5">
        {winners.length === 0 && (
          <p className="text-[11.5px] text-faded">No winners left in this showcase.</p>
        )}
        {winners.map((w, i) => (
          <div key={w.student_id || w.code || i} className="flex items-center justify-between rounded-lg border border-white/8 px-3 py-2" style={{ background: "rgba(0,0,0,0.2)" }}>
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold text-parchment truncate">
                {i === 0 ? "🏆 " : ""}{w.display_name || w.student_id || "Student"}
              </p>
              {typeof w.amount === "number" && (
                <p className="text-[10.5px] text-faded">+{w.amount.toLocaleString()} pts</p>
              )}
            </div>
            <button
              onClick={() => removeWinner(i)}
              data-testid={`winnershowcase-remove-winner-${i}`}
              title="Remove from showcase (display only — does not affect their reward)"
              className="text-red-300/70 hover:text-red-300 shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[10.5px] text-faded">
        Removing a name only changes what the Dashboard displays — it never touches the points/reward already granted to that student.
      </p>

      {err && (
        <div className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[12px]"
             style={{ background: "rgba(255,100,100,0.12)", color: "#fca5a5" }} data-testid={`winnershowcase-error-${config.id}`}>
          <AlertTriangle className="h-4 w-4" /> {err}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button onClick={handleSave} disabled={saving} data-testid={`winnershowcase-save-${config.id}`}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11.5px] font-bold uppercase tracking-wider text-ink disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#FFE19A 0%,#D4A843 50%,#9C7A2C 100%)" }}>
          <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save winners"}
        </button>
        <button onClick={onCancel}
                className="rounded-full border border-parchment/25 px-4 py-2 text-[11.5px] font-bold uppercase tracking-wider text-parchment hover:border-gold hover:text-gold">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ShowcaseRow({ c, onUnpublish, onEdit, editing }) {
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const content = c.content || {};
  const topWinners = Array.isArray(content.topWinners) ? content.topWinners : [];
  const champion = topWinners[0];

  return (
    <div className="rounded-xl border border-white/8 p-3 flex items-center gap-3"
         style={{ background: "rgba(30,22,44,0.5)" }} data-testid={`winnershowcase-row-${c.id}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-display text-[14px] text-parchment">{content.eventName || c.key}</p>
          {c.status === "published"
            ? <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: "rgba(52,211,153,0.15)", color: "#6ee7b7" }}>Live</span>
            : <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: "rgba(255,255,255,0.06)", color: "#9ca3af" }}>Draft</span>}
          {content.distributionCompleted && (
            <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: "rgba(52,211,153,0.1)", color: "#6ee7b7" }}>Rewards Sent</span>
          )}
        </div>
        <p className="truncate text-[11px] text-faded">
          {champion ? `🏆 ${champion.display_name || champion.student_id}` : "No winners"}
          {topWinners.length > 1 ? ` · ${topWinners.length} winners total` : ""}
        </p>
        <p className="text-[10.5px] text-faded">
          Rotates until {fmtDate(c.activeWindow?.endsAt)} · updated {fmtDate(c.updatedAt)}
        </p>
      </div>
      <button onClick={() => onEdit(c)} data-testid={`winnershowcase-edit-${c.id}`} title="Edit winners"
              className={`text-parchment hover:text-gold ${editing ? "text-gold" : ""}`}>
        <Pencil className="h-4 w-4" />
      </button>
      {c.status === "published" && (
        confirmUnpublish ? (
          <button onClick={() => onUnpublish(c)} data-testid={`winnershowcase-unpublish-confirm-${c.id}`}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold text-red-300"
                  style={{ background: "rgba(255,100,100,0.15)" }}>
            <Check className="h-3 w-3" /> Confirm
          </button>
        ) : (
          <button onClick={() => setConfirmUnpublish(true)} data-testid={`winnershowcase-unpublish-${c.id}`}
                  title="Unpublish now — force this off the Dashboard early" className="text-parchment hover:text-gold">
            <Undo2 className="h-4 w-4" />
          </button>
        )
      )}
    </div>
  );
}

export default function WinnerShowcaseStudio() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await listExperienceConfigs(EXPERIENCE_TYPE);
      const all = data.configs || [];
      setConfigs(all.filter((c) => c.content?.source === CLASSROOM_SOURCE));
    } catch (e) {
      setErr(e.message || "Failed to load showcases.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUnpublish = async (c) => {
    try { await unpublishExperienceConfig(c.id); load(); } catch (e) { setErr(e.message); }
  };
  const handleSaved = () => { setEditingId(null); load(); };

  return (
    <div data-testid="winner-showcase-studio">
      <div className="flex items-center gap-3 mb-5">
        <div className="grid h-10 w-10 place-items-center rounded-xl"
             style={{ background: "linear-gradient(150deg,#2D1F3E,#1A1420)", border: "1px solid rgba(212,168,67,0.25)" }}>
          <Trophy className="h-5 w-5 text-gold" />
        </div>
        <div className="flex-1">
          <h2 className="font-display text-xl text-parchment">Winner Showcase — Friday Speaking Lab</h2>
          <p className="text-[11.5px] text-faded">
            The backend auto-publishes one of these per settled classroom draw — nothing to create here.
            Unpublish forces one off the Dashboard early; editing only removes a name from what's displayed,
            never from the reward already granted.
          </p>
        </div>
        <button onClick={load} data-testid="winnershowcase-refresh"
                className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-walnut/70 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-parchment hover:border-gold hover:text-gold">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {err && (
        <div className="mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-[12px]"
             style={{ background: "rgba(255,100,100,0.12)", color: "#fca5a5" }} data-testid="winnershowcase-list-error">
          <AlertTriangle className="h-4 w-4" /> {err}
        </div>
      )}

      {loading ? (
        <p className="text-[12px] text-faded">Loading showcases…</p>
      ) : configs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gold/30 px-6 py-12 text-center"
             style={{ background: "rgba(34,24,48,0.4)" }} data-testid="winnershowcase-empty">
          <Trophy className="mx-auto h-8 w-8 text-gold/70" />
          <p className="mt-3 font-display text-[16px] text-parchment">No classroom Speaking Lab showcases yet</p>
          <p className="mt-1 text-[12px] text-faded">One appears here automatically the first time a teacher finalizes a Friday Speaking Lab Lucky Draw.</p>
        </div>
      ) : (
        <div className="space-y-2.5" data-testid="winnershowcase-list">
          {configs.map((c) => (
            <div key={c.id}>
              <ShowcaseRow c={c} onUnpublish={handleUnpublish} onEdit={(row) => setEditingId(row.id)} editing={editingId === c.id} />
              {editingId === c.id && (
                <WinnerEditor config={c} onSaved={handleSaved} onCancel={() => setEditingId(null)} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
