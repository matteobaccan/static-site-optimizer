const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function writeMinimalPng(filePath, width, height) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const len = [0, 0, 0, 13];
  const type = [0x49, 0x48, 0x44, 0x52];
  const w = [(width >>> 24) & 255, (width >>> 16) & 255, (width >>> 8) & 255, width & 255];
  const h = [(height >>> 24) & 255, (height >>> 16) & 255, (height >>> 8) & 255, height & 255];
  fs.writeFileSync(filePath, Buffer.from([...sig, ...len, ...type, ...w, ...h]));
}

const cliPath = path.join(__dirname, '..', 'static-audit.js');

test('--discover finds sites under a root directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-discover-'));
  fs.mkdirSync(path.join(root, 'siteA'));
  fs.writeFileSync(path.join(root, 'siteA', 'index.html'), '<html></html>');

  const out = execFileSync('node', [cliPath, '--discover', root], { encoding: 'utf8' });
  const parsed = JSON.parse(out);

  assert.deepStrictEqual(parsed.sites, [path.join(root, 'siteA')]);
  fs.rmSync(root, { recursive: true, force: true });
});

test('reports findings without writing files, then applies fixes with --fix', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-site-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<html><head><title>Demo</title></head><body><img src="a.png"></body></html>');
  writeMinimalPng(path.join(dir, 'a.png'), 10, 10);

  const reportOnly = JSON.parse(execFileSync('node', [cliPath, dir], { encoding: 'utf8' }));
  assert.ok(reportOnly.findings.some((f) => f.code === 'missing-charset'));
  assert.ok(reportOnly.findings.some((f) => f.code === 'missing-favicon'));
  assert.ok(!fs.existsSync(path.join(dir, 'robots.txt')), 'report-only run must not write files');

  execFileSync('node', [cliPath, dir, '--fix'], { encoding: 'utf8' });

  assert.ok(fs.existsSync(path.join(dir, 'robots.txt')));
  assert.ok(fs.existsSync(path.join(dir, 'sitemap.xml')));
  assert.ok(fs.existsSync(path.join(dir, 'README.md')));
  assert.ok(fs.existsSync(path.join(dir, 'llms.txt')));
  assert.ok(fs.existsSync(path.join(dir, 'favicon.ico')));
  const fixedHtml = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.ok(fixedHtml.includes('charset="UTF-8"'));
  assert.ok(fixedHtml.includes('width="10"'));

  fs.rmSync(dir, { recursive: true, force: true });
});
