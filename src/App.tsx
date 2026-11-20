import { useEffect, useRef, useState } from 'react';
import { ControlsSidebar } from './components/ControlsSidebar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ExportModal } from './components/ExportModal';
import { Navbar } from './components/Navbar';
import { VideoStage } from './components/VideoStage';
import { WorkflowSection } from './components/WorkflowSection';
import {
  BorderSettings,
  clampSettings,
  DEFAULT_BORDER_SETTINGS,
} from './utils/borderConfig';
import { DEMO_CLIPS } from './utils/demoVideos';
import { BN_COPY } from './utils/i18n';
import { capturePngSnapshot, ExportResult } from './utils/videoExporter';

function StudioWorkspace() {
  const t = BN_COPY;

  const [settings, setSettings] = useState<BorderSettings>(DEFAULT_BORDER_SETTINGS);
  const [mode, setMode] = useState<'demo' | 'uploaded'>('demo');
  const [demoClipId, setDemoClipId] = useState<string>(DEMO_CLIPS[0].id);

  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [videoSize, setVideoSize] = useState<{ width: number; height: number }>({
    width: 1280,
    height: 720,
  });
  const [uploadedDurationSec, setUploadedDurationSec] = useState<number>(8);

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [toastText, setToastText] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    return () => {
      if (uploadedVideoUrl) {
        URL.revokeObjectURL(uploadedVideoUrl);
      }
    };
  }, [uploadedVideoUrl]);

  const showToast = (msg: string) => {
    setToastText(msg);
    setTimeout(() => {
      setToastText((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const handleUploadFile = (file: File) => {
    if (uploadedVideoUrl) {
      URL.revokeObjectURL(uploadedVideoUrl);
    }
    const url = URL.createObjectURL(file);
    setUploadedVideoUrl(url);
    setUploadedFileName(file.name);
    setMode('uploaded');
  };

  const handleClearUpload = () => {
    if (uploadedVideoUrl) {
      URL.revokeObjectURL(uploadedVideoUrl);
    }
    setUploadedVideoUrl(null);
    setUploadedFileName(null);
    setVideoSize({ width: 1280, height: 720 });
    setMode('demo');
  };

  const handleExportCompleted = (result: ExportResult) => {
    showToast(`ডাউনলোড সম্পন্ন: ${result.fileName}`);
  };

  const handleCaptureSnapshot = (elapsedSeconds: number) => {
    const srcW =
      mode === 'uploaded' && videoRef.current
        ? videoRef.current.videoWidth || videoSize.width
        : videoSize.width;
    const srcH =
      mode === 'uploaded' && videoRef.current
        ? videoRef.current.videoHeight || videoSize.height
        : videoSize.height;
    const snap = capturePngSnapshot(
      settings,
      mode,
      demoClipId,
      videoRef.current,
      srcW,
      srcH,
      elapsedSeconds
    );
    const a = document.createElement('a');
    a.href = snap.url;
    a.download = snap.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(`ফ্রেম সেভ হয়েছে: ${snap.fileName}`);
  };

  const ringCssVars = {
    ['--c1' as string]: settings.colors[0] || '#2563EB',
    ['--c2' as string]: settings.colors[1] || '#06B6D4',
    ['--c3' as string]: settings.colors[2] || settings.colors[0] || '#10B981',
    ['--c4' as string]: settings.colors[3] || settings.colors[1] || '#F59E0B',
    ['--c5' as string]: settings.colors[4] || settings.colors[2] || '#EA580C',
  };

  return (
    <div
      style={ringCssVars}
      className={`min-h-screen bg-[#0B0B0E] text-zinc-100 flex flex-col${exportModalOpen ? ' export-active' : ''}`}
    >
      <Navbar t={t} />

      <main id="studio" className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6 space-y-8">
        {/* Intro Heading Row */}
        <div className="flex flex-col items-start gap-2">
          <h1
            className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-50"
            style={{ textWrap: 'balance' }}
          >
            {t.heroTitle}
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-2xl">
            {t.heroSubtitle}
          </p>
        </div>

        {/* Primary Two-Column Studio Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
          <VideoStage
            settings={settings}
            mode={mode}
            demoClipId={demoClipId}
            onDemoClipChange={(id) => {
              setDemoClipId(id);
              setMode('demo');
            }}
            uploadedVideoUrl={uploadedVideoUrl}
            uploadedFileName={uploadedFileName}
            onUploadFile={handleUploadFile}
            onClearUpload={handleClearUpload}
            onOpenExport={() => setExportModalOpen(true)}
            onCaptureSnapshot={handleCaptureSnapshot}
            videoRef={videoRef}
            videoSize={videoSize}
            onVideoMetadata={(w, h, d) => {
              setVideoSize({ width: w, height: h });
              setUploadedDurationSec(d);
            }}
            suspended={exportModalOpen}
            t={t}
          />

          <ControlsSidebar
            settings={settings}
            onChange={(next) => setSettings(clampSettings(next))}
            t={t}
          />
        </div>

        {/* 3-Step Workflow Guide */}
        <WorkflowSection t={t} />
      </main>

      <footer className="border-t border-white/[0.08] py-5 px-4 sm:px-6 text-xs text-zinc-400">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <span
            className="chroma-text-ring-soft rounded-lg px-3 py-1 font-display font-medium text-zinc-100"
            style={{ ['--ring-bg' as string]: '#0E0E13' }}
          >
            Bashar Frame Studio
          </span>
          <span className="text-zinc-500">
            {t.footerTagline}
          </span>
        </div>
      </footer>

      <ExportModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        settings={settings}
        mode={mode}
        demoClipId={demoClipId}
        uploadedVideoElement={videoRef.current}
        sourceWidth={videoSize.width}
        sourceHeight={videoSize.height}
        uploadedDurationSec={uploadedDurationSec}
        onExportCompleted={handleExportCompleted}
        t={t}
      />

      {toastText && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-40 px-4 py-2.5 rounded-xl border border-white/15 bg-[#16161C] text-xs font-medium text-zinc-100 shadow-lg"
        >
          {toastText}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <StudioWorkspace />
    </ErrorBoundary>
  );
}
