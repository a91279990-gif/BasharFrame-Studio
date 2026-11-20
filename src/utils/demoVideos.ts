export interface DemoClipMeta {
  id: string;
  title: string;
  subtitle: string;
  width: number;
  height: number;
  loopDurationSec: number;
}

export const DEMO_CLIPS: DemoClipMeta[] = [
  {
    id: 'studio-monolith',
    title: 'স্টুডিও প্রোডাক্ট শোকেস',
    subtitle: '১৬:৯ ম্যাট সিনেমা লুপ',
    width: 1280,
    height: 720,
    loopDurationSec: 8,
  },
  {
    id: 'twilight-horizon',
    title: 'সন্ধ্যার দিগন্ত তরঙ্গ',
    subtitle: '১৬:৯ অ্যাটমসফেরিক মোশন',
    width: 1280,
    height: 720,
    loopDurationSec: 8,
  },
  {
    id: 'harmonic-ribbon',
    title: 'হারমোনিক সিগন্যাল ওয়েভ',
    subtitle: '১৬:৯ প্রিসিশন অসিলোস্কোপ',
    width: 1280,
    height: 720,
    loopDurationSec: 8,
  },
];

/**
 * Draws a crisp, smooth 60fps studio demo video frame onto a target canvas
 * so users immediately experience real moving video inside the rotating outer border
 * and can export a full downloadable video without needing to upload a file first.
 */
export function drawDemoClipFrame(
  ctx: CanvasRenderingContext2D,
  clipId: string,
  width: number,
  height: number,
  tSec: number
): void {
  ctx.save();

  if (clipId === 'twilight-horizon') {
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#090D16');
    bg.addColorStop(0.55, '#131C2E');
    bg.addColorStop(1, '#1E1B24');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Subtle drifting horizon glow
    const sunX = width * 0.5 + Math.sin(tSec * 0.4) * width * 0.08;
    const sunY = height * 0.44;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, width * 0.34);
    sunGrad.addColorStop(0, 'rgba(245, 158, 11, 0.32)');
    sunGrad.addColorStop(0.45, 'rgba(56, 189, 248, 0.14)');
    sunGrad.addColorStop(1, 'rgba(9, 13, 22, 0)');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, width, height);

    // Layered smooth parallax ridge waves
    const layers = [
      { yBase: 0.56, amp: 24, freq: 0.004, speed: 0.6, color: '#162033' },
      { yBase: 0.68, amp: 32, freq: 0.0055, speed: 1.0, color: '#101827' },
      { yBase: 0.81, amp: 20, freq: 0.007, speed: 1.45, color: '#0A0F1A' },
    ];
    for (const layer of layers) {
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x <= width; x += 16) {
        const y =
          height * layer.yBase +
          Math.sin(x * layer.freq + tSec * layer.speed) * layer.amp +
          Math.cos(x * layer.freq * 0.5 - tSec * layer.speed * 0.7) * (layer.amp * 0.45);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fillStyle = layer.color;
      ctx.fill();
    }

    // Minimal editorial caption inside frame
    ctx.fillStyle = 'rgba(244, 244, 245, 0.78)';
    ctx.font = '600 20px "Hind Siliguri", system-ui, sans-serif';
    ctx.fillText('সন্ধ্যার দিগন্ত তরঙ্গ', width * 0.06, height * 0.14);
    ctx.fillStyle = 'rgba(161, 161, 170, 0.72)';
    ctx.font = '400 14px "JetBrains Mono", "Hind Siliguri", monospace';
    ctx.fillText(`ফ্রেম ${(tSec * 24).toFixed(0).padStart(4, '0')}`, width * 0.06, height * 0.19);
  } else if (clipId === 'harmonic-ribbon') {
    ctx.fillStyle = '#0D0E12';
    ctx.fillRect(0, 0, width, height);

    // Subtle studio grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    const step = 64;
    for (let x = step; x < width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = step; y < height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const ribbons = [
      { color: 'rgba(56, 189, 248, 0.75)', phase: 0, amp: 70 },
      { color: 'rgba(16, 185, 129, 0.65)', phase: 1.4, amp: 52 },
      { color: 'rgba(245, 158, 11, 0.55)', phase: 2.8, amp: 38 },
    ];
    for (const r of ribbons) {
      ctx.beginPath();
      for (let x = 0; x <= width; x += 8) {
        const norm = x / width;
        const envelope = Math.sin(norm * Math.PI);
        const y =
          height * 0.52 +
          Math.sin(norm * 10 - tSec * 2.6 + r.phase) * r.amp * envelope +
          Math.cos(norm * 4 + tSec * 1.3) * 18 * envelope;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(244, 244, 245, 0.78)';
    ctx.font = '600 20px "Hind Siliguri", system-ui, sans-serif';
    ctx.fillText('হারমোনিক সিগন্যাল ওয়েভ', width * 0.06, height * 0.14);
    ctx.fillStyle = 'rgba(161, 161, 170, 0.72)';
    ctx.font = '400 14px "JetBrains Mono", "Hind Siliguri", monospace';
    ctx.fillText(`সময় ${(tSec % 8).toFixed(2)} সে.`, width * 0.06, height * 0.19);
  } else {
    // studio-monolith: Sleek dark matte studio stage with sweeping specular key light
    const bg = ctx.createRadialGradient(
      width * 0.5 + Math.cos(tSec * 0.6) * 120,
      height * 0.42,
      40,
      width * 0.5,
      height * 0.5,
      width * 0.7
    );
    bg.addColorStop(0, '#1D212B');
    bg.addColorStop(0.55, '#121318');
    bg.addColorStop(1, '#09090C');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Floating matte dark card / device silhouette with moving light reflection
    const cardW = width * 0.48;
    const cardH = height * 0.46;
    const floatY = Math.sin(tSec * 1.3) * 10;
    const cardX = (width - cardW) / 2;
    const cardY = (height - cardH) / 2 + floatY;

    // Soft drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    ctx.roundRect(cardX + 8, cardY + 26, cardW, cardH, 24);
    ctx.fill();

    // Card surface with diagonal light sweep
    const sweepPos = ((tSec * 0.35) % 1.4) - 0.2;
    const cardGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
    cardGrad.addColorStop(0, '#1B1D24');
    cardGrad.addColorStop(Math.max(0.05, Math.min(0.95, sweepPos)), '#2B303D');
    cardGrad.addColorStop(1, '#14151A');
    ctx.fillStyle = cardGrad;
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 24);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const s = width / 1280;
    // Minimal waveform bar inside card
    const barCount = 24;
    const barSpacing = (cardW * 0.64) / barCount;
    const startX = cardX + cardW * 0.18;
    const baseY = cardY + cardH * 0.68;
    for (let i = 0; i < barCount; i++) {
      const h = (10 + Math.abs(Math.sin(tSec * 2.8 + i * 0.45)) * 42) * s;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(56, 189, 248, 0.85)' : 'rgba(244, 244, 245, 0.28)';
      ctx.beginPath();
      ctx.roundRect(startX + i * barSpacing, baseY - h / 2, Math.max(2, barSpacing * 0.52), h, 3 * s);
      ctx.fill();
    }

    ctx.fillStyle = '#F4F4F5';
    ctx.font = `600 ${Math.max(11, Math.round(22 * s))}px "Plus Jakarta Sans", system-ui, sans-serif`;
    ctx.fillText('Bashar Frame Studio', cardX + 34 * s, cardY + 56 * s);
    ctx.fillStyle = 'rgba(161, 161, 170, 0.88)';
    ctx.font = `400 ${Math.max(9, Math.round(15 * s))}px "Hind Siliguri", system-ui, sans-serif`;
    ctx.fillText('ভিডিওর বাইরের চারদিকে রঙ ঘূর্ণায়মান থাকছে।', cardX + 34 * s, cardY + 86 * s);
  }

  ctx.restore();
}
