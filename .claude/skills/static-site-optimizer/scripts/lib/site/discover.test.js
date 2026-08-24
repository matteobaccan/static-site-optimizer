const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { discoverSites } = require('./discover');

test('finds only immediate subdirectories that contain index.html', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'discover-'));
  fs.mkdirSync(path.join(root, 'siteA'));
  fs.writeFileSync(path.join(root, 'siteA', 'index.html'), '<html></html>');
  fs.mkdirSync(path.join(root, 'siteB'));
  fs.writeFileSync(path.join(root, 'siteB', 'index.html'), '<html></html>');
  fs.mkdirSync(path.join(root, 'notASite'));
  fs.writeFileSync(path.join(root, 'readme.txt'), 'not a site');

  const result = discoverSites(root).sort();

  assert.deepStrictEqual(result, [
    path.join(root, 'siteA'),
    path.join(root, 'siteB'),
  ].sort());

  fs.rmSync(root, { recursive: true, force: true });
});

test('returns an empty array when no site is found', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'discover-empty-'));
  assert.deepStrictEqual(discoverSites(root), []);
  fs.rmSync(root, { recursive: true, force: true });
});
