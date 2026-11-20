import {
  BorderSettings,
  computeFrameGeometry,
  computeRotationAngleRad,
} from './borderConfig';

function traceRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function createSeamlessConicGradient(
  ctx: CanvasRenderingContext2D,
  angleRad: number,
  cx: number,
  cy: number,
  colors: string[]
): CanvasGradient {
  const grad = ctx.createConicGradient(angleRad, cx, cy);
  const safeColors = colors.length >= 2 ? colors : ['#2563EB', '#06B6D4', '#10B981', '#F59E0B'];
  const loopColors = [...safeColors, safeColors[0]];
  const step = 1 / (loopColors.length - 1);
  loopColors.forEach((hex, idx) => {
    grad.addColorStop(Math.min(1, idx * step), hex);
  });
  return grad;
}

// Reusable multi-scale offscreen canvases for silky outer bloom without software blur filter stalls
let cachedGlowCanvas: HTMLCanvasElement | null = null;
let cachedBloomCanvas: HTMLCanvasElement | null = null;

function getGlowCanvases(
  w: number,
  h: number
): { glowCanvas: HTMLCanvasElement; bloomCanvas: HTMLCanvasElement } | null {
  if (typeof document === 'undefined') return null;
  if (!cachedGlowCanvas) cachedGlowCanvas = document.createElement('canvas');
  if (!cachedBloomCanvas) cachedBloomCanvas = document.createElement('canvas');

  const gw = Math.max(48, Math.round(w / 6));
  const gh = Math.max(48, Math.round(h / 6));
  if (cachedGlowCanvas.width !== gw || cachedGlowCanvas.height !== gh) {
    cachedGlowCanvas.width = gw;
    cachedGlowCanvas.height = gh;
  }

  const bw = Math.max(24, Math.round(w / 18));
  const bh = Math.max(24, Math.round(h / 18));
  if (cachedBloomCanvas.width !== bw || cachedBloomCanvas.height !== bh) {
    cachedBloomCanvas.width = bw;
    cachedBloomCanvas.height = bh;
  }

  return { glowCanvas: cachedGlowCanvas, bloomCanvas: cachedBloomCanvas };
}

export interface RenderStageOptions {
  ctx: CanvasRenderingContext2D;
  stageWidth: number;
  stageHeight: number;
  source: HTMLVideoElement | HTMLCanvasElement | null;
  sourceWidth: number;
  sourceHeight: number;
  settings: BorderSettings;
  elapsedSeconds: number;
  referenceWidth?: number;
}

/**
 * Renders the outer backdrop, silky multi-scale bilinear outer chroma glow, crisp
 * outer gradient ring, and rounded inner video frame onto a 2D canvas.
 * The glowing color ring sits strictly OUTSIDE the video frame.
 */
export function renderChromaStage({
  ctx,
  stageWidth,
  stageHeight,
  source,
  sourceWidth,
  sourceHeight,
  settings,
  elapsedSeconds,
  referenceWidth = 960,
}: RenderStageOptions): void {
  ctx.save();
  ctx.fillStyle = settings.backdropColor;
  ctx.fillRect(0, 0, stageWidth, stageHeight);

  const geom = computeFrameGeometry(
    stageWidth,
    stageHeight,
    sourceWidth,
    sourceHeight,
    settings,
    referenceWidth
  );

  const cx = stageWidth / 2;
  const cy = stageHeight / 2;
  const angleRad = computeRotationAngleRad(
    elapsedSeconds,
    settings.rotationSpeed,
    settings.direction
  );

  const conicGrad = createSeamlessConicGradient(ctx, angleRad, cx, cy, settings.colors);

  const halfRing = geom.borderWidth / 2;
  const ringX = geom.frameX - halfRing;
  const ringY = geom.frameY - halfRing;
  const ringW = geom.frameW + geom.borderWidth;
  const ringH = geom.frameH + geom.borderWidth;
  const ringRadius = geom.innerRadius + halfRing;

  // 2. Silky multi-scale bilinear outer bloom (zero banding, zero software blur stall)
  if (geom.glowSpread > 0 && settings.glowIntensity > 0) {
    const canvases = getGlowCanvases(stageWidth, stageHeight);
    const gCtx = canvases?.glowCanvas.getContext('2d');
    const bCtx = canvases?.bloomCanvas.getContext('2d');
    if (canvases && gCtx && bCtx) {
      const { glowCanvas, bloomCanvas } = canvases;
      const s = glowCanvas.width / stageWidth;
      const spreadFactor = Math.min(1.5, Math.max(0.4, geom.glowSpread / 34));

      gCtx.clearRect(0, 0, glowCanvas.width, glowCanvas.height);

      const gConic = createSeamlessConicGradient(
        gCtx,
        angleRad,
        glowCanvas.width / 2,
        glowCanvas.height / 2,
        settings.colors
      );

      // Draw soft corona onto 1/6-scale canvas
      gCtx.save();
      gCtx.globalAlpha = Math.min(0.95, settings.glowIntensity * 0.78);
      gCtx.strokeStyle = gConic;
      gCtx.lineWidth = Math.max(geom.borderWidth * 2.8 * spreadFactor * s, 2.5);
      traceRoundedRect(
        gCtx,
        (ringX - 2) * s,
        (ringY - 2) * s,
        (ringW + 4) * s,
        (ringH + 4) * s,
        (ringRadius + 2) * s
      );
      gCtx.stroke();
      gCtx.restore();

      // Downsample onto 1/18-scale canvas for wide diffused mist halo
      bCtx.clearRect(0, 0, bloomCanvas.width, bloomCanvas.height);
      bCtx.imageSmoothingEnabled = true;
      bCtx.imageSmoothingQuality = 'high';
      bCtx.drawImage(glowCanvas, 0, 0, bloomCanvas.width, bloomCanvas.height);

      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = Math.min(0.9, settings.glowIntensity * 0.85);
      ctx.drawImage(bloomCanvas, 0, 0, stageWidth, stageHeight);
      ctx.globalAlpha = Math.min(0.75, settings.glowIntensity * 0.65);
      ctx.drawImage(glowCanvas, 0, 0, stageWidth, stageHeight);
      ctx.restore();
    }
  }

  // 3. Crisp luminous rotating outer border ring
  ctx.save();
  ctx.strokeStyle = conicGrad;
  ctx.lineWidth = geom.borderWidth;
  ctx.globalAlpha = 0.96;
  traceRoundedRect(ctx, ringX, ringY, ringW, ringH, ringRadius);
  ctx.stroke();
  ctx.restore();

  // 4. Inner rounded video frame — opaque dark fill first so outer glow never bleeds inside
  ctx.save();
  traceRoundedRect(ctx, geom.frameX, geom.frameY, geom.frameW, geom.frameH, geom.innerRadius);
  ctx.clip();

  ctx.fillStyle = '#09090B';
  ctx.fillRect(geom.frameX, geom.frameY, geom.frameW, geom.frameH);

  if (source) {
    try {
      ctx.drawImage(source, geom.drawX, geom.drawY, geom.drawW, geom.drawH);
    } catch {
      // Ignore transient frame decode errors while seeking
    }
  }

  ctx.restore();

  // 5. Subtle 1px inner bezel hairline for crisp separation
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = Math.max(1, stageWidth / 960);
  traceRoundedRect(ctx, geom.frameX, geom.frameY, geom.frameW, geom.frameH, geom.innerRadius);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}
