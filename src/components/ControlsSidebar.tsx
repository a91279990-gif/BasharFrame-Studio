import { RotateCcw, RotateCw } from 'lucide-react';
import {
  AspectRatioOption,
  BACKDROP_SWATCHES,
  BorderSettings,
  BUILTIN_PALETTES,
  DEFAULT_BORDER_SETTINGS,
} from '../utils/borderConfig';
import { Translations } from '../utils/i18n';

interface ControlsSidebarProps {
  settings: BorderSettings;
  onChange: (next: BorderSettings) => void;
  t: Translations;
}

const ASPECT_OPTIONS: { value: AspectRatioOption; label: string }[] = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
  { value: '4:5', label: '4:5' },
  { value: 'original', label: 'মূল' },
];

export function ControlsSidebar({ settings, onChange, t }: ControlsSidebarProps) {
  const updateField = <K extends keyof BorderSettings>(key: K, value: BorderSettings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  const handleColorStopChange = (index: number, hex: string) => {
    const nextColors = [...settings.colors];
    nextColors[index] = hex.toUpperCase();
    onChange({ ...settings, paletteId: 'custom', colors: nextColors });
  };

  return (
    <aside
      aria-label={t.inspectorTitle}
      className="border border-white/[0.08] bg-[#121216] rounded-2xl p-4 flex flex-col gap-4"
    >
      {/* Inspector Header */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/[0.08]">
        <h2 className="font-display text-sm font-semibold text-zinc-100">
          {t.inspectorTitle}
        </h2>
        <button
          type="button"
          onClick={() => onChange(DEFAULT_BORDER_SETTINGS)}
          className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
        >
          {t.resetDefaults}
        </button>
      </div>

      {/* Palette Presets */}
      <div className="space-y-2.5">
        <span className="block text-xs font-medium text-zinc-300">
          {t.paletteSection}
        </span>

        <div className="grid grid-cols-1 gap-1.5">
          {BUILTIN_PALETTES.map((palette) => {
            const active = settings.paletteId === palette.id;
            return (
              <button
                key={palette.id}
                type="button"
                onClick={() =>
                  onChange({
                    ...settings,
                    paletteId: palette.id,
                    colors: [...palette.colors],
                  })
                }
                className={`flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
                  active
                    ? 'border-white/30 bg-white/[0.08] text-white'
                    : 'border-white/[0.07] bg-[#0E0E13] text-zinc-300 hover:border-white/20 hover:text-white'
                }`}
              >
                <span className="text-xs font-medium">{palette.name}</span>
                <span
                  className="w-20 h-2.5 rounded-sm shrink-0"
                  style={{
                    background: `linear-gradient(90deg, ${palette.colors.join(', ')})`,
                  }}
                />
              </button>
            );
          })}
        </div>

        {/* Custom Color Pickers */}
        <div className="pt-0.5">
          <span className="block text-[11px] text-zinc-400 mb-1.5">
            {t.customStops}
          </span>
          <div className="flex items-center gap-2">
            {settings.colors.slice(0, 5).map((hex, idx) => (
              <label
                key={idx}
                className="flex-1 flex flex-col items-center gap-1 cursor-pointer"
              >
                <span className="sr-only">রঙ {idx + 1}</span>
                <input
                  type="color"
                  value={hex}
                  onChange={(e) => handleColorStopChange(idx, e.target.value)}
                  className="w-full h-6 rounded-md border border-white/15 bg-transparent cursor-pointer"
                />
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Border & Outer Glow Sliders */}
      <div className="space-y-2.5 pt-3 border-t border-white/[0.08]">
        <span className="block text-xs font-medium text-zinc-300">
          {t.borderGeometry}
        </span>

        <SliderRow
          id="slider-border-width"
          label={t.borderWidth}
          valueText={`${settings.borderWidth}px`}
          min={2}
          max={24}
          step={1}
          value={settings.borderWidth}
          onChange={(v) => updateField('borderWidth', v)}
        />

        <SliderRow
          id="slider-glow-spread"
          label={t.glowSpread}
          valueText={`${settings.glowSpread}px`}
          min={0}
          max={64}
          step={1}
          value={settings.glowSpread}
          onChange={(v) => updateField('glowSpread', v)}
        />

        <SliderRow
          id="slider-glow-intensity"
          label={t.glowIntensity}
          valueText={`${Math.round(settings.glowIntensity * 100)}%`}
          min={0.1}
          max={1}
          step={0.05}
          value={settings.glowIntensity}
          onChange={(v) => updateField('glowIntensity', v)}
        />

        <SliderRow
          id="slider-corner-radius"
          label={t.cornerRadius}
          valueText={`${settings.cornerRadius}px`}
          min={0}
          max={48}
          step={1}
          value={settings.cornerRadius}
          onChange={(v) => updateField('cornerRadius', v)}
        />

        <SliderRow
          id="slider-stage-margin"
          label={t.outerMargin}
          valueText={`${settings.stageMargin}px`}
          min={16}
          max={100}
          step={2}
          value={settings.stageMargin}
          onChange={(v) => updateField('stageMargin', v)}
        />
      </div>

      {/* Motion, Aspect Ratio & Backdrop */}
      <div className="space-y-4 pt-4 border-t border-white/[0.08]">
        <span className="block text-xs font-medium text-zinc-300">
          {t.motionSection}
        </span>

        <SliderRow
          id="slider-rotation-speed"
          label={t.rotationSpeed}
          valueText={`${settings.rotationSpeed.toFixed(1)}x`}
          min={0}
          max={4}
          step={0.1}
          value={settings.rotationSpeed}
          onChange={(v) => updateField('rotationSpeed', v)}
        />

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-zinc-300">{t.direction}</span>
          <div className="flex items-center gap-1 p-0.5 bg-[#0B0B0E] border border-white/10 rounded-lg">
            <button
              type="button"
              onClick={() => updateField('direction', 'cw')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                settings.direction === 'cw'
                  ? 'bg-white/15 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <RotateCw className="w-3 h-3" aria-hidden="true" />
              <span>{t.clockwise}</span>
            </button>
            <button
              type="button"
              onClick={() => updateField('direction', 'ccw')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                settings.direction === 'ccw'
                  ? 'bg-white/15 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              <span>{t.counterClockwise}</span>
            </button>
          </div>
        </div>

        {/* Aspect Ratio */}
        <div className="space-y-1.5">
          <span className="block text-xs text-zinc-300">{t.aspectRatio}</span>
          <div className="grid grid-cols-5 gap-1 p-1 bg-[#0B0B0E] border border-white/10 rounded-lg">
            {ASPECT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => updateField('aspectRatio', opt.value)}
                className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  settings.aspectRatio === opt.value
                    ? 'bg-white/15 text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Backdrop Color */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-zinc-300">{t.backdropColor}</span>
          <div className="flex items-center gap-2">
            {BACKDROP_SWATCHES.map((swatch) => (
              <button
                key={swatch.hex}
                type="button"
                aria-label={`${swatch.label} ব্যাকগ্রাউন্ড`}
                title={swatch.label}
                onClick={() => updateField('backdropColor', swatch.hex)}
                className={`w-6 h-6 rounded-md border transition-transform cursor-pointer ${
                  settings.backdropColor === swatch.hex
                    ? 'border-white scale-110'
                    : 'border-white/20 hover:border-white/50'
                }`}
                style={{ backgroundColor: swatch.hex }}
              />
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

interface SliderRowProps {
  id: string;
  label: string;
  valueText: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}

function SliderRow({ id, label, valueText, min, max, step, value, onChange }: SliderRowProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs gap-2">
        <label htmlFor={id} className="text-zinc-300">
          {label}
        </label>
        <span className="font-mono text-zinc-400">{valueText}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="studio-slider w-full"
      />
    </div>
  );
}
