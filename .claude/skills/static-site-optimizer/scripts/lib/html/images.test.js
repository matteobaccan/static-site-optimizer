// scripts/test/img-fixes.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fixImgTags } = require('./images');

function writeMinimalPng(filePath, width, height) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const len = [0, 0, 0, 13];
  const type = [0x49, 0x48, 0x44, 0x52];
  const w = [(width >>> 24) & 255, (width >>> 16) & 255, (width >>> 8) & 255, width & 255];
  const h = [(height >>> 24) & 255, (height >>> 16) & 255, (height >>> 8) & 255, height & 255];
  fs.writeFileSync(filePath, Buffer.from([...sig, ...len, ...type, ...w, ...h]));
}

test('adds width/height from a real image file and lazy-loads images after the first two', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-fixes-'));
  writeMinimalPng(path.join(dir, 'photo.png'), 400, 300);

  const html = [
    '<img src="photo.png" alt="uno">',
    '<img src="photo.png" alt="due">',
    '<img src="photo.png" alt="tre">',
  ].join('\n');

  const { html: fixed, findings } = fixImgTags(html, (src) => path.join(dir, src));

  assert.ok(fixed.includes('width="400"'));
  assert.ok(fixed.includes('height="300"'));
  const lazyCount = (fixed.match(/loading="lazy"/g) || []).length;
  assert.strictEqual(lazyCount, 1);
  assert.strictEqual(findings.filter((f) => f.code === 'missing-img-dimensions').length, 3);
  assert.strictEqual(findings.filter((f) => f.code === 'missing-lazy-loading').length, 1);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('skips dimensions when the image cannot be resolved', () => {
  const html = '<img src="https://cdn.example.com/a.png" alt="remote">';
  const { html: fixed, findings } = fixImgTags(html, () => null);

  assert.strictEqual(fixed, '<img src="https://cdn.example.com/a.png" alt="remote">');
  assert.strictEqual(findings.length, 0);
});

test('is idempotent when width/height/loading are already present', () => {
  const html = '<img src="a.png" width="10" height="10" loading="lazy">';
  const { html: fixed, findings } = fixImgTags(html, () => null);

  assert.strictEqual(fixed, html);
  assert.strictEqual(findings.length, 0);
});
