import {
  BorderSettings,
  computeStageDimensions,
} from './borderConfig';
import { renderChromaStage } from './canvasRenderer';
import { drawDemoClipFrame } from './demoVideos';
import { MuxedAudioChunk, MuxedVideoChunk, muxWebm } from './webmMuxer';

export interface ExportResult {
  blob: Blob;
  url: string;
  fileName: string;
  fileSizeBytes: number;
  durationSec: number;
  resolution: string;
  format: 'webm' | 'mp4';
  mimeType: string;
}

export interface ExportVideoOptions {
  settings: BorderSettings;
  mode: 'uploaded' | 'demo';
  demoClipId: string;
  uploadedVideoElement: HTMLVideoElement | null;
  sourceWidth: number;
  sourceHeight: number;
  targetLongSide: 720 | 960 | 1280 | 1920;
  demoDurationSec: number;
  fps?: number;
  onProgress: (progressPct: number, elapsedSec: number, totalSec: number) => void;
  previewCanvas?: HTMLCanvasElement | null;
  abortSignal?: AbortSignal;
}

function yieldFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function seekVideoTo(video: HTMLVideoElement, targetTimeSec: number): Promise<void> {
  if (Math.abs(video.currentTime - targetTimeSec) < 0.001 && video.readyState >= 2) {
    return;
  }
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', finish);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, 250);
    video.addEventListener('seeked', finish, { once: true });
    video.currentTime = targetTimeSec;
  });
}

async function encodeSourceAudioToOpus(
  videoSrc: string,
  maxDurationSec: number,
  abortSignal?: AbortSignal
): Promise<{ chunks: MuxedAudioChunk[]; codecPrivate?: Uint8Array }> {
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') {
    return { chunks: [] };
  }

  try {
    const opusCheck = await AudioEncoder.isConfigSupported({
      codec: 'opus',
      sampleRate: 48000,
      numberOfChannels: 2,
      bitrate: 128_000,
    });
    if (!opusCheck.supported) {
      return { chunks: [] };
    }

    const resp = await fetch(videoSrc, { signal: abortSignal });
    const rawBuf = await resp.arrayBuffer();
    if (abortSignal?.aborted) return { chunks: [] };

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return { chunks: [] };

    const decodeCtx = new AudioCtx();
    let decoded: AudioBuffer;
    try {
      decoded = await decodeCtx.decodeAudioData(rawBuf);
    } finally {
      await decodeCtx.close().catch(() => {});
    }

    if (!decoded || decoded.length === 0 || decoded.numberOfChannels === 0) {
      return { chunks: [] };
    }

    const targetSampleRate = 48000;
    const clipSec = Math.min(decoded.duration, maxDurationSec);
    const totalSamples = Math.max(960, Math.ceil(clipSec * targetSampleRate));
    const offline = new OfflineAudioContext(2, totalSamples, targetSampleRate);
    const srcNode = offline.createBufferSource();
    srcNode.buffer = decoded;
    srcNode.connect(offline.destination);
    srcNode.start(0);
    const resampled = await offline.startRendering();

    const left = resampled.getChannelData(0);
    const right = resampled.numberOfChannels > 1 ? resampled.getChannelData(1) : left;

    const audioChunks: MuxedAudioChunk[] = [];
    let codecPrivate: Uint8Array | undefined;

    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        const bytes = new Uint8Array(chunk.byteLength);
        chunk.copyTo(bytes);
        audioChunks.push({
          data: bytes,
          timestampUs: chunk.timestamp,
        });
        if (!codecPrivate && meta?.decoderConfig?.description) {
          const desc = meta.decoderConfig.description;
          codecPrivate =
            desc instanceof ArrayBuffer
              ? new Uint8Array(desc.slice(0))
              : new Uint8Array(
                  (desc as ArrayBufferView).buffer.slice(
                    (desc as ArrayBufferView).byteOffset,
                    (desc as ArrayBufferView).byteOffset + (desc as ArrayBufferView).byteLength
                  )
                );
        }
      },
      error: () => {
        // Non-fatal: continue video-only if audio encoder errors
      },
    });

    audioEncoder.configure({
      codec: 'opus',
      sampleRate: targetSampleRate,
      numberOfChannels: 2,
      bitrate: 128_000,
    });

    const frameSize = 960; // 20ms at 48kHz
    for (let offset = 0; offset < resampled.length; offset += frameSize) {
      if (abortSignal?.aborted) break;
      const count = Math.min(frameSize, resampled.length - offset);
      const planar = new Float32Array(count * 2);
      planar.set(left.subarray(offset, offset + count), 0);
      planar.set(right.subarray(offset, offset + count), count);

      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate: targetSampleRate,
        numberOfFrames: count,
        numberOfChannels: 2,
        timestamp: Math.round((offset / targetSampleRate) * 1_000_000),
        data: planar,
      });
      audioEncoder.encode(audioData);
      audioData.close();
    }

    await audioEncoder.flush();
    audioEncoder.close();
    return { chunks: audioChunks, codecPrivate };
  } catch {
    return { chunks: [] };
  }
}

async function selectWebCodecsConfig(
  width: number,
  height: number,
  bitrate: number,
  fps: number
): Promise<{ codec: string; muxCodec: 'V_VP8' | 'V_VP9' } | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    return null;
  }

  const candidates: { codec: string; muxCodec: 'V_VP8' | 'V_VP9' }[] = [
    { codec: 'vp8', muxCodec: 'V_VP8' },
    { codec: 'vp09.00.10.08', muxCodec: 'V_VP9' },
  ];

  for (const candidate of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec: candidate.codec,
        width,
        height,
        bitrate,
        framerate: fps,
      });
      if (support.supported) {
        return candidate;
      }
    } catch {
      // Try next candidate
    }
  }
  return null;
}

async function exportWithWebCodecs({
  settings,
  mode,
  demoClipId,
  exportVideoEl,
  uploadedAudioSrc,
  demoSourceCanvas,
  demoSourceCtx,
  exportCanvas,
  exportCtx,
  stageW,
  stageH,
  sourceWidth,
  sourceHeight,
  totalDurationSec,
  targetLongSide,
  fps,
  onProgress,
  previewCanvas,
  abortSignal,
}: {
  settings: BorderSettings;
  mode: 'uploaded' | 'demo';
  demoClipId: string;
  exportVideoEl: HTMLVideoElement | null;
  uploadedAudioSrc: string | null;
  demoSourceCanvas: HTMLCanvasElement;
  demoSourceCtx: CanvasRenderingContext2D | null;
  exportCanvas: HTMLCanvasElement;
  exportCtx: CanvasRenderingContext2D;
  stageW: number;
  stageH: number;
  sourceWidth: number;
  sourceHeight: number;
  totalDurationSec: number;
  targetLongSide: 720 | 960 | 1280 | 1920;
  fps: number;
  onProgress: (progressPct: number, elapsedSec: number, totalSec: number) => void;
  previewCanvas?: HTMLCanvasElement | null;
  abortSignal?: AbortSignal;
}): Promise<ExportResult | null> {
  const bitrate =
    targetLongSide >= 1920
      ? 6_000_000
      : targetLongSide >= 1280
        ? 3_200_000
        : targetLongSide >= 960
          ? 2_000_000
          : 1_400_000;
  const codecChoice = await selectWebCodecsConfig(stageW, stageH, bitrate, fps);
  if (!codecChoice) {
    return null;
  }

  const videoChunks: MuxedVideoChunk[] = [];
  let encoderError: Error | null = null;

  const encoder = new VideoEncoder({
    output: (chunk) => {
      const bytes = new Uint8Array(chunk.byteLength);
      chunk.copyTo(bytes);
      videoChunks.push({
        data: bytes,
        timestampUs: chunk.timestamp,
        isKey: chunk.type === 'key',
      });
    },
    error: (err) => {
      encoderError = err instanceof Error ? err : new Error(String(err));
    },
  });

  encoder.configure({
    codec: codecChoice.codec,
    width: stageW,
    height: stageH,
    bitrate,
    framerate: fps,
    latencyMode: 'realtime',
  });

  const audioPromise =
    mode === 'uploaded' && uploadedAudioSrc
      ? encodeSourceAudioToOpus(uploadedAudioSrc, totalDurationSec, abortSignal)
      : Promise.resolve({ chunks: [] as MuxedAudioChunk[], codecPrivate: undefined });

  const totalFrames = Math.max(1, Math.round(totalDurationSec * fps));
  const frameDurationUs = Math.round(1_000_000 / fps);
  const uiStep = Math.max(5, Math.floor(totalFrames / 10));
  const previewCtx = previewCanvas ? previewCanvas.getContext('2d') : null;

  try {
    for (let i = 0; i < totalFrames; i++) {
      if (abortSignal?.aborted) {
        throw new Error('Export cancelled.');
      }
      if (encoderError) {
        throw encoderError;
      }

      const elapsedSec = Math.min(totalDurationSec - 0.001, i / fps);

      if (mode === 'uploaded' && exportVideoEl) {
        await seekVideoTo(exportVideoEl, elapsedSec);
      } else if (demoSourceCtx) {
        drawDemoClipFrame(
          demoSourceCtx,
          demoClipId,
          demoSourceCanvas.width,
          demoSourceCanvas.height,
          elapsedSec
        );
      }

      renderChromaStage({
        ctx: exportCtx,
        stageWidth: stageW,
        stageHeight: stageH,
        source: mode === 'uploaded' ? exportVideoEl : demoSourceCanvas,
        sourceWidth:
          mode === 'uploaded' && exportVideoEl
            ? exportVideoEl.videoWidth || sourceWidth
            : demoSourceCanvas.width,
        sourceHeight:
          mode === 'uploaded' && exportVideoEl
            ? exportVideoEl.videoHeight || sourceHeight
            : demoSourceCanvas.height,
        settings,
        elapsedSeconds: elapsedSec,
      });

      const shouldNotifyUi = i === 0 || i % uiStep === 0 || i === totalFrames - 1;

      if (previewCanvas && previewCtx && shouldNotifyUi) {
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        previewCtx.drawImage(exportCanvas, 0, 0, previewCanvas.width, previewCanvas.height);
      }

      const vf = new VideoFrame(exportCanvas, {
        timestamp: Math.round((i / fps) * 1_000_000),
        duration: frameDurationUs,
      });
      encoder.encode(vf, { keyFrame: i % (fps * 2) === 0 });
      vf.close();

      while (encoder.encodeQueueSize > 48 && !abortSignal?.aborted && !encoderError) {
        await new Promise((r) => setTimeout(r, 4));
      }

      if (shouldNotifyUi) {
        const pct = Math.min(98, Math.round(((i + 1) / totalFrames) * 98));
        onProgress(pct, Math.min((i + 1) / fps, totalDurationSec), totalDurationSec);
        await yieldFrame();
      }
    }

    if (abortSignal?.aborted) {
      throw new Error('Export cancelled.');
    }

    await encoder.flush();
    encoder.close();

    if (encoderError) {
      throw encoderError;
    }

    const audioResult = await audioPromise;
    if (abortSignal?.aborted) {
      throw new Error('Export cancelled.');
    }

    const webmBytes = muxWebm(
      {
        width: stageW,
        height: stageH,
        videoCodec: codecChoice.muxCodec,
        durationMs: Math.round(totalDurationSec * 1000),
        hasAudio: audioResult.chunks.length > 0,
        audioSampleRate: 48000,
        audioChannels: 2,
        opusCodecPrivate: audioResult.codecPrivate,
      },
      videoChunks,
      audioResult.chunks
    );

    const blob = new Blob([webmBytes.slice().buffer], { type: 'video/webm' });
    if (blob.size === 0) {
      throw new Error('Muxed WebM output was empty.');
    }

    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const fileName = `bashar-frame-${settings.aspectRatio.replace(':', 'x')}-${stamp}.webm`;
    onProgress(100, totalDurationSec, totalDurationSec);

    return {
      blob,
      url,
      fileName,
      fileSizeBytes: blob.size,
      durationSec: Number(totalDurationSec.toFixed(1)),
      resolution: `${stageW}x${stageH}`,
      format: 'webm',
      mimeType: 'video/webm',
    };
  } catch (err) {
    try {
      if (encoder.state !== 'closed') encoder.close();
    } catch {
      // Ignore close error
    }
    throw err;
  }
}

function selectSupportedVideoMime(hasAudio: boolean): { mimeType: string; format: 'webm' | 'mp4' } {
  const candidates: { mimeType: string; format: 'webm' | 'mp4' }[] = hasAudio
    ? [
        { mimeType: 'video/webm;codecs=vp8,opus', format: 'webm' },
        { mimeType: 'video/webm;codecs=vp9,opus', format: 'webm' },
        { mimeType: 'video/webm;codecs=vp8', format: 'webm' },
        { mimeType: 'video/webm', format: 'webm' },
        { mimeType: 'video/mp4', format: 'mp4' },
      ]
    : [
        { mimeType: 'video/webm;codecs=vp8', format: 'webm' },
        { mimeType: 'video/webm;codecs=vp9', format: 'webm' },
        { mimeType: 'video/webm', format: 'webm' },
        { mimeType: 'video/mp4', format: 'mp4' },
      ];

  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.mimeType)) {
      return c;
    }
  }
  return { mimeType: 'video/webm', format: 'webm' };
}

export async function exportVideoWithBorder({
  settings,
  mode,
  demoClipId,
  uploadedVideoElement,
  sourceWidth,
  sourceHeight,
  targetLongSide,
  demoDurationSec,
  fps = 18,
  onProgress,
  previewCanvas,
  abortSignal,
}: ExportVideoOptions): Promise<ExportResult> {
  const { width: stageW, height: stageH } = computeStageDimensions(
    settings.aspectRatio,
    sourceWidth,
    sourceHeight,
    targetLongSide
  );

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = stageW;
  exportCanvas.height = stageH;

  const exportCtx = exportCanvas.getContext('2d', { alpha: false });
  if (!exportCtx) {
    throw new Error('Could not acquire 2D rendering context for video export.');
  }

  const baseSrcW = sourceWidth || 1280;
  const baseSrcH = sourceHeight || 720;
  const demoW = Math.min(baseSrcW, Math.max(480, Math.round(stageW * 0.9)));
  const demoH = Math.max(270, Math.round((demoW * baseSrcH) / baseSrcW));
  const demoSourceCanvas = document.createElement('canvas');
  demoSourceCanvas.width = demoW;
  demoSourceCanvas.height = demoH;
  const demoSourceCtx = demoSourceCanvas.getContext('2d', { alpha: false });

  let totalDurationSec = demoDurationSec;
  let exportVideoEl: HTMLVideoElement | null = null;
  let uploadedAudioSrc: string | null = null;

  if (mode === 'uploaded' && uploadedVideoElement) {
    uploadedAudioSrc = uploadedVideoElement.currentSrc || uploadedVideoElement.src;
    exportVideoEl = document.createElement('video');
    exportVideoEl.src = uploadedAudioSrc;
    exportVideoEl.crossOrigin = 'anonymous';
    exportVideoEl.playsInline = true;
    exportVideoEl.muted = true;
    exportVideoEl.preload = 'auto';

    await new Promise<void>((resolve, reject) => {
      if (!exportVideoEl) return reject(new Error('Missing video element.'));
      if (exportVideoEl.readyState >= 1) {
        resolve();
        return;
      }
      const onLoaded = () => {
        cleanup();
        resolve();
      };
      const onErr = () => {
        cleanup();
        reject(new Error('Failed to load uploaded video for export.'));
      };
      const cleanup = () => {
        exportVideoEl?.removeEventListener('loadedmetadata', onLoaded);
        exportVideoEl?.removeEventListener('error', onErr);
      };
      exportVideoEl.addEventListener('loadedmetadata', onLoaded);
      exportVideoEl.addEventListener('error', onErr);
    });

    if (Number.isFinite(exportVideoEl.duration) && exportVideoEl.duration > 0) {
      totalDurationSec = exportVideoEl.duration;
    }
    exportVideoEl.currentTime = 0;
  }

  try {
    const webCodecsResult = await exportWithWebCodecs({
      settings,
      mode,
      demoClipId,
      exportVideoEl,
      uploadedAudioSrc,
      demoSourceCanvas,
      demoSourceCtx,
      exportCanvas,
      exportCtx,
      stageW,
      stageH,
      sourceWidth,
      sourceHeight,
      totalDurationSec,
      targetLongSide,
      fps,
      onProgress,
      previewCanvas,
      abortSignal,
    });
    if (webCodecsResult) {
      if (exportVideoEl) {
        exportVideoEl.pause();
        exportVideoEl.removeAttribute('src');
        exportVideoEl.load();
      }
      return webCodecsResult;
    }
  } catch (err) {
    if (exportVideoEl) {
      exportVideoEl.pause();
      exportVideoEl.removeAttribute('src');
      exportVideoEl.load();
    }
    throw err;
  }

  // Fallback to MediaRecorder when WebCodecs VideoEncoder is unavailable
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Video export requires WebCodecs or MediaRecorder in this browser.');
  }

  if (mode === 'demo' && demoSourceCtx) {
    drawDemoClipFrame(
      demoSourceCtx,
      demoClipId,
      demoSourceCanvas.width,
      demoSourceCanvas.height,
      0
    );
  }
  renderChromaStage({
    ctx: exportCtx,
    stageWidth: stageW,
    stageHeight: stageH,
    source: mode === 'uploaded' ? exportVideoEl : demoSourceCanvas,
    sourceWidth:
      mode === 'uploaded' && exportVideoEl
        ? exportVideoEl.videoWidth || sourceWidth
        : demoSourceCanvas.width,
    sourceHeight:
      mode === 'uploaded' && exportVideoEl
        ? exportVideoEl.videoHeight || sourceHeight
        : demoSourceCanvas.height,
    settings,
    elapsedSeconds: 0,
  });

  const canvasStream = exportCanvas.captureStream(fps);
  const videoTrack = canvasStream.getVideoTracks()[0] as MediaStreamTrack & {
    requestFrame?: () => void;
  };
  const combinedStream = new MediaStream();
  if (videoTrack) {
    combinedStream.addTrack(videoTrack);
  }

  let audioCtx: AudioContext | null = null;
  if (exportVideoEl) {
    exportVideoEl.muted = false;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        audioCtx = new AudioCtx();
        const sourceNode = audioCtx.createMediaElementSource(exportVideoEl);
        const destNode = audioCtx.createMediaStreamDestination();
        sourceNode.connect(destNode);
        destNode.stream.getAudioTracks().forEach((track) => combinedStream.addTrack(track));
      }
    } catch {
      // Proceed with video-only stream if audio routing is unavailable
    }
  }

  const hasAudio = combinedStream.getAudioTracks().length > 0;
  const { mimeType, format } = selectSupportedVideoMime(hasAudio);
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: targetLongSide >= 1920 ? 8_000_000 : 4_500_000,
  });

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  return new Promise<ExportResult>((resolve, reject) => {
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let finished = false;
    const startWallMs = performance.now();
    const frameIntervalMs = Math.round(1000 / fps);

    const cleanupResources = () => {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (exportVideoEl) {
        exportVideoEl.pause();
        exportVideoEl.removeAttribute('src');
        exportVideoEl.load();
      }
      if (audioCtx) {
        audioCtx.close().catch(() => {});
      }
      combinedStream.getTracks().forEach((t) => t.stop());
    };

    const handleAbort = () => {
      if (finished) return;
      finished = true;
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
      cleanupResources();
      reject(new Error('Export cancelled.'));
    };

    if (abortSignal) {
      if (abortSignal.aborted) {
        handleAbort();
        return;
      }
      abortSignal.addEventListener('abort', handleAbort, { once: true });
    }

    recorder.onerror = () => {
      if (finished) return;
      finished = true;
      cleanupResources();
      reject(new Error('MediaRecorder encountered an encoding error.'));
    };

    recorder.onstop = () => {
      if (finished) return;
      finished = true;
      cleanupResources();

      const blob = new Blob(chunks, { type: mimeType });
      if (blob.size === 0) {
        reject(
          new Error('Export produced an empty video stream. Try again or use a different resolution.')
        );
        return;
      }
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const fileName = `bashar-frame-${settings.aspectRatio.replace(':', 'x')}-${stamp}.${format}`;
      onProgress(100, totalDurationSec, totalDurationSec);
      resolve({
        blob,
        url,
        fileName,
        fileSizeBytes: blob.size,
        durationSec: Number(totalDurationSec.toFixed(1)),
        resolution: `${stageW}x${stageH}`,
        format,
        mimeType,
      });
    };

    const renderStep = () => {
      if (finished) return;

      const elapsedSec =
        mode === 'uploaded' && exportVideoEl
          ? exportVideoEl.currentTime
          : (performance.now() - startWallMs) / 1000;

      if (mode === 'demo' && demoSourceCtx) {
        drawDemoClipFrame(
          demoSourceCtx,
          demoClipId,
          demoSourceCanvas.width,
          demoSourceCanvas.height,
          elapsedSec
        );
      }

      const sourceEl = mode === 'uploaded' ? exportVideoEl : demoSourceCanvas;

      renderChromaStage({
        ctx: exportCtx,
        stageWidth: stageW,
        stageHeight: stageH,
        source: sourceEl,
        sourceWidth:
          mode === 'uploaded' && exportVideoEl
            ? exportVideoEl.videoWidth || sourceWidth
            : demoSourceCanvas.width,
        sourceHeight:
          mode === 'uploaded' && exportVideoEl
            ? exportVideoEl.videoHeight || sourceHeight
            : demoSourceCanvas.height,
        settings,
        elapsedSeconds: elapsedSec,
      });

      if (typeof videoTrack?.requestFrame === 'function') {
        try {
          videoTrack.requestFrame();
        } catch {
          // Ignore
        }
      }

      if (previewCanvas) {
        const pCtx = previewCanvas.getContext('2d');
        if (pCtx) {
          pCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
          pCtx.drawImage(exportCanvas, 0, 0, previewCanvas.width, previewCanvas.height);
        }
      }

      const pct = Math.min(99, Math.round((elapsedSec / Math.max(0.1, totalDurationSec)) * 100));
      onProgress(pct, Math.min(elapsedSec, totalDurationSec), totalDurationSec);

      const reachedEnd =
        mode === 'uploaded' && exportVideoEl
          ? exportVideoEl.ended || elapsedSec >= totalDurationSec - 0.04
          : elapsedSec >= totalDurationSec;

      if (reachedEnd) {
        if (recorder.state === 'recording') {
          try {
            recorder.requestData();
          } catch {
            // Ignore
          }
          setTimeout(() => {
            if (recorder.state === 'recording') {
              recorder.stop();
            }
          }, 150);
        }
        return;
      }

      timerId = setTimeout(renderStep, frameIntervalMs);
    };

    recorder.start(250);

    if (exportVideoEl) {
      exportVideoEl
        .play()
        .then(() => {
          timerId = setTimeout(renderStep, 0);
        })
        .catch((err) => {
          if (exportVideoEl) {
            exportVideoEl.muted = true;
            exportVideoEl
              .play()
              .then(() => {
                timerId = setTimeout(renderStep, 0);
              })
              .catch(() => {
                if (!finished) {
                  finished = true;
                  cleanupResources();
                  reject(
                    err instanceof Error ? err : new Error('Unable to start video playback for export.')
                  );
                }
              });
          }
        });
    } else {
      timerId = setTimeout(renderStep, 0);
    }
  });
}

export function capturePngSnapshot(
  settings: BorderSettings,
  mode: 'uploaded' | 'demo',
  demoClipId: string,
  uploadedVideoElement: HTMLVideoElement | null,
  sourceWidth: number,
  sourceHeight: number,
  elapsedSeconds: number
): { url: string; fileName: string; resolution: string; sizeBytes: number } {
  const { width: stageW, height: stageH } = computeStageDimensions(
    settings.aspectRatio,
    sourceWidth,
    sourceHeight,
    1920
  );

  const canvas = document.createElement('canvas');
  canvas.width = stageW;
  canvas.height = stageH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to create snapshot canvas.');

  let source: HTMLVideoElement | HTMLCanvasElement | null = uploadedVideoElement;
  if (mode === 'demo') {
    const demoCanvas = document.createElement('canvas');
    demoCanvas.width = sourceWidth || 1280;
    demoCanvas.height = sourceHeight || 720;
    const dCtx = demoCanvas.getContext('2d');
    if (dCtx) {
      drawDemoClipFrame(dCtx, demoClipId, demoCanvas.width, demoCanvas.height, elapsedSeconds);
    }
    source = demoCanvas;
  }

  renderChromaStage({
    ctx,
    stageWidth: stageW,
    stageHeight: stageH,
    source,
    sourceWidth,
    sourceHeight,
    settings,
    elapsedSeconds,
  });

  const dataUrl = canvas.toDataURL('image/png');
  const approxBytes = Math.round((dataUrl.length * 3) / 4);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return {
    url: dataUrl,
    fileName: `bashar-frame-snapshot-${stamp}.png`,
    resolution: `${stageW}x${stageH}`,
    sizeBytes: approxBytes,
  };
}
