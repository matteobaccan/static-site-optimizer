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

const cliPath = path.join(__dirname, 'optimize.js');

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
  // Regression guard: document/img/link findings must not claim autoFixed:true
  // when nothing was actually written to disk (report-only mode).
  assert.ok(
    reportOnly.findings.every((f) => f.autoFixed === false),
    'report-only run must report autoFixed:false for every finding',
  );

  const fixed = JSON.parse(execFileSync('node', [cliPath, dir, '--fix'], { encoding: 'utf8' }));

  assert.ok(fs.existsSync(path.join(dir, 'robots.txt')));
  assert.ok(fs.existsSync(path.join(dir, 'sitemap.xml')));
  assert.ok(fs.existsSync(path.join(dir, 'README.md')));
  assert.ok(fs.existsSync(path.join(dir, 'llms.txt')));
  assert.ok(fs.existsSync(path.join(dir, 'favicon.ico')));
  const fixedHtml = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.ok(fixedHtml.includes('charset="UTF-8"'));
  assert.ok(fixedHtml.includes('width="10"'));
  // The same regression guard, inverted: once files are actually written,
  // autoFixed must reflect that reality too.
  assert.strictEqual(fixed.findings.find((f) => f.code === 'missing-charset').autoFixed, true);
  assert.strictEqual(fixed.findings.find((f) => f.code === 'missing-img-dimensions').autoFixed, true);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('fixes every page of a multi-page site and lists them all in the sitemap', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-multipage-'));
  fs.mkdirSync(path.join(dir, 'blog'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<html><head><title>Demo</title></head><body></body></html>');
  fs.writeFileSync(path.join(dir, 'blog', 'post.html'), '<html><head><title>Post</title></head><body></body></html>');

  execFileSync('node', [cliPath, dir, '--fix'], { encoding: 'utf8' });

  assert.ok(fs.readFileSync(path.join(dir, 'blog', 'post.html'), 'utf8').includes('charset="UTF-8"'),
    'a page outside the site root must be fixed too');

  const sitemap = fs.readFileSync(path.join(dir, 'sitemap.xml'), 'utf8');
  assert.ok(sitemap.includes('index.html'));
  assert.ok(sitemap.includes('blog/post.html'));

  fs.rmSync(dir, { recursive: true, force: true });
});

test('reports external resources and trackers without any network access', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-external-'));
  fs.writeFileSync(path.join(dir, 'index.html'), [
    '<html><head><title>Demo</title>',
    '<link rel="preconnect" href="https://fonts.gstatic.com">',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">',
    '<script src="https://www.googletagmanager.com/gtag/js?id=G-1"></script>',
    '</head><body>',
    '<iframe src="https://www.google.com/maps/embed?pb=1"></iframe>',
    '</body></html>',
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'index.css'), "@import url('https://fonts.googleapis.com/css2?family=Lato');\nbody{}");

  const report = JSON.parse(execFileSync('node', [cliPath, dir], { encoding: 'utf8' }));
  const codes = report.findings.map((f) => f.code);

  assert.strictEqual(report.mode, 'report');
  assert.ok(codes.includes('external-resource'), 'the Google Fonts stylesheet must be reported');
  assert.ok(codes.includes('external-tracker'), 'gtag must be reported as a tracker');
  assert.ok(codes.includes('third-party-embed'), 'the maps iframe must be reported as an embed');
  assert.ok(codes.includes('stale-preconnect'));
  assert.ok(report.summary.externalRefsRemaining >= 2, 'both the html and the css ref must be counted');

  // Report mode is strictly read-only, external refs included.
  assert.ok(fs.readFileSync(path.join(dir, 'index.css'), 'utf8').includes('fonts.googleapis.com'));

  fs.rmSync(dir, { recursive: true, force: true });
});

test('never rewrites an outbound link or an embed, even with --fix', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-untouched-'));
  fs.writeFileSync(path.join(dir, 'index.html'), [
    '<html><head><title>Demo</title></head><body>',
    '<a href="https://partner.example.com/page">partner</a>',
    '<iframe src="https://www.youtube.com/embed/xyz"></iframe>',
    '</body></html>',
  ].join('\n'));

  execFileSync('node', [cliPath, dir, '--fix'], { encoding: 'utf8' });
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');

  assert.ok(html.includes('href="https://partner.example.com/page"'));
  assert.ok(html.includes('src="https://www.youtube.com/embed/xyz"'));

  fs.rmSync(dir, { recursive: true, force: true });
});

test('resolves image paths from the right base on a nested page', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-imgpaths-'));
  fs.mkdirSync(path.join(dir, 'blog'));
  fs.mkdirSync(path.join(dir, 'img'));
  writeMinimalPng(path.join(dir, 'img', 'root.png'), 40, 20);
  writeMinimalPng(path.join(dir, 'blog', 'local.png'), 11, 22);
  fs.writeFileSync(path.join(dir, 'index.html'), '<html><head><title>D</title></head><body></body></html>');
  fs.writeFileSync(path.join(dir, 'blog', 'post.html'),
    '<html><head><title>P</title></head><body><img src="/img/root.png"><img src="local.png"></body></html>');

  execFileSync('node', [cliPath, dir, '--fix'], { encoding: 'utf8' });
  const html = fs.readFileSync(path.join(dir, 'blog', 'post.html'), 'utf8');

  assert.match(html, /src="\/img\/root\.png"[^>]*width="40"/, 'a root-relative src resolves from the site root');
  assert.match(html, /src="local\.png"[^>]*width="11"/, 'a plain relative src resolves from the page folder');

  fs.rmSync(dir, { recursive: true, force: true });
});

const ITALIAN_PROSE = `Siamo uno studio di psicologia che si occupa di terapia per adulti e
  adolescenti. Il nostro approccio è centrato sulla persona e sulle sue risorse, non solo sui
  sintomi che la portano da noi. Offriamo percorsi individuali e di coppia, con colloqui che si
  svolgono in studio oppure online, e vi rispondiamo entro pochi giorni.`;

test('--detect-lang reports what the site declares about itself', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-detect-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<html lang="it-IT"><head><title>D</title></head><body></body></html>');

  const out = JSON.parse(execFileSync('node', [cliPath, dir, '--detect-lang'], { encoding: 'utf8' }));

  assert.strictEqual(out.lang, 'it');
  assert.strictEqual(out.source, 'html-lang');
  assert.strictEqual(out.confidence, 'high');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('applies a language another page of the same site already declares', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-langfromsite-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<html lang="it"><head><title>D</title></head><body></body></html>');
  fs.writeFileSync(path.join(dir, 'contatti.html'), '<html><head><title>C</title></head><body></body></html>');

  execFileSync('node', [cliPath, dir, '--fix'], { encoding: 'utf8' });

  assert.ok(
    fs.readFileSync(path.join(dir, 'contatti.html'), 'utf8').includes('<html lang="it">'),
    'a language the site declares elsewhere is evidence, not a guess',
  );

  fs.rmSync(dir, { recursive: true, force: true });
});

test('suggests a language from the text but refuses to write it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-langguess-'));
  fs.writeFileSync(path.join(dir, 'index.html'), `<html><head><title>D</title></head><body><p>${ITALIAN_PROSE}</p></body></html>`);

  const report = JSON.parse(execFileSync('node', [cliPath, dir, '--fix'], { encoding: 'utf8' }));
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');

  assert.strictEqual(report.language.applied, false);
  assert.strictEqual(report.language.suggestion, 'it', 'the text heuristic should still surface a proposal');
  assert.ok(!html.includes('lang='), 'a text-only guess must never be written into the file');
  assert.strictEqual(report.findings.find((f) => f.code === 'missing-lang').autoFixed, false);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('an explicit --lang overrides what the site declares', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-langflag-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<html lang="it"><head><title>D</title></head><body></body></html>');
  fs.writeFileSync(path.join(dir, 'en.html'), '<html><head><title>E</title></head><body></body></html>');

  const report = JSON.parse(execFileSync('node', [cliPath, dir, '--fix', '--lang', 'de'], { encoding: 'utf8' }));

  assert.strictEqual(report.language.source, 'flag');
  assert.ok(fs.readFileSync(path.join(dir, 'en.html'), 'utf8').includes('<html lang="de">'));

  fs.rmSync(dir, { recursive: true, force: true });
});
