import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, X } from 'lucide-react';
import {
  BorderSettings,
  BUILTIN_PALETTES,
  computeStageDimensions,
  formatBytes,
} from '../utils/borderConfig';
import { renderChromaStage } from '../utils/canvasRenderer';
import { drawDemoClipFrame } from '../utils/demoVideos';
import { ExportResult, exportVideoWithBorder } from '../utils/videoExporter';
import { Translations } from '../utils/i18n';

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  settings: BorderSettings;
  mode: 'demo' | 'uploaded';
  demoClipId: string;
  uploadedVideoElement: HTMLVideoElement | null;
  sourceWidth: number;
  sourceHeight: number;
  uploadedDurationSec: number;
  onExportCompleted: (result: ExportResult, paletteName: string) => void;
  t: Translations;
}

const EXPORT_PRESETS = [
  { value: 720 as const, fps: 18, label: 'দ্রুত (720p)' },
  { value: 1280 as const, fps: 24, label: 'এইচডি (1280p)' },
  { value: 1920 as const, fps: 24, label: 'ফুল এইচডি (1920p)' },
];

export function ExportModal({
  open,
  onClose,
  settings,
  mode,
  demoClipId,
  uploadedVideoElement,
  sourceWidth,
  sourceHeight,
  uploadedDurationSec,
  onExportCompleted,
  t,
}: ExportModalProps) {
  const [targetLongSide, setTargetLongSide] = useState<720 | 1280 | 1920>(720);
  const [demoDurationSec, setDemoDurationSec] = useState<number>(3);
  const [exporting, setExporting] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [totalSec, setTotalSec] = useState(3);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) {
      abortControllerRef.current?.abort();
      setExporting(false);
      setProgressPct(0);
      setErrorText(null);
      setResult(null);
    }
  }, [open]);

  useEffect(() => {
    setResult(null);
  }, [mode, demoClipId, uploadedVideoElement, settings]);

  useEffect(() => {
    return () => {
      if (result?.url) {
        URL.revokeObjectURL(result.url);
      }
    };
  }, [result]);

  const dims = computeStageDimensions(
    settings.aspectRatio,
    sourceWidth,
    sourceHeight,
    targetLongSide
  );

  useEffect(() => {
    if (!open || exporting || result) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const previewW = canvas.width;
    const previewH = Math.max(120, Math.round((previewW * dims.height) / dims.width));
    if (canvas.height !== previewH) {
      canvas.height = previewH;
    }

    let srcEl: HTMLVideoElement | HTMLCanvasElement | null = uploadedVideoElement;
    if (mode === 'demo') {
      const off = document.createElement('canvas');
      off.width = 480;
      off.height = Math.max(270, Math.round((480 * (sourceHeight || 720)) / (sourceWidth || 1280)));
      const oCtx = off.getContext('2d');
      if (oCtx) {
        drawDemoClipFrame(oCtx, demoClipId, off.width, off.height, 0);
      }
      srcEl = off;
    }

    renderChromaStage({
      ctx,
      stageWidth: previewW,
      stageHeight: previewH,
      source: srcEl,
      sourceWidth: sourceWidth || 1280,
      sourceHeight: sourceHeight || 720,
      settings,
      elapsedSeconds: 0.4,
      referenceWidth: 960,
    });
  }, [
    open,
    exporting,
    result,
    mode,
    demoClipId,
    uploadedVideoElement,
    sourceWidth,
    sourceHeight,
    settings,
    dims.width,
    dims.height,
  ]);

  if (!open) return null;

  const paletteName =
    BUILTIN_PALETTES.find((p) => p.id === settings.paletteId)?.name || 'কাস্টম স্পেকট্রাম';

  const triggerDownload = (url: string, fileName: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const activePreset =
    EXPORT_PRESETS.find((p) => p.value === targetLongSide) || EXPORT_PRESETS[0];

  const handleStartExport = async () => {
    if (result?.url) {
      URL.revokeObjectURL(result.url);
      setResult(null);
    }
    setErrorText(null);
    setProgressPct(0);
    setElapsedSec(0);
    setTotalSec(mode === 'uploaded' ? uploadedDurationSec : demoDurationSec);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setExporting(true);

    try {
      const res = await exportVideoWithBorder({
        settings,
        mode,
        demoClipId,
        uploadedVideoElement,
        sourceWidth,
        sourceHeight,
        targetLongSide,
        demoDurationSec,
        fps: activePreset.fps,
        previewCanvas: previewCanvasRef.current,
        abortSignal: controller.signal,
        onProgress: (pct, elapsed, total) => {
          setProgressPct(pct);
          setElapsedSec(elapsed);
          setTotalSec(total);
        },
      });
      setResult(res);
      onExportCompleted(res, paletteName);
      triggerDownload(res.url, res.fileName);
    } catch (err) {
      if (err instanceof Error && err.message === 'Export cancelled.') {
        setErrorText('এক্সপোর্ট বাতিল করা হয়েছে।');
      } else {
        setErrorText(err instanceof Error ? err.message : 'ভিডিও এক্সপোর্ট করা যায়নি।');
      }
    } finally {
      setExporting(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-lg rounded-2xl border border-white/12 bg-[#131317] text-zinc-100 p-6 space-y-5">
        <div className="flex items-center justify-between gap-4 pb-3 border-b border-white/[0.08]">
          <h2 id="export-modal-title" className="font-display text-base font-semibold text-zinc-100">
            {t.exportModalTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="এক্সপোর্ট ডায়ালগ বন্ধ করুন"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Live Render Preview Frame */}
        <div className="rounded-xl border border-white/[0.08] bg-[#09090B] p-3 flex flex-col items-center gap-2">
          <canvas
            ref={previewCanvasRef}
            width={360}
            height={Math.max(120, Math.round((360 * dims.height) / dims.width))}
            className="max-h-48 w-auto rounded-lg bg-[#09090B]"
          />
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-zinc-400 font-mono">
            <span>{dims.width}×{dims.height}</span>
            <span aria-hidden="true">·</span>
            <span>{activePreset.fps} FPS</span>
            <span aria-hidden="true">·</span>
            <span>{paletteName}</span>
          </div>
        </div>

        {/* Export Settings */}
        {!exporting && !result && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <span className="block text-xs text-zinc-300">{t.resolutionLabel}</span>
              <div className="grid grid-cols-3 gap-2">
                {EXPORT_PRESETS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTargetLongSide(opt.value)}
                    className={`py-2 px-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                      targetLongSide === opt.value
                        ? 'border-white/30 bg-white/10 text-white'
                        : 'border-white/[0.08] bg-[#0E0E13] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {mode === 'demo' ? (
              <div className="space-y-1.5">
                <span className="block text-xs text-zinc-300">{t.durationLabel}</span>
                <div className="grid grid-cols-3 gap-2">
                  {[2, 3, 5].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setDemoDurationSec(sec)}
                      className={`py-2 text-xs font-mono font-medium rounded-lg border transition-colors cursor-pointer ${
                        demoDurationSec === sec
                          ? 'border-white/30 bg-white/10 text-white'
                          : 'border-white/[0.08] bg-[#0E0E13] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {sec} সে.
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="rounded-lg border border-white/[0.08] bg-[#0E0E13] px-3 py-2 text-xs text-zinc-400">
                আপলোড করা ভিডিওর সম্পূর্ণ দৈর্ঘ্য ({uploadedDurationSec.toFixed(1)} সে.) আসল অডিও ও ঘূর্ণায়মান আউটার বর্ডারসহ রেন্ডার হবে।
              </p>
            )}
          </div>
        )}

        {/* Active Progress */}
        {exporting && (
          <div className="space-y-2.5" data-testid="export-progress-box">
            <div className="flex items-center justify-between text-xs gap-2">
              <span className="text-zinc-300">{t.renderingFrames}</span>
              <span className="font-mono text-zinc-200">{progressPct}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-sky-400 transition-all duration-150"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="font-mono text-[11px] text-zinc-400">
              {elapsedSec.toFixed(1)} সে. / {totalSec.toFixed(1)} সে.
            </p>
          </div>
        )}

        {/* Completed State */}
        {result && (
          <div
            data-testid="export-complete-box"
            className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 space-y-3"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t.downloadReady}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300 font-mono">
              <span>{result.fileName}</span>
              <span aria-hidden="true">·</span>
              <span>{formatBytes(result.fileSizeBytes)}</span>
              <span aria-hidden="true">·</span>
              <span>{result.resolution}</span>
            </div>
            <a
              href={result.url}
              download={result.fileName}
              data-testid="download-ready-link"
              className="inline-flex items-center justify-center gap-2 w-full h-10 text-xs font-semibold text-zinc-950 bg-emerald-400 rounded-lg hover:bg-emerald-300 transition-colors"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>{t.downloadFile}</span>
            </a>
          </div>
        )}

        {errorText && <p className="text-xs text-rose-400">{errorText}</p>}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/[0.08]">
          {exporting ? (
            <button
              type="button"
              onClick={handleCancel}
              className="h-9 px-4 text-xs font-medium text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-lg hover:bg-rose-500/20 transition-colors cursor-pointer"
            >
              {t.cancelExport}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-4 text-xs font-medium text-zinc-300 bg-white/[0.05] border border-white/10 rounded-lg hover:bg-white/[0.1] hover:text-white transition-colors cursor-pointer"
              >
                {t.close}
              </button>
              <button
                type="button"
                onClick={handleStartExport}
                data-testid="start-export-btn"
                className="inline-flex items-center gap-2 h-9 px-4 text-xs font-semibold text-zinc-950 bg-zinc-100 rounded-lg hover:bg-white transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{result ? t.renderAgain : t.startExport}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
