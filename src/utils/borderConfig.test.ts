import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILTIN_PALETTES,
  DEFAULT_BORDER_SETTINGS,
  clampSettings,
  computeFrameGeometry,
  computeRotationAngleRad,
  computeStageDimensions,
  formatBytes,
  formatTimecode,
  validatePresetInput,
} from './borderConfig';

test('clampSettings enforces blueprint limits and sanitizes invalid values', () => {
  const clamped = clampSettings({
    borderWidth: 999,
    glowSpread: -10,
    glowIntensity: 5,
    cornerRadius: 200,
    stageMargin: 2,
    rotationSpeed: 99,
    colors: ['#123456', 'not-a-hex', '#abcdef', '#111111', '#222222', '#333333', '#444444'],
    backdropColor: 'bad-color',
    direction: 'ccw',
    aspectRatio: '9:16',
  });

  assert.equal(clamped.borderWidth, 32);
  assert.equal(clamped.glowSpread, 0);
  assert.equal(clamped.glowIntensity, 1);
  assert.equal(clamped.cornerRadius, 64);
  assert.equal(clamped.stageMargin, 16);
  assert.equal(clamped.rotationSpeed, 5);
  assert.equal(clamped.colors.length, 6);
  assert.equal(clamped.colors[0], '#123456');
  assert.match(clamped.colors[1], /^#[0-9A-F]{6}$/);
  assert.equal(clamped.backdropColor, '#0B0B0E');
  assert.equal(clamped.direction, 'ccw');
  assert.equal(clamped.aspectRatio, '9:16');
});

test('computeStageDimensions returns even codec-friendly dimensions for all aspect ratios', () => {
  const landscape = computeStageDimensions('16:9', 1920, 1080, 1280);
  assert.equal(landscape.width, 1280);
  assert.equal(landscape.height, 720);
  assert.equal(landscape.width % 2, 0);
  assert.equal(landscape.height % 2, 0);

  const vertical = computeStageDimensions('9:16', 1920, 1080, 1280);
  assert.equal(vertical.width, 720);
  assert.equal(vertical.height, 1280);

  const square = computeStageDimensions('1:1', 1920, 1080, 1080);
  assert.equal(square.width, 1080);
  assert.equal(square.height, 1080);
});

test('computeFrameGeometry places border strictly outside the video frame with non-negative margins', () => {
  const geom = computeFrameGeometry(1280, 720, 1920, 1080, DEFAULT_BORDER_SETTINGS, 960);
  assert.ok(geom.frameX > geom.borderWidth, 'frameX must leave room for outer border');
  assert.ok(geom.frameY > geom.borderWidth, 'frameY must leave room for outer border');
  assert.ok(geom.outerRadius > geom.innerRadius, 'outer radius must exceed inner radius');
  assert.equal(geom.drawX, geom.frameX);
  assert.equal(geom.drawY, geom.frameY);
  assert.equal(geom.drawW, geom.frameW);
  assert.equal(geom.drawH, geom.frameH);
});

test('computeRotationAngleRad respects direction and speed', () => {
  const cw = computeRotationAngleRad(1, 1, 'cw');
  const ccw = computeRotationAngleRad(1, 1, 'ccw');
  assert.ok(cw > 0);
  assert.equal(ccw, -cw);
  assert.equal(computeRotationAngleRad(2, 0, 'cw'), 0);
});

test('validatePresetInput rejects empty names and trims valid names', () => {
  const invalid = validatePresetInput('   ', DEFAULT_BORDER_SETTINGS);
  assert.equal(invalid.valid, false);

  const valid = validatePresetInput('  My Neon Frame  ', BUILTIN_PALETTES[0] ? DEFAULT_BORDER_SETTINGS : DEFAULT_BORDER_SETTINGS);
  assert.equal(valid.valid, true);
  assert.equal(valid.name, 'My Neon Frame');
});

test('formatBytes and formatTimecode format human-readable strings', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1024 * 1024 * 2.5), '2.5 MB');
  assert.equal(formatTimecode(0), '00:00');
  assert.equal(formatTimecode(65), '01:05');
});
