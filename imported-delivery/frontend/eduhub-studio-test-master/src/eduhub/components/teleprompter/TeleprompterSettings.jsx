/**
 * TeleprompterSettings.jsx — the shared teleprompter configuration surface.
 * Author Studio saves these settings onto the lesson (teleprompterConfig);
 * the student player layers local reading-preference overrides on top.
 * One component, two hosts — so the author always configures exactly what
 * students experience.
 */
import { useState } from "react";
import { ChevronDown, Focus, Languages, Mic2, SlidersHorizontal } from "lucide-react";
import { DEFAULT_TELEPROMPTER_CONFIG } from "./teleprompterConfig";

const GOLD = "#D4A843";

function Toggle({ label, value, onChange, testId }) {
  return (
    <button onClick={() => onChange(!value)} data-testid={testId}
            className="flex items-center justify-between w-full py-1.5 group">
      <span className="text-[12px] text-white/70 group-hover:text-white/90">{label}</span>
      <span className="relative w-8 h-[18px] rounded-full transition-colors"
            style={{ background: value ? GOLD : "rgba(255,255,255,0.15)" }}>
        <span className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-[left]"
              style={{ left: value ? 16 : 2 }} />
      </span>
    </button>
  );
}

const PRESETS = [
  {
    key: "shadow", label: "Shadow", hint: "Follow every spoken word", Icon: Mic2,
    values: { karaoke: true, wordHighlight: true, sentenceHighlight: true, paragraphHighlight: false, centered: true, centerFocus: true, showTranslation: false, autoScroll: true },
  },
  {
    key: "understand", label: "Understand", hint: "Read English and Khmer", Icon: Languages,
    values: { karaoke: true, wordHighlight: true, sentenceHighlight: true, paragraphHighlight: false, centered: true, centerFocus: true, showTranslation: true, autoScroll: true },
  },
  {
    key: "challenge", label: "Challenge", hint: "Practice with fewer clues", Icon: Focus,
    values: { karaoke: false, wordHighlight: false, sentenceHighlight: true, paragraphHighlight: false, centered: true, centerFocus: true, showTranslation: false, autoScroll: true },
  },
];

function Preset({ preset, config, onChange }) {
  const selected = Object.entries(preset.values).every(([key, value]) => config[key] === value);
  const Icon = preset.Icon;
  return (
    <button type="button" onClick={() => onChange({ ...config, ...preset.values })}
            aria-pressed={selected} data-testid={`tp-preset-${preset.key}`}
            className={`tp-preset ${selected ? "tp-preset-active" : ""}`}>
      <Icon size={16} aria-hidden="true" />
      <span><b>{preset.label}</b><small>{preset.hint}</small></span>
    </button>
  );
}

function Slider({ label, value, min, max, step, onChange, format, testId }) {
  return (
    <label className="block py-1.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] text-white/70">{label}</span>
        <span className="text-[11px] tabular-nums" style={{ color: GOLD }}>{format ? format(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
             data-testid={testId}
             onChange={(e) => onChange(Number(e.target.value))}
             className="w-full accent-[#D4A843] h-1" />
    </label>
  );
}

function Segmented({ label, value, options, onChange, testId }) {
  return (
    <div className="py-1.5">
      <div className="text-[12px] text-white/70 mb-1.5">{label}</div>
      <div className="flex gap-1 rounded-lg bg-white/5 p-0.5" data-testid={testId}>
        {options.map((o) => (
          <button key={o.value} onClick={() => onChange(o.value)}
                  className="flex-1 text-[11px] font-semibold px-2 py-1 rounded-md transition-colors"
                  style={value === o.value
                    ? { background: "rgba(212,168,67,0.18)", color: GOLD }
                    : { color: "rgba(255,255,255,0.5)" }}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function TeleprompterSettings({ config, onChange, showModeControls = true, onReset }) {
  const set = (key) => (val) => onChange({ ...config, [key]: val });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  return (
    <div className="tp-settings space-y-4" data-testid="teleprompter-settings">
      <section>
        <div className="tp-settings-label">Practice style</div>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((preset) => <Preset key={preset.key} preset={preset} config={config} onChange={onChange} />)}
        </div>
      </section>

      <section className="tp-settings-group">
        <div className="tp-settings-label">Reading comfort</div>
        <Toggle label="Cinematic focus" value={config.centerFocus} onChange={set("centerFocus")} testId="tp-setting-center-focus" />
        <Slider label="Text size" value={config.fontScale} min={0.8} max={1.6} step={0.05}
                format={(v) => `${Math.round(v * 100)}%`} onChange={set("fontScale")} testId="tp-setting-fontscale" />
        <Slider label="Line spacing" value={config.lineSpacing} min={1.4} max={2.6} step={0.1}
                format={(v) => v.toFixed(1)} onChange={set("lineSpacing")} testId="tp-setting-linespacing" />
        <Toggle label="Follow playback" value={config.autoScroll} onChange={set("autoScroll")} testId="tp-setting-autoscroll" />
      </section>

      <button type="button" onClick={() => setAdvancedOpen((open) => !open)}
              aria-expanded={advancedOpen} className="tp-settings-disclosure">
        <span><SlidersHorizontal size={14} /> Custom controls</span>
        <ChevronDown size={15} className={advancedOpen ? "rotate-180" : ""} />
      </button>

      {advancedOpen && (
        <section className="tp-settings-group tp-settings-advanced" data-testid="tp-settings-advanced">
          {showModeControls && (
            <Segmented label="Layout" value={config.mode} onChange={set("mode")}
                       testId="tp-setting-mode"
                       options={[
                         { value: "auto", label: "Auto" },
                         { value: "conversation", label: "Dialogue" },
                         { value: "storytelling", label: "Script" },
                       ]} />
          )}
          <Toggle label="Word highlight" value={config.wordHighlight} onChange={set("wordHighlight")} testId="tp-setting-word" />
          <Toggle label="Sentence highlight" value={config.sentenceHighlight} onChange={set("sentenceHighlight")} testId="tp-setting-sentence" />
          <Toggle label="Paragraph highlight" value={config.paragraphHighlight} onChange={set("paragraphHighlight")} testId="tp-setting-paragraph" />
          <Toggle label="Karaoke glow" value={config.karaoke} onChange={set("karaoke")} testId="tp-setting-karaoke" />
          <Toggle label="Centered text" value={config.centered} onChange={set("centered")} testId="tp-setting-centered" />
          <Toggle label="Timing confidence" value={config.showConfidence} onChange={set("showConfidence")} testId="tp-setting-confidence" />
          <Segmented label="Typeface" value={config.fontFamily} onChange={set("fontFamily")}
                     testId="tp-setting-fontfamily"
                     options={[
                       { value: "default", label: "Sans" },
                       { value: "serif", label: "Serif" },
                       { value: "mono", label: "Mono" },
                     ]} />
          {config.autoScroll && (
            <Slider label="Focus position" value={config.scrollSpeed} min={0.5} max={2} step={0.1}
                    format={(v) => (v < 0.9 ? "Low" : v > 1.2 ? "Leading" : "Center")}
                    onChange={set("scrollSpeed")} testId="tp-setting-scrollspeed" />
          )}
        </section>
      )}
      {onReset && (
        <button onClick={() => onReset({ ...DEFAULT_TELEPROMPTER_CONFIG })}
                data-testid="tp-setting-reset"
                className="tp-settings-reset">
          Reset to defaults
        </button>
      )}
    </div>
  );
}
