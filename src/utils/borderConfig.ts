export type AspectRatioOption = 'original' | '16:9' | '9:16' | '1:1' | '4:5';
export type RotationDirection = 'cw' | 'ccw';

export interface PalettePreset {
  id: string;
  name: string;
  colors: string[];
}

export interface BorderSettings {
  paletteId: string;
  colors: string[];
  borderWidth: number;
  glowSpread: number;
  glowIntensity: number;
  cornerRadius: number;
  stageMargin: number;
  rotationSpeed: number;
  direction: RotationDirection;
  aspectRatio: AspectRatioOption;
  backdropColor: string;
}

export interface SavedBorderPreset extends BorderSettings {
  id: string;
  ownerId: string;
  name: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ExportRecordItem {
  id: string;
  ownerId: string;
  fileName: string;
  aspectRatio: AspectRatioOption;
  resolution: string;
  durationSec: number;
  fileSizeBytes: number;
  paletteName: string;
  format: 'webm' | 'mp4' | 'png';
  createdAt?: unknown;
}

export const BUILTIN_PALETTES: PalettePreset[] = [
  {
    id: 'gemini-prism',
    name: 'প্রিজম স্পেকট্রাম',
    colors: ['#2563EB', '#06B6D4', '#10B981', '#F59E0B', '#EA580C'],
  },
  {
    id: 'aurora-borealis',
    name: 'অরোরা ড্রিফট',
    colors: ['#0EA5E9', '#14B8A6', '#22C55E', '#6366F1'],
  },
  {
    id: 'solar-flare',
    name: 'সোলার অ্যাম্বার',
    colors: ['#F59E0B', '#F97316', '#EF4444', '#EC4899'],
  },
  {
    id: 'cobalt-pulse',
    name: 'কোবাল্ট ওয়েভ',
    colors: ['#1D4ED8', '#38BDF8', '#2DD4BF', '#818CF8'],
  },
  {
    id: 'titanium-edge',
    name: 'স্টুডিও সিলভার',
    colors: ['#F4F4F5', '#71717A', '#E4E4E7', '#3F3F46'],
  },
];

export const BACKDROP_SWATCHES: { label: string; hex: string }[] = [
  { label: 'অবসিডিয়ান', hex: '#0B0B0E' },
  { label: 'চারকোল', hex: '#141418' },
  { label: 'মিডনাইট', hex: '#0F172A' },
  { label: 'পিওর ব্ল্যাক', hex: '#000000' },
];

export const DEFAULT_BORDER_SETTINGS: BorderSettings = {
  paletteId: 'gemini-prism',
  colors: [...BUILTIN_PALETTES[0].colors],
  borderWidth: 3,
  glowSpread: 34,
  glowIntensity: 0.75,
  cornerRadius: 20,
  stageMargin: 56,
  rotationSpeed: 1.0,
  direction: 'cw',
  aspectRatio: '16:9',
  backdropColor: '#0B0B0E',
};

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function sanitizeHexColor(hex: string, fallback = '#2563EB'): string {
  if (typeof hex !== 'string') return fallback;
  const trimmed = hex.trim();
  return HEX_COLOR_RE.test(trimmed) ? trimmed.toUpperCase() : fallback;
}

export function clampSettings(input: Partial<BorderSettings>): BorderSettings {
  const rawColors = Array.isArray(input.colors) ? input.colors : DEFAULT_BORDER_SETTINGS.colors;
  const sanitizedColors = rawColors
    .slice(0, 6)
    .map((c, idx) => sanitizeHexColor(c, DEFAULT_BORDER_SETTINGS.colors[idx % DEFAULT_BORDER_SETTINGS.colors.length]));

  while (sanitizedColors.length < 2) {
    sanitizedColors.push(DEFAULT_BORDER_SETTINGS.colors[sanitizedColors.length]);
  }

  const paletteId =
    typeof input.paletteId === 'string' && SAFE_ID_RE.test(input.paletteId) && input.paletteId.length <= 40
      ? input.paletteId
      : 'custom';

  const aspectRatio: AspectRatioOption =
    input.aspectRatio === 'original' ||
    input.aspectRatio === '16:9' ||
    input.aspectRatio === '9:16' ||
    input.aspectRatio === '1:1' ||
    input.aspectRatio === '4:5'
      ? input.aspectRatio
      : '16:9';

  const direction: RotationDirection = input.direction === 'ccw' ? 'ccw' : 'cw';

  return {
    paletteId,
    colors: sanitizedColors,
    borderWidth: Math.round(clampNumber(input.borderWidth ?? DEFAULT_BORDER_SETTINGS.borderWidth, 2, 32)),
    glowSpread: Math.round(clampNumber(input.glowSpread ?? DEFAULT_BORDER_SETTINGS.glowSpread, 0, 80)),
    glowIntensity: Number(clampNumber(input.glowIntensity ?? DEFAULT_BORDER_SETTINGS.glowIntensity, 0.1, 1.0).toFixed(2)),
    cornerRadius: Math.round(clampNumber(input.cornerRadius ?? DEFAULT_BORDER_SETTINGS.cornerRadius, 0, 64)),
    stageMargin: Math.round(clampNumber(input.stageMargin ?? DEFAULT_BORDER_SETTINGS.stageMargin, 16, 120)),
    rotationSpeed: Number(clampNumber(input.rotationSpeed ?? DEFAULT_BORDER_SETTINGS.rotationSpeed, 0, 5).toFixed(2)),
    direction,
    aspectRatio,
    backdropColor: sanitizeHexColor(input.backdropColor ?? DEFAULT_BORDER_SETTINGS.backdropColor, '#0B0B0E'),
  };
}

export function validatePresetInput(
  rawName: string,
  settings: BorderSettings
): { valid: boolean; error?: string; name: string; settings: BorderSettings } {
  const trimmed = rawName.trim().slice(0, 64);
  if (trimmed.length < 1) {
    return {
      valid: false,
      error: 'Please enter a preset name (1-64 characters).',
      name: '',
      settings: clampSettings(settings),
    };
  }
  return {
    valid: true,
    name: trimmed,
    settings: clampSettings(settings),
  };
}

function makeEven(n: number): number {
  const rounded = Math.round(n);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

export function computeStageDimensions(
  aspectRatio: AspectRatioOption,
  videoWidth: number,
  videoHeight: number,
  targetLongSide = 1280
): { width: number; height: number } {
  const safeW = videoWidth > 0 ? videoWidth : 1280;
  const safeH = videoHeight > 0 ? videoHeight : 720;

  let ratio = 16 / 9;
  if (aspectRatio === 'original') {
    ratio = safeW / safeH;
  } else if (aspectRatio === '16:9') {
    ratio = 16 / 9;
  } else if (aspectRatio === '9:16') {
    ratio = 9 / 16;
  } else if (aspectRatio === '1:1') {
    ratio = 1;
  } else if (aspectRatio === '4:5') {
    ratio = 4 / 5;
  }

  if (ratio >= 1) {
    const width = makeEven(targetLongSide);
    const height = makeEven(Math.max(240, targetLongSide / ratio));
    return { width, height };
  } else {
    const height = makeEven(targetLongSide);
    const width = makeEven(Math.max(240, targetLongSide * ratio));
    return { width, height };
  }
}

export interface FrameGeometry {
  frameX: number;
  frameY: number;
  frameW: number;
  frameH: number;
  innerRadius: number;
  outerRadius: number;
  borderWidth: number;
  glowSpread: number;
  drawX: number;
  drawY: number;
  drawW: number;
  drawH: number;
}

/**
 * Computes exact pixel geometry so that the glowing colored ring sits strictly
 * OUTSIDE the video frame, never overlapping the video content.
 */
export function computeFrameGeometry(
  stageW: number,
  stageH: number,
  videoW: number,
  videoH: number,
  settings: BorderSettings,
  referenceWidth = 960
): FrameGeometry {
  const scale = stageW / referenceWidth;
  const margin = clampNumber(settings.stageMargin * scale, 12, Math.min(stageW, stageH) * 0.28);
  const borderWidth = clampNumber(settings.borderWidth * scale, 1.5, 48);
  const glowSpread = clampNumber(settings.glowSpread * scale, 0, 120);

  const availW = Math.max(64, stageW - margin * 2 - borderWidth * 2);
  const availH = Math.max(64, stageH - margin * 2 - borderWidth * 2);

  const safeVidW = videoW > 0 ? videoW : 16;
  const safeVidH = videoH > 0 ? videoH : 9;
  const vidAspect = safeVidW / safeVidH;
  const availAspect = availW / availH;

  let frameW: number;
  let frameH: number;
  if (vidAspect > availAspect) {
    frameW = availW;
    frameH = availW / vidAspect;
  } else {
    frameH = availH;
    frameW = availH * vidAspect;
  }

  const frameX = (stageW - frameW) / 2;
  const frameY = (stageH - frameH) / 2;

  const maxRadius = Math.min(frameW, frameH) / 2;
  const innerRadius = clampNumber(settings.cornerRadius * scale, 0, maxRadius);
  const outerRadius = innerRadius + borderWidth;

  // Video fills the inner frame exactly (aspect-matched above)
  const drawX = frameX;
  const drawY = frameY;
  const drawW = frameW;
  const drawH = frameH;

  return {
    frameX,
    frameY,
    frameW,
    frameH,
    innerRadius,
    outerRadius,
    borderWidth,
    glowSpread,
    drawX,
    drawY,
    drawW,
    drawH,
  };
}

export function computeRotationAngleRad(
  elapsedSeconds: number,
  rotationSpeed: number,
  direction: RotationDirection
): number {
  const dir = direction === 'ccw' ? -1 : 1;
  // Base cycle: 1 revolution every 4.5 seconds at speed 1.0
  const angularVelocity = (Math.PI * 2) / 4.5;
  return elapsedSeconds * rotationSpeed * angularVelocity * dir;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
