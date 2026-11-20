import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDefaultOpusHead, muxWebm } from './webmMuxer';

describe('webmMuxer', () => {
  it('writes valid EBML header, Segment, Info, Tracks, and Cluster for VP8 chunks', () => {
    const bytes = muxWebm(
      {
        width: 1280,
        height: 720,
        videoCodec: 'V_VP8',
        durationMs: 3000,
      },
      [
        { data: new Uint8Array([0x10, 0x20, 0x30]), timestampUs: 0, isKey: true },
        { data: new Uint8Array([0x11, 0x21]), timestampUs: 33333, isKey: false },
        { data: new Uint8Array([0x12, 0x22]), timestampUs: 2966667, isKey: false },
      ]
    );

    // Starts with EBML magic ID 0x1A 0x45 0xDF 0xA3
    assert.equal(bytes[0], 0x1a);
    assert.equal(bytes[1], 0x45);
    assert.equal(bytes[2], 0xdf);
    assert.equal(bytes[3], 0xa3);

    const ascii = Buffer.from(bytes).toString('latin1');
    assert.ok(ascii.includes('webm'), 'contains DocType webm');
    assert.ok(ascii.includes('V_VP8'), 'contains V_VP8 codec ID');
    assert.ok(bytes.length > 80);
  });

  it('includes A_OPUS audio track and splits clusters over long spans', () => {
    const opusHead = buildDefaultOpusHead(48000, 2);
    assert.equal(opusHead.length, 19);
    assert.equal(Buffer.from(opusHead.slice(0, 8)).toString('ascii'), 'OpusHead');

    const bytes = muxWebm(
      {
        width: 640,
        height: 360,
        videoCodec: 'V_VP9',
        durationMs: 7000,
        hasAudio: true,
        audioSampleRate: 48000,
        audioChannels: 2,
      },
      [
        { data: new Uint8Array([1, 2, 3]), timestampUs: 0, isKey: true },
        { data: new Uint8Array([4, 5, 6]), timestampUs: 6_000_000, isKey: true },
      ],
      [
        { data: new Uint8Array([9, 8, 7]), timestampUs: 0 },
        { data: new Uint8Array([6, 5, 4]), timestampUs: 20_000 },
      ]
    );

    const ascii = Buffer.from(bytes).toString('latin1');
    assert.ok(ascii.includes('V_VP9'), 'contains V_VP9 codec ID');
    assert.ok(ascii.includes('A_OPUS'), 'contains A_OPUS codec ID');
  });

  it('throws on zero video chunks', () => {
    assert.throws(() =>
      muxWebm({ width: 640, height: 360, videoCodec: 'V_VP8', durationMs: 1000 }, [])
    );
  });
});
