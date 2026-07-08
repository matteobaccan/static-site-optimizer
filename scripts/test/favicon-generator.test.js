const { test } = require('node:test');
const assert = require('node:assert');
const { generateFaviconIco } = require('../lib/favicon-generator');

test('generates a structurally valid single-image 32x32 32bpp ICO', () => {
  const buf = generateFaviconIco('S', '#1a1a2e', '#e94560');

  assert.strictEqual(buf.readUInt16LE(0), 0); // reserved
  assert.strictEqual(buf.readUInt16LE(2), 1); // type = icon
  assert.strictEqual(buf.readUInt16LE(4), 1); // image count
  assert.strictEqual(buf.readUInt8(6), 32); // width
  assert.strictEqual(buf.readUInt8(7), 32); // height
  assert.strictEqual(buf.readUInt16LE(14), 32); // bit count
  assert.strictEqual(buf.length, 4286);
});

test('falls back to a default glyph for unsupported characters without throwing', () => {
  const buf = generateFaviconIco('!', '#000000', '#ffffff');
  assert.strictEqual(buf.length, 4286);
});

test('is case-insensitive for letters', () => {
  const upper = generateFaviconIco('A', '#000000', '#ffffff');
  const lower = generateFaviconIco('a', '#000000', '#ffffff');
  assert.ok(upper.equals(lower));
});
