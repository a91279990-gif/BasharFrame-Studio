import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Download,
  Pause,
  Play,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  BorderSettings,
  computeStageDimensions,
  formatTimecode,
} from '../utils/borderConfig';
import { renderChromaStage } from '../utils/canvasRenderer';
import { DEMO_CLIPS, drawDemoClipFrame } from '../utils/demoVideos';
import { Translations } from '../utils/i18n';

interface VideoStageProps {
  settings: BorderSettings;
  mode: 'demo' | 'uploaded';
  demoClipId: string;
  onDemoClipChange: (clipId: string) => void;
  uploadedVideoUrl: string | null;
  uploadedFileName: string | null;
  onUploadFile: (file: File) => void;
  onClearUpload: () => void;
  onOpenExport: () => void;
  onCaptureSnapshot: (elapsedSeconds: number) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoSize: { width: number; height: number };
  onVideoMetadata: (width: number, height: number, duration: number) => void;
  suspended?: boolean;
  t: Translations;
}

export function VideoStage({
  settings,
  mode,
  demoClipId,
  onDemoClipChange,
  uploadedVideoUrl,
  uploadedFileName,
  onUploadFile,
  onClearUpload,
  onOpenExport,
  onCaptureSnapshot,
  videoRef,
  videoSize,
  onVideoMetadata,
  suspended = false,
  t,
}: VideoStageProps) {
  const stageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const demoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(8);
  const [isDragging, setIsDragging] = useState(false);

  // Refs to avoid tearing down rAF loop on slider adjustments
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const demoClipIdRef = useRef(demoClipId);
  demoClipIdRef.current = demoClipId;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const videoSizeRef = useRef(videoSize);
  videoSizeRef.current = videoSize;

  const elapsedRef = useRef(0);
  const lastFrameTimeRef = useRef<number | null>(null);

  const drawFrameNow = () => {
    if (!demoCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = 1280;
      c.height = 720;
      demoCanvasRef.current = c;
    }

    const activeSettings = settingsRef.current;
    const activeMode = modeRef.current;
    const vSize = videoSizeRef.current;

    const stageCanvas = stageCanvasRef.current;
    if (!stageCanvas) return;

    const { width: targetW, height: targetH } = computeStageDimensions(
      activeSettings.aspectRatio,
      vSize.width,
      vSize.height,
      960
    );

    if (stageCanvas.width !== targetW || stageCanvas.height !== targetH) {
      stageCanvas.width = targetW;
      stageCanvas.height = targetH;
    }

    const ctx = stageCanvas.getContext('2d');
    if (!ctx) return;

    let source: HTMLVideoElement | HTMLCanvasElement | null = null;
    let srcW = vSize.width;
    let srcH = vSize.height;

    if (activeMode === 'uploaded' && videoRef.current) {
      source = videoRef.current;
      srcW = videoRef.current.videoWidth || vSize.width;
      srcH = videoRef.current.videoHeight || vSize.height;
    } else if (demoCanvasRef.current) {
      const dCtx = demoCanvasRef.current.getContext('2d');
      if (dCtx) {
        drawDemoClipFrame(
          dCtx,
          demoClipIdRef.current,
          demoCanvasRef.current.width,
          demoCanvasRef.current.height,
          elapsedRef.current
        );
      }
      source = demoCanvasRef.current;
      srcW = demoCanvasRef.current.width;
      srcH = demoCanvasRef.current.height;
    }

    renderChromaStage({
      ctx,
      stageWidth: targetW,
      stageHeight: targetH,
      source,
      sourceWidth: srcW,
      sourceHeight: srcH,
      settings: activeSettings,
      elapsedSeconds: elapsedRef.current,
      referenceWidth: 960,
    });
  };

  useEffect(() => {
    drawFrameNow();
  }, [settings, mode, demoClipId, videoSize]);

  useEffect(() => {
    if (mode === 'demo') {
      const clip = DEMO_CLIPS.find((c) => c.id === demoClipId) || DEMO_CLIPS[0];
      setDuration(clip.loopDurationSec);
      setCurrentTime(0);
      elapsedRef.current = 0;
      setIsPlaying(true);
    }
  }, [mode, demoClipId]);

  useEffect(() => {
    drawFrameNow();
    if (!isPlaying || suspended) {
      lastFrameTimeRef.current = null;
      return;
    }

    let rafId = 0;
    let lastUiSync = 0;
    let lastDrawMs = 0;

    const tick = (nowMs: number) => {
      rafId = requestAnimationFrame(tick);

      if (nowMs - lastDrawMs < 33) {
        return;
      }
      lastDrawMs = nowMs;

      const dt =
        lastFrameTimeRef.current !== null
          ? Math.min(0.1, (nowMs - lastFrameTimeRef.current) / 1000)
          : 0.033;
      lastFrameTimeRef.current = nowMs;

      elapsedRef.current += dt;
      drawFrameNow();

      if (nowMs - lastUiSync > 180) {
        lastUiSync = nowMs;
        if (modeRef.current === 'uploaded' && videoRef.current) {
          setCurrentTime(videoRef.current.currentTime || 0);
        } else {
          const clip = DEMO_CLIPS.find((c) => c.id === demoClipIdRef.current) || DEMO_CLIPS[0];
          setCurrentTime(elapsedRef.current % clip.loopDurationSec);
        }
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, suspended, videoRef]);

  const handleTogglePlay = () => {
    const next = !isPlaying;
    setIsPlaying(next);
    if (mode === 'uploaded' && videoRef.current) {
      if (next) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }
  };

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    if (videoRef.current) {
      videoRef.current.muted = next;
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setCurrentTime(val);
    if (mode === 'uploaded' && videoRef.current) {
      videoRef.current.currentTime = val;
    } else {
      elapsedRef.current = val;
    }
    drawFrameNow();
  };

  const handleFilePicked = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) return;
    onUploadFile(file);
    setIsPlaying(true);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    handleFilePicked(file);
  };

  const stageDims = computeStageDimensions(
    settings.aspectRatio,
    videoSize.width,
    videoSize.height,
    960
  );

  return (
    <section
      aria-label="ভিডিও প্রিভিউ স্টেজ"
      className="flex flex-col gap-4"
      data-testid="video-stage-section"
      data-palette-id={settings.paletteId}
      data-aspect-ratio={settings.aspectRatio}
      data-border-width={settings.borderWidth}
      data-video-mode={mode}
      data-playing={isPlaying ? 'true' : 'false'}
    >
      {/* Hidden source video element for uploaded clips */}
      {uploadedVideoUrl && (
        <video
          ref={videoRef}
          src={uploadedVideoUrl}
          playsInline
          loop
          muted={isMuted}
          autoPlay
          className="hidden"
          onLoadedMetadata={(e) => {
            const vid = e.currentTarget;
            const w = vid.videoWidth || 1280;
            const h = vid.videoHeight || 720;
            const d = Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration : 10;
            setDuration(d);
            onVideoMetadata(w, h, d);
            vid.play().catch(() => {});
          }}
        />
      )}

      {/* Stage Viewport Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          <span className="text-zinc-100 font-medium">
            {mode === 'uploaded' && uploadedFileName
              ? uploadedFileName
              : (DEMO_CLIPS.find((c) => c.id === demoClipId)?.title ?? t.demoClipLabel)}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono text-zinc-300">
            {stageDims.width}×{stageDims.height}
          </span>
          <span aria-hidden="true" className="hidden sm:inline">·</span>
          <span className="hidden sm:inline text-zinc-400">
            {t.stageSubtitle}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="demo-clip-select" className="sr-only">
            {t.demoClipLabel}
          </label>
          <select
            id="demo-clip-select"
            value={mode === 'demo' ? demoClipId : 'custom'}
            onChange={(e) => {
              if (e.target.value === 'custom') return;
              onClearUpload();
              onDemoClipChange(e.target.value);
            }}
            className="h-9 px-3 text-xs font-medium text-zinc-200 bg-[#141418] border border-white/10 rounded-lg focus:outline-none focus:border-white/25 cursor-pointer"
          >
            {DEMO_CLIPS.map((clip) => (
              <option key={clip.id} value={clip.id} className="bg-[#141418] text-zinc-100">
                {clip.title}
              </option>
            ))}
            {mode === 'uploaded' && (
              <option value="custom" className="bg-[#141418] text-zinc-100">
                {t.uploadedClipOption}
              </option>
            )}
          </select>

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            aria-label={t.uploadVideo}
            onChange={(e) => {
              handleFilePicked(e.target.files?.[0]);
              e.target.value = '';
            }}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-medium text-zinc-100 bg-white/[0.06] border border-white/12 rounded-lg hover:bg-white/[0.11] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t.uploadVideo}</span>
          </button>
        </div>
      </div>

      {/* Live Canvas Stage Container */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`relative rounded-2xl border overflow-hidden flex items-center justify-center p-3 sm:p-5 min-h-[340px] lg:min-h-[520px] transition-colors ${
          isDragging
            ? 'border-sky-400 bg-sky-950/20'
            : 'border-white/[0.08] bg-[#08080A]'
        }`}
      >
        <canvas
          ref={stageCanvasRef}
          data-testid="chroma-stage-canvas"
          className="max-w-full max-h-[520px] w-auto h-auto rounded-xl object-contain"
        />

        {isDragging && (
          <div className="absolute inset-0 bg-black/75 flex items-center justify-center pointer-events-none">
            <p className="text-sm font-medium text-sky-200 px-6 text-center">{t.dropHint}</p>
          </div>
        )}
      </div>

      {/* Transport & Primary Export Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 rounded-xl border border-white/[0.08] bg-[#121216]">
        <div className="flex items-center gap-3 flex-1 min-w-[220px]">
          <button
            type="button"
            onClick={handleTogglePlay}
            aria-label={isPlaying ? t.pause : t.play}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/[0.06] border border-white/10 text-zinc-100 hover:bg-white/[0.12] hover:text-white transition-colors shrink-0 cursor-pointer"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Play className="w-4 h-4" aria-hidden="true" />
            )}
          </button>

          {mode === 'uploaded' && (
            <button
              type="button"
              onClick={handleToggleMute}
              aria-label={isMuted ? t.unmute : t.mute}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/[0.06] border border-white/10 text-zinc-300 hover:bg-white/[0.12] hover:text-white transition-colors shrink-0 cursor-pointer"
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Volume2 className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          )}

          <input
            type="range"
            min={0}
            max={Math.max(0.5, duration)}
            step={0.05}
            value={Math.min(currentTime, duration)}
            onChange={handleSeek}
            aria-label="টাইমলাইন স্লাইডার"
            className="studio-slider flex-1 min-w-[80px]"
          />

          <span className="font-mono text-xs text-zinc-400 whitespace-nowrap shrink-0">
            {formatTimecode(currentTime)} / {formatTimecode(duration)}
          </span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onCaptureSnapshot(elapsedRef.current)}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-medium text-zinc-200 bg-white/[0.05] border border-white/10 rounded-lg hover:bg-white/[0.1] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t.snapshotPng}</span>
          </button>

          <button
            type="button"
            onClick={onOpenExport}
            data-testid="open-export-btn"
            className="inline-flex items-center gap-2 h-9 px-4 text-xs font-semibold text-zinc-950 bg-zinc-100 rounded-lg hover:bg-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t.exportVideo}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
