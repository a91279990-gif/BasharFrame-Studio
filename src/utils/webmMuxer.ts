/**
 * Minimal, spec-compliant WebM (EBML/Matroska) muxer for WebCodecs EncodedVideoChunk
 * (VP8 / VP9) and optional EncodedAudioChunk (Opus).
 */

export interface MuxedVideoChunk {
  data: Uint8Array;
  timestampUs: number;
  isKey: boolean;
}

export interface MuxedAudioChunk {
  data: Uint8Array;
  timestampUs: number;
}

export interface WebmMuxerOptions {
  width: number;
  height: number;
  videoCodec: 'V_VP8' | 'V_VP9';
  durationMs: number;
  hasAudio?: boolean;
  audioSampleRate?: number;
  audioChannels?: number;
  opusCodecPrivate?: Uint8Array;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function encodeVintSize(size: number): Uint8Array {
  if (size < 0) throw new Error(`Negative EBML size: ${size}`);
  if (size < 0x7f) {
    return new Uint8Array([0x80 | size]);
  }
  if (size < 0x3fff) {
    return new Uint8Array([0x40 | (size >> 8), size & 0xff]);
  }
  if (size < 0x1fffff) {
    return new Uint8Array([0x20 | (size >> 16), (size >> 8) & 0xff, size & 0xff]);
  }
  if (size < 0x0fffffff) {
    return new Uint8Array([
      0x10 | (size >>> 24),
      (size >>> 16) & 0xff,
      (size >>> 8) & 0xff,
      size & 0xff,
    ]);
  }
  // 8-byte VINT fallback for >256MB segments
  const big = BigInt(size);
  const out = new Uint8Array(8);
  out[0] = 0x01;
  for (let i = 7; i >= 1; i--) {
    out[i] = Number((big >> BigInt((7 - i) * 8)) & 0xffn);
  }
  return out;
}

function encodeUint(value: number): Uint8Array {
  if (value === 0) return new Uint8Array([0]);
  const bytes: number[] = [];
  let v = Math.floor(value);
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v = Math.floor(v / 256);
  }
  return new Uint8Array(bytes);
}

function encodeFloat64(value: number): Uint8Array {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, value, false);
  return new Uint8Array(buf);
}

function encodeAscii(str: string): Uint8Array {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    out[i] = str.charCodeAt(i) & 0xff;
  }
  return out;
}

function ebmlElement(idBytes: number[], payload: Uint8Array): Uint8Array {
  const id = new Uint8Array(idBytes);
  const size = encodeVintSize(payload.length);
  return concatBytes([id, size, payload]);
}

function ebmlMaster(idBytes: number[], children: Uint8Array[]): Uint8Array {
  return ebmlElement(idBytes, concatBytes(children));
}

export function buildDefaultOpusHead(sampleRate = 48000, channels = 2): Uint8Array {
  const buf = new ArrayBuffer(19);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  bytes.set(encodeAscii('OpusHead'), 0);
  view.setUint8(8, 1); // version
  view.setUint8(9, channels);
  view.setUint16(10, 312, true); // pre-skip (6.5ms @ 48kHz)
  view.setUint32(12, sampleRate, true);
  view.setInt16(16, 0, true); // output gain
  view.setUint8(18, 0); // channel mapping family
  return bytes;
}

function buildSimpleBlock(
  trackNumber: number,
  relativeTimestampMs: number,
  isKey: boolean,
  payload: Uint8Array
): Uint8Array {
  const block = new Uint8Array(4 + payload.length);
  block[0] = 0x80 | trackNumber; // 1-byte VINT track number
  const clamped = Math.max(-32768, Math.min(32767, Math.round(relativeTimestampMs)));
  block[1] = (clamped >> 8) & 0xff;
  block[2] = clamped & 0xff;
  block[3] = isKey ? 0x80 : 0x00;
  block.set(payload, 4);
  return ebmlElement([0xa3], block);
}

export function muxWebm(
  options: WebmMuxerOptions,
  videoChunks: MuxedVideoChunk[],
  audioChunks: MuxedAudioChunk[] = []
): Uint8Array {
  if (videoChunks.length === 0) {
    throw new Error('Cannot mux WebM with zero video chunks.');
  }

  const ebmlHeader = ebmlMaster([0x1a, 0x45, 0xdf, 0xa3], [
    ebmlElement([0x42, 0x86], encodeUint(1)), // EBMLVersion
    ebmlElement([0x42, 0xf7], encodeUint(1)), // EBMLReadVersion
    ebmlElement([0x42, 0xf2], encodeUint(4)), // EBMLMaxIDLength
    ebmlElement([0x42, 0xf3], encodeUint(8)), // EBMLMaxSizeLength
    ebmlElement([0x42, 0x82], encodeAscii('webm')), // DocType
    ebmlElement([0x42, 0x87], encodeUint(4)), // DocTypeVersion
    ebmlElement([0x42, 0x85], encodeUint(2)), // DocTypeReadVersion
  ]);

  const info = ebmlMaster([0x15, 0x49, 0xa9, 0x66], [
    ebmlElement([0x2a, 0xd7, 0xb1], encodeUint(1_000_000)), // TimestampScale: 1ms
    ebmlElement([0x4d, 0x80], encodeAscii('Bashar Frame Studio')), // MuxingApp
    ebmlElement([0x57, 0x41], encodeAscii('Bashar Frame Studio WebCodecs')), // WritingApp
    ebmlElement([0x44, 0x89], encodeFloat64(Math.max(1, options.durationMs))), // Duration
  ]);

  const videoTrack = ebmlMaster([0xae], [
    ebmlElement([0xd7], encodeUint(1)), // TrackNumber
    ebmlElement([0x73, 0xc5], encodeUint(1)), // TrackUID
    ebmlElement([0x83], encodeUint(1)), // TrackType: video
    ebmlElement([0x9c], encodeUint(0)), // FlagLacing: 0
    ebmlElement([0x86], encodeAscii(options.videoCodec)), // CodecID
    ebmlMaster([0xe0], [
      ebmlElement([0xb0], encodeUint(options.width)), // PixelWidth
      ebmlElement([0xba], encodeUint(options.height)), // PixelHeight
    ]),
  ]);

  const trackEntries: Uint8Array[] = [videoTrack];

  if (options.hasAudio && audioChunks.length > 0) {
    const sampleRate = options.audioSampleRate || 48000;
    const channels = options.audioChannels || 2;
    const codecPrivate = options.opusCodecPrivate || buildDefaultOpusHead(sampleRate, channels);
    const audioTrack = ebmlMaster([0xae], [
      ebmlElement([0xd7], encodeUint(2)), // TrackNumber
      ebmlElement([0x73, 0xc5], encodeUint(2)), // TrackUID
      ebmlElement([0x83], encodeUint(2)), // TrackType: audio
      ebmlElement([0x9c], encodeUint(0)), // FlagLacing: 0
      ebmlElement([0x86], encodeAscii('A_OPUS')), // CodecID
      ebmlElement([0x63, 0xa2], codecPrivate), // CodecPrivate
      ebmlElement([0x56, 0xaa], encodeUint(6_500_000)), // CodecDelay (6.5ms in ns)
      ebmlElement([0x56, 0xbb], encodeUint(80_000_000)), // SeekPreRoll (80ms in ns)
      ebmlMaster([0xe1], [
        ebmlElement([0xb5], encodeFloat64(sampleRate)), // SamplingFrequency
        ebmlElement([0x9f], encodeUint(channels)), // Channels
        ebmlElement([0x62, 0x64], encodeUint(16)), // BitDepth
      ]),
    ]);
    trackEntries.push(audioTrack);
  }

  const tracks = ebmlMaster([0x16, 0x54, 0xae, 0x6b], trackEntries);

  // Interleave video & audio packets in ascending timestamp order
  type Packet = {
    trackNumber: 1 | 2;
    timestampMs: number;
    isKey: boolean;
    data: Uint8Array;
  };
  const packets: Packet[] = [];
  for (const vc of videoChunks) {
    packets.push({
      trackNumber: 1,
      timestampMs: Math.max(0, Math.round(vc.timestampUs / 1000)),
      isKey: vc.isKey,
      data: vc.data,
    });
  }
  if (options.hasAudio && audioChunks.length > 0) {
    for (const ac of audioChunks) {
      packets.push({
        trackNumber: 2,
        timestampMs: Math.max(0, Math.round(ac.timestampUs / 1000)),
        isKey: true,
        data: ac.data,
      });
    }
  }
  packets.sort((a, b) => a.timestampMs - b.timestampMs || a.trackNumber - b.trackNumber);

  // Split packets into Clusters (start new cluster on video keyframe or > 5s span)
  const clusters: Uint8Array[] = [];
  let currentClusterStartMs = packets[0].timestampMs;
  let currentBlocks: Uint8Array[] = [];

  const flushCluster = () => {
    if (currentBlocks.length === 0) return;
    clusters.push(
      ebmlMaster([0x1f, 0x43, 0xb6, 0x75], [
        ebmlElement([0xe7], encodeUint(currentClusterStartMs)), // Cluster Timestamp
        ...currentBlocks,
      ])
    );
    currentBlocks = [];
  };

  for (const pkt of packets) {
    const startsNewCluster =
      currentBlocks.length > 0 &&
      ((pkt.trackNumber === 1 && pkt.isKey && pkt.timestampMs - currentClusterStartMs >= 1000) ||
        pkt.timestampMs - currentClusterStartMs >= 5000);

    if (startsNewCluster) {
      flushCluster();
      currentClusterStartMs = pkt.timestampMs;
    }

    currentBlocks.push(
      buildSimpleBlock(pkt.trackNumber, pkt.timestampMs - currentClusterStartMs, pkt.isKey, pkt.data)
    );
  }
  flushCluster();

  const segment = ebmlMaster([0x18, 0x53, 0x80, 0x67], [info, tracks, ...clusters]);
  return concatBytes([ebmlHeader, segment]);
}
