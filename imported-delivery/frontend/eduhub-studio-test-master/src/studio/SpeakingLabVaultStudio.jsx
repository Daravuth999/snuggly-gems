/**
 * SpeakingLabVaultStudio.jsx — Author Studio panel for the Speaking Lab
 * Friday Vault (Phase 1 additive experience layer, see
 * eduhub-backend/speaking_lab_vault.py).
 *
 * Single source of truth: the EduHub backend's one config document
 * (GET/PUT /api/admin/speaking-lab/vault-config). No localStorage, no
 * client-side defaults that silently diverge from what the backend
 * actually enforces — every number shown here is echoed back
 * ALREADY-CLAMPED by the backend after every save, so what an admin sees
 * is always exactly what will happen, never a hopeful guess.
 *
 * Deliberately plain-language throughout: no database IDs, no internal
 * rule-type strings, no session/transaction identifiers. Each mechanic's
 * own numeric knobs are shown inline, in its own card, with a one-line
 * plain-English explanation of what it actually does.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Lock,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  Info,
} from "lucide-react";
import { getSpeakingLabVaultConfig, updateSpeakingLabVaultConfig } from "./api";

const MECHANIC_COPY = {
  box_boost: {
    title: "Mystery Box Boost",
    blurb: "The student's next Mystery Box leans toward a rarer prize.",
  },
  double_ticket: {
    title: "Double Ticket",
    blurb: "Guarantees underdog odds in this week's Lucky Draw — even if the student was already called on to speak.",
  },
  multiplier: {
    title: "Multiplier",
    blurb: "If the student wins the Lucky Draw, their prize is boosted by a set percentage.",
  },
  team_vault: {
    title: "Team Vault",
    blurb: "Sparks add to a shared class total. Once enough students unlock one, the WHOLE CLASS gets a bonus.",
  },
  risk_reward: {
    title: "Risk & Reward",
    blurb: "A coin-flip moment — the student either doubles their spark or gets nothing this time.",
  },
  lucky_protection: {
    title: "Lucky Protection",
    blurb: "No gamble — always grants the strongest spark in the configured range.",
  },
};

const ROTATION_OPTIONS = [
  { value: "auto", label: "Auto — rotates weekly, never the same mechanic twice in a row" },
  { value: "manual", label: "Manual — I'll pick this week's surprise myself" },
];

function Card({ children, className = "" }) {
  return (
    <div
      className={`rounded-2xl border border-gold/20 p-5 ${className}`}
      style={{ background: "rgba(20,14,32,0.65)" }}
    >
      {children}
    </div>
  );
}

function FieldLabel({ children, hint }) {
  return (
    <label className="text-[11px] uppercase tracking-wider text-faded flex items-center gap-1.5 mb-1">
      {children}
      {hint && (
        <span title={hint}>
          <Info className="h-3 w-3 text-faded/70" />
        </span>
      )}
    </label>
  );
}

function NumberInput({ value, onChange, min, max, suffix }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={value ?? ""}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24 rounded-lg border border-gold/25 bg-walnut/60 px-3 py-2 text-[13px] text-parchment focus:outline-none focus:border-gold"
      />
      {suffix && <span className="text-[11px] text-faded">{suffix}</span>}
    </div>
  );
}

function Toggle({ value, onChange, label, testid, disabled = false }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!value)}
      data-testid={testid}
      disabled={disabled}
      className={`inline-flex items-center gap-2 text-[13px] font-semibold ${
        disabled ? "text-parchment/30 cursor-not-allowed" : "text-parchment hover:text-gold"
      }`}
    >
      {value ? (
        <ToggleRight className="h-6 w-6 text-emerald-400" />
      ) : (
        <ToggleLeft className="h-6 w-6 text-parchment/40" />
      )}
      {label}
    </button>
  );
}

function ErrorBanner({ error, onDismiss }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      data-testid="vault-error"
      className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-[12px] text-red-200"
    >
      <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
      <div className="flex-1">{String(error.message || error)}</div>
      <button onClick={onDismiss} className="text-red-200/70 hover:text-red-100">
        ✕
      </button>
    </div>
  );
}

export default function SpeakingLabVaultStudio() {
  const [config, setConfig] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedAt, setSavedAt] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSpeakingLabVaultConfig();
      setConfig(data);
      setDraft(data);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const data = await updateSpeakingLabVaultConfig(draft);
      setConfig(data);
      setDraft(data);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }, [draft]);

  const toggleMechanic = (type) => {
    setDraft((d) => {
      const enabled = new Set(d.enabled_types || []);
      if (enabled.has(type)) enabled.delete(type);
      else enabled.add(type);
      return { ...d, enabled_types: Array.from(enabled) };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-3 text-faded">
        <RefreshCw className="h-5 w-5 animate-spin" />
        Loading Friday Vault settings…
      </div>
    );
  }

  if (!draft) {
    return <ErrorBanner error={error || new Error("Could not load Friday Vault settings")} onDismiss={() => {}} />;
  }

  const currentMechanic = MECHANIC_COPY[draft.this_week_rule_type];

  return (
    <div className="max-w-3xl" data-testid="speaking-lab-vault-studio">
      <div className="flex items-center gap-3 mb-1">
        <div
          className="h-10 w-10 rounded-2xl flex items-center justify-center"
          style={{ background: "linear-gradient(135deg,#FFE19A,#D4A843)" }}
        >
          <Lock className="h-5 w-5 text-[#1a1420]" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-parchment">Friday Vault</h2>
          <p className="text-[12px] text-faded">
            The surprise moment between a student's accepted answer and their Mystery Box.
          </p>
        </div>
      </div>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <Card className="mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Toggle
            value={!!draft.enabled}
            onChange={(v) => setDraft((d) => ({ ...d, enabled: v }))}
            label="Enabled"
            testid="vault-enabled-toggle"
          />
          {!draft.env_flag_set && (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/25 rounded-full px-3 py-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Also needs a one-time setup step from engineering before this goes live on this
              environment.
            </div>
          )}
          {draft.env_flag_set && draft.enabled && (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-3 py-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Live for students now
            </div>
          )}
        </div>
      </Card>

      <Card className="mb-4">
        <FieldLabel hint="Which mechanic is active this Friday — a surprise to students, always visible to you here.">
          This Week's Surprise
        </FieldLabel>
        <div className="mt-2 flex items-center gap-2 text-[13px] text-parchment">
          <Sparkles className="h-4 w-4 text-gold" />
          {currentMechanic ? currentMechanic.title : "—"}
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ROTATION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              data-testid={`vault-rotation-${opt.value}`}
              onClick={() => setDraft((d) => ({ ...d, rotation_mode: opt.value }))}
              className="text-left rounded-xl border px-3 py-2.5 text-[12px]"
              style={{
                borderColor: draft.rotation_mode === opt.value ? "rgba(212,168,67,0.7)" : "rgba(212,168,67,0.2)",
                background: draft.rotation_mode === opt.value ? "rgba(212,168,67,0.12)" : "transparent",
                color: draft.rotation_mode === opt.value ? "#F4E5C1" : "#B8A98A",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {draft.rotation_mode === "manual" && (
          <div className="mt-4">
            <FieldLabel>Pick this week's mechanic</FieldLabel>
            <select
              value={draft.manual_rule_type || ""}
              onChange={(e) => setDraft((d) => ({ ...d, manual_rule_type: e.target.value || null }))}
              data-testid="vault-manual-rule-select"
              className="w-full rounded-lg border border-gold/25 bg-walnut/60 px-3 py-2 text-[13px] text-parchment focus:outline-none focus:border-gold"
            >
              <option value="">— choose one —</option>
              {Object.entries(MECHANIC_COPY).map(([type, copy]) => (
                <option key={type} value={type}>{copy.title}</option>
              ))}
            </select>
          </div>
        )}
      </Card>

      <div className="mb-2 text-[11px] uppercase tracking-wider text-faded">
        Mechanics in rotation
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        {Object.entries(MECHANIC_COPY).map(([type, copy]) => {
          const isEnabled = (draft.enabled_types || []).includes(type);
          return (
            <Card key={type}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[13px] font-bold text-parchment">{copy.title}</div>
                  <p className="text-[11px] text-faded mt-1 leading-relaxed">{copy.blurb}</p>
                </div>
                <Toggle
                  value={isEnabled}
                  onChange={() => toggleMechanic(type)}
                  label=""
                  testid={`vault-mechanic-toggle-${type}`}
                />
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="mb-4">
        <div className="text-[13px] font-bold text-parchment mb-3">Reward amounts</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <FieldLabel hint="The smallest spark a student can earn.">Minimum spark</FieldLabel>
            <NumberInput
              value={draft.base_min}
              min={1} max={30}
              onChange={(v) => setDraft((d) => ({ ...d, base_min: v }))}
              suffix="pts"
            />
          </div>
          <div>
            <FieldLabel hint="The largest spark a student can earn.">Maximum spark</FieldLabel>
            <NumberInput
              value={draft.base_max}
              min={1} max={30}
              onChange={(v) => setDraft((d) => ({ ...d, base_max: v }))}
              suffix="pts"
            />
          </div>
          <div>
            <FieldLabel hint="Multiplier week's bonus on top of a Lucky Draw win. Capped automatically — this can never be set unbounded.">
              Multiplier
            </FieldLabel>
            <NumberInput
              value={draft.multiplier}
              min={1} max={3}
              onChange={(v) => setDraft((d) => ({ ...d, multiplier: v }))}
              suffix="×"
            />
          </div>
          <div>
            <FieldLabel hint="Risk & Reward's odds of doubling instead of losing the spark.">
              Risk win chance
            </FieldLabel>
            <NumberInput
              value={Math.round((draft.risk_win_probability ?? 0.5) * 100)}
              min={0} max={100}
              onChange={(v) => setDraft((d) => ({ ...d, risk_win_probability: v / 100 }))}
              suffix="%"
            />
          </div>
        </div>
      </Card>

      <Card className="mb-6">
        <div className="text-[13px] font-bold text-parchment mb-3">Team Vault</div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel hint="How many students need to unlock a Team Vault spark before the whole class gets a bonus.">
              Sparks needed
            </FieldLabel>
            <NumberInput
              value={draft.team_vault_threshold}
              min={1} max={20}
              onChange={(v) => setDraft((d) => ({ ...d, team_vault_threshold: v }))}
            />
          </div>
          <div>
            <FieldLabel hint="How many points EVERY currently-ticketed student receives once the class total is reached.">
              Bonus per student
            </FieldLabel>
            <NumberInput
              value={draft.team_vault_bonus}
              min={1} max={20}
              onChange={(v) => setDraft((d) => ({ ...d, team_vault_bonus: v }))}
              suffix="pts"
            />
          </div>
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          data-testid="vault-save"
          className="rounded-full px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider disabled:opacity-50"
          style={{ background: "linear-gradient(135deg,#FFE19A,#D4A843)", color: "#1a1420" }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={refresh}
          className="rounded-full px-4 py-2.5 text-[12px] font-semibold text-faded hover:text-parchment"
        >
          Discard changes
        </button>
        {savedAt && Date.now() - savedAt < 4000 && (
          <span className="text-[11px] text-emerald-300 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}
