// scripts/test/image-dimensions.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { getImageDimensions } = require('./dimensions');

function buildMinimalPng(width, height) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const len = [0, 0, 0, 13];
  const type = [0x49, 0x48, 0x44, 0x52]; // "IHDR"
  const w = [(width >>> 24) & 255, (width >>> 16) & 255, (width >>> 8) & 255, width & 255];
  const h = [(height >>> 24) & 255, (height >>> 16) & 255, (height >>> 8) & 255, height & 255];
  return Buffer.from([...sig, ...len, ...type, ...w, ...h]);
}

function buildMinimalGif(width, height) {
  const sig = Buffer.from('GIF89a', 'ascii');
  const dims = Buffer.alloc(4);
  dims.writeUInt16LE(width, 0);
  dims.writeUInt16LE(height, 2);
  return Buffer.concat([sig, dims]);
}

test('reads PNG dimensions from the IHDR chunk', () => {
  assert.deepStrictEqual(getImageDimensions(buildMinimalPng(640, 480)), { width: 640, height: 480 });
});

test('reads GIF dimensions from the logical screen descriptor', () => {
  assert.deepStrictEqual(getImageDimensions(buildMinimalGif(320, 240)), { width: 320, height: 240 });
});

test('reads JPEG dimensions from the SOF0 marker', () => {
  const buf = Buffer.from([
    0xff, 0xd8, // SOI
    0xff, 0xc0, // SOF0
    0x00, 0x11, // length = 17
    0x08, // precision
    0x00, 0x64, // height = 100
    0x00, 0xc8, // width = 200
    0x03, // num components
    0x01, 0x22, 0x00,
    0x02, 0x11, 0x01,
    0x03, 0x11, 0x01,
    0xff, 0xd9, // EOI
  ]);
  assert.deepStrictEqual(getImageDimensions(buf), { width: 200, height: 100 });
});

test('returns null for unrecognized formats', () => {
  assert.strictEqual(getImageDimensions(Buffer.from('not an image')), null);
});
