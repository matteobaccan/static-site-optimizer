# Auditing Static Sites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the personal skill `auditing-static-sites` that audits every static HTML/CSS/JS site in a folder, applies safe mechanical fixes automatically, and produces a per-site report plus an aggregated dashboard.

**Architecture:** A dependency-free Node CLI (`scripts/static-audit.js`) built from small pure, unit-tested library modules under `scripts/lib/` performs discovery and mechanical checks/fixes. `SKILL.md` orchestrates: it dispatches one Agent per discovered site to run the CLI, run Lighthouse, apply on-demand `npx` image compression, write `AUDIT.md`, then aggregates all results into an Artifact dashboard. Code modules are tested with Node's built-in test runner (`node:test`); `SKILL.md` itself is tested with the pressure-scenario methodology from `superpowers:writing-skills`.

**Tech Stack:** Node.js (v26.4.0 confirmed available, native `fetch` and `node:test`), zero npm dependencies for the skill's own code. On-demand `npx` tools invoked as documented shell commands (not code dependencies): `npx lighthouse` (confirmed working, v13.4.0), `npx serve`, `npx sharp-cli` (confirmed working, supports `-i <file> -o <dir> -q <quality>`).

## Global Constraints

- Zero npm dependencies in the skill's own `package.json` (there is no `package.json` — plain `.js` files run directly with `node`).
- Network access only via Node's built-in global `fetch`; no third-party HTTP client libraries.
- No git commit or push is ever performed by the skill or its scripts.
- `<a href="...">` outbound links and third-party embeds (Google Maps / YouTube iframes) are never modified or flagged — only resource-loading tags (`<img>`, `<link>`, `@import`, `<script src>`) are in scope for the "external resources" check.
- All fixes are applied directly to files served statically; there is no build step to invert.

---

## Task 1: Site discovery

**Files:**
- Create: `scripts/lib/discover-sites.js`
- Test: `scripts/test/discover-sites.test.js`

**Interfaces:**
- Produces: `discoverSites(rootDir: string): string[]` — absolute paths of immediate subdirectories of `rootDir` that directly contain an `index.html`.

- [ ] **Step 1: Write the failing test**

```js
// scripts/test/discover-sites.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { discoverSites } = require('../lib/discover-sites');

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/test/discover-sites.test.js`
Expected: FAIL with "Cannot find module '../lib/discover-sites'"

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/discover-sites.js
const fs = require('node:fs');
const path = require('node:path');

function discoverSites(rootDir) {
  return fs.readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(rootDir, entry.name))
    .filter((dir) => fs.existsSync(path.join(dir, 'index.html')));
}

module.exports = { discoverSites };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/test/discover-sites.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/discover-sites.js scripts/test/discover-sites.test.js
git commit -m "feat: add static site discovery"
```

---

## Task 2: HTML opening-tag parser utility

**Files:**
- Create: `scripts/lib/html-tags.js`
- Test: `scripts/test/html-tags.test.js`

**Interfaces:**
- Produces:
  - `findTags(html: string, tagName: string): Array<{ raw: string, attrs: Record<string, string|null>, start: number, end: number, selfClosing: boolean }>` — locates every opening tag for `tagName` (case-insensitive). Only the opening tag is matched, not its children/closing tag.
  - `stringifyTag(tagName: string, attrs: Record<string, string|null>, selfClosing: boolean): string`
  - `replaceRange(html: string, start: number, end: number, replacement: string): string`

- [ ] **Step 1: Write the failing test**

```js
// scripts/test/html-tags.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { findTags, stringifyTag, replaceRange } = require('../lib/html-tags');

test('finds tags and parses quoted, unquoted, and boolean attributes', () => {
  const html = '<img src="a.png" alt=\'hi\' data-x=1 loading>';
  const [tag] = findTags(html, 'img');
  assert.strictEqual(tag.raw, html);
  assert.strictEqual(tag.start, 0);
  assert.strictEqual(tag.end, html.length);
  assert.strictEqual(tag.selfClosing, false);
  assert.deepStrictEqual(tag.attrs, { src: 'a.png', alt: 'hi', 'data-x': '1', loading: null });
});

test('does not match tags with a similar but different name', () => {
  const html = '<imgx src="a.png">';
  assert.deepStrictEqual(findTags(html, 'img'), []);
});

test('finds self-closing tags', () => {
  const html = '<img src="a.png" />';
  const [tag] = findTags(html, 'img');
  assert.strictEqual(tag.selfClosing, true);
});

test('finds multiple tags in document order', () => {
  const html = '<a href="/one">one</a><a href="/two" target="_blank">two</a>';
  const tags = findTags(html, 'a');
  assert.strictEqual(tags.length, 2);
  assert.strictEqual(tags[0].attrs.href, '/one');
  assert.strictEqual(tags[1].attrs.href, '/two');
});

test('stringifyTag renders quoted attributes and bare boolean attributes', () => {
  const raw = stringifyTag('img', { src: 'a.png', alt: '', loading: null }, false);
  assert.strictEqual(raw, '<img src="a.png" alt="" loading>');
});

test('stringifyTag renders self-closing tags', () => {
  const raw = stringifyTag('img', { src: 'a.png' }, true);
  assert.strictEqual(raw, '<img src="a.png" />');
});

test('replaceRange splices a substring using start/end indices', () => {
  const result = replaceRange('abcdef', 2, 4, 'XY');
  assert.strictEqual(result, 'abXYef');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/test/html-tags.test.js`
Expected: FAIL with "Cannot find module '../lib/html-tags'"

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/html-tags.js
const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function parseAttrs(attrString) {
  const attrs = {};
  let match;
  ATTR_RE.lastIndex = 0;
  while ((match = ATTR_RE.exec(attrString)) !== null) {
    const [, name, dq, sq, uq] = match;
    attrs[name] = dq !== undefined ? dq : sq !== undefined ? sq : uq !== undefined ? uq : null;
  }
  return attrs;
}

function findTags(html, tagName) {
  const re = new RegExp(`<${tagName}(\\s[^>]*)?(/?)>`, 'gi');
  const results = [];
  let match;
  while ((match = re.exec(html)) !== null) {
    const attrString = match[1] || '';
    results.push({
      raw: match[0],
      attrs: parseAttrs(attrString),
      start: match.index,
      end: match.index + match[0].length,
      selfClosing: match[2] === '/',
    });
  }
  return results;
}

function stringifyTag(tagName, attrs, selfClosing) {
  const parts = [tagName];
  for (const [key, value] of Object.entries(attrs)) {
    parts.push(value === null ? key : `${key}="${value}"`);
  }
  return `<${parts.join(' ')}${selfClosing ? ' />' : '>'}`;
}

function replaceRange(html, start, end, replacement) {
  return html.slice(0, start) + replacement + html.slice(end);
}

module.exports = { findTags, stringifyTag, replaceRange, parseAttrs };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/test/html-tags.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/html-tags.js scripts/test/html-tags.test.js
git commit -m "feat: add HTML opening-tag parser utility"
```

---

## Task 3: Document-level meta fixes (charset, viewport, lang)

**Files:**
- Create: `scripts/lib/document-checks.js`
- Test: `scripts/test/document-checks.test.js`

**Interfaces:**
- Consumes: `findTags`, `stringifyTag`, `replaceRange` from `../lib/html-tags` (Task 2).
- Produces: `checkAndFixDocumentMeta(html: string): { html: string, findings: Finding[] }` where `Finding = { code: string, category: 'seo'|'accessibility'|'performance'|'code-quality', autoFixed: boolean, message: string }` (this exact shape is used by every check/fix module in this plan).

- [ ] **Step 1: Write the failing test**

```js
// scripts/test/document-checks.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { checkAndFixDocumentMeta } = require('../lib/document-checks');

test('adds missing lang, charset, and viewport', () => {
  const html = '<html><head><title>Test</title></head><body></body></html>';
  const { html: fixed, findings } = checkAndFixDocumentMeta(html);

  assert.ok(fixed.includes('<html lang="it">'));
  assert.ok(fixed.includes('<meta charset="UTF-8">'));
  assert.ok(fixed.includes('name="viewport"'));
  assert.strictEqual(findings.length, 3);
  assert.deepStrictEqual(findings.map((f) => f.code).sort(), ['missing-charset', 'missing-lang', 'missing-viewport'].sort());
  assert.ok(findings.every((f) => f.autoFixed === true));
});

test('does not duplicate tags that already exist', () => {
  const html = '<html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>';
  const { html: fixed, findings } = checkAndFixDocumentMeta(html);

  assert.strictEqual(fixed, html);
  assert.strictEqual(findings.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/test/document-checks.test.js`
Expected: FAIL with "Cannot find module '../lib/document-checks'"

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/document-checks.js
const { findTags, stringifyTag, replaceRange } = require('./html-tags');

function checkAndFixDocumentMeta(html) {
  const findings = [];
  let result = html;

  const htmlTags = findTags(result, 'html');
  if (htmlTags.length > 0 && !('lang' in htmlTags[0].attrs)) {
    const tag = htmlTags[0];
    const newRaw = stringifyTag('html', { ...tag.attrs, lang: 'it' }, tag.selfClosing);
    result = replaceRange(result, tag.start, tag.end, newRaw);
    findings.push({ code: 'missing-lang', category: 'accessibility', autoFixed: true, message: 'Attributo lang mancante su <html>, impostato a "it"' });
  }

  const hasCharset = findTags(result, 'meta').some((tag) => 'charset' in tag.attrs);
  if (!hasCharset) {
    const [head] = findTags(result, 'head');
    if (head) {
      result = replaceRange(result, head.end, head.end, '\n  <meta charset="UTF-8">');
      findings.push({ code: 'missing-charset', category: 'seo', autoFixed: true, message: 'Meta charset mancante, aggiunto UTF-8' });
    }
  }

  const hasViewport = findTags(result, 'meta').some((tag) => (tag.attrs.name || '').toLowerCase() === 'viewport');
  if (!hasViewport) {
    const [head] = findTags(result, 'head');
    if (head) {
      result = replaceRange(result, head.end, head.end, '\n  <meta name="viewport" content="width=device-width, initial-scale=1">');
      findings.push({ code: 'missing-viewport', category: 'seo', autoFixed: true, message: 'Meta viewport mancante, aggiunto' });
    }
  }

  return { html: result, findings };
}

module.exports = { checkAndFixDocumentMeta };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/test/document-checks.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/document-checks.js scripts/test/document-checks.test.js
git commit -m "feat: auto-fix missing charset, viewport, and lang attribute"
```

---

## Task 4: Image dimension sniffing

**Files:**
- Create: `scripts/lib/image-dimensions.js`
- Test: `scripts/test/image-dimensions.test.js`

**Interfaces:**
- Produces: `getImageDimensions(buffer: Buffer): { width: number, height: number } | null` — reads PNG (IHDR), GIF (logical screen descriptor), and JPEG (SOF0/SOF2 marker) headers. Returns `null` for unrecognized formats.

- [ ] **Step 1: Write the failing test**

```js
// scripts/test/image-dimensions.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { getImageDimensions } = require('../lib/image-dimensions');

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/test/image-dimensions.test.js`
Expected: FAIL with "Cannot find module '../lib/image-dimensions'"

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/image-dimensions.js
function getJpegDimensions(buffer) {
  let offset = 2; // skip SOI (0xFFD8)
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    const length = buffer.readUInt16BE(offset + 2);
    offset += 2 + length;
  }
  return null;
}

function getImageDimensions(buffer) {
  if (buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length >= 10 && buffer.toString('ascii', 0, 3) === 'GIF') {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return getJpegDimensions(buffer);
  }
  return null;
}

module.exports = { getImageDimensions };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/test/image-dimensions.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/image-dimensions.js scripts/test/image-dimensions.test.js
git commit -m "feat: add dependency-free PNG/GIF/JPEG dimension sniffing"
```

---

## Task 5: Image tag fixes (width/height + lazy loading)

**Files:**
- Create: `scripts/lib/img-fixes.js`
- Test: `scripts/test/img-fixes.test.js`

**Interfaces:**
- Consumes: `findTags`, `stringifyTag`, `replaceRange` from `../lib/html-tags` (Task 2); `getImageDimensions` from `../lib/image-dimensions` (Task 4).
- Produces: `fixImgTags(html: string, resolveImagePath: (src: string) => string|null): { html: string, findings: Finding[] }`. `resolveImagePath` returns an absolute filesystem path for a given `src`, or `null` if it can't/shouldn't be resolved (external URL, missing file). Adds `width`/`height` when resolvable and missing; adds `loading="lazy"` to every `<img>` except the first two in document order.

- [ ] **Step 1: Write the failing test**

```js
// scripts/test/img-fixes.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fixImgTags } = require('../lib/img-fixes');

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/test/img-fixes.test.js`
Expected: FAIL with "Cannot find module '../lib/img-fixes'"

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/img-fixes.js
const fs = require('node:fs');
const { findTags, stringifyTag, replaceRange } = require('./html-tags');
const { getImageDimensions } = require('./image-dimensions');

function fixImgTags(html, resolveImagePath) {
  const findings = [];
  let result = html;
  const total = findTags(result, 'img').length;

  for (let i = 0; i < total; i++) {
    const tag = findTags(result, 'img')[i];
    if (!tag) break;

    const attrs = { ...tag.attrs };
    let changed = false;

    if ((!('width' in attrs) || !('height' in attrs)) && tag.attrs.src) {
      const absPath = resolveImagePath(tag.attrs.src);
      if (absPath && fs.existsSync(absPath)) {
        const dims = getImageDimensions(fs.readFileSync(absPath));
        if (dims) {
          attrs.width = String(dims.width);
          attrs.height = String(dims.height);
          changed = true;
          findings.push({ code: 'missing-img-dimensions', category: 'performance', autoFixed: true, message: `width/height aggiunti a ${tag.attrs.src}` });
        }
      }
    }

    if (i >= 2 && !('loading' in attrs)) {
      attrs.loading = 'lazy';
      changed = true;
      findings.push({ code: 'missing-lazy-loading', category: 'performance', autoFixed: true, message: `loading="lazy" aggiunto a ${tag.attrs.src || '(immagine senza src)'}` });
    }

    if (changed) {
      const newRaw = stringifyTag('img', attrs, tag.selfClosing);
      result = replaceRange(result, tag.start, tag.end, newRaw);
    }
  }

  return { html: result, findings };
}

module.exports = { fixImgTags };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/test/img-fixes.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/img-fixes.js scripts/test/img-fixes.test.js
git commit -m "feat: auto-fix missing img width/height and lazy loading"
```

---

## Task 6: External link fix (rel="noopener noreferrer")

**Files:**
- Create: `scripts/lib/link-fixes.js`
- Test: `scripts/test/link-fixes.test.js`

**Interfaces:**
- Consumes: `findTags`, `stringifyTag`, `replaceRange` from `../lib/html-tags` (Task 2).
- Produces: `fixExternalLinks(html: string): { html: string, findings: Finding[] }`. Only touches `<a target="_blank">` tags; merges `noopener`/`noreferrer` into any existing `rel` value without duplicating tokens.

- [ ] **Step 1: Write the failing test**

```js
// scripts/test/link-fixes.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { fixExternalLinks } = require('../lib/link-fixes');

test('adds noopener noreferrer to a target=_blank link missing it', () => {
  const html = '<a href="https://ex.com" target="_blank">Link</a>';
  const { html: fixed, findings } = fixExternalLinks(html);

  assert.ok(fixed.includes('rel="noopener noreferrer"'));
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].code, 'missing-noopener');
});

test('merges into an existing rel value without dropping other tokens', () => {
  const html = '<a href="https://ex.com" target="_blank" rel="nofollow">Link</a>';
  const { html: fixed } = fixExternalLinks(html);

  assert.ok(fixed.includes('rel="nofollow noopener noreferrer"'));
});

test('is idempotent when rel already contains both tokens', () => {
  const html = '<a href="https://ex.com" target="_blank" rel="noopener noreferrer">Link</a>';
  const { html: fixed, findings } = fixExternalLinks(html);

  assert.strictEqual(fixed, html);
  assert.strictEqual(findings.length, 0);
});

test('leaves links without target=_blank untouched', () => {
  const html = '<a href="/local">Link</a>';
  const { html: fixed, findings } = fixExternalLinks(html);

  assert.strictEqual(fixed, html);
  assert.strictEqual(findings.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/test/link-fixes.test.js`
Expected: FAIL with "Cannot find module '../lib/link-fixes'"

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/link-fixes.js
const { findTags, stringifyTag, replaceRange } = require('./html-tags');

function fixExternalLinks(html) {
  const findings = [];
  let result = html;
  const total = findTags(result, 'a').length;

  for (let i = 0; i < total; i++) {
    const tag = findTags(result, 'a')[i];
    if (!tag) break;
    if ((tag.attrs.target || '').toLowerCase() !== '_blank') continue;

    const existingRel = (tag.attrs.rel || '').split(/\s+/).filter(Boolean);
    const missing = ['noopener', 'noreferrer'].filter((token) => !existingRel.includes(token));
    if (missing.length === 0) continue;

    const attrs = { ...tag.attrs, rel: [...existingRel, ...missing].join(' ') };
    const newRaw = stringifyTag('a', attrs, tag.selfClosing);
    result = replaceRange(result, tag.start, tag.end, newRaw);
    findings.push({ code: 'missing-noopener', category: 'performance', autoFixed: true, message: 'rel="noopener noreferrer" aggiunto a un link target="_blank"' });
  }

  return { html: result, findings };
}

module.exports = { fixExternalLinks };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/test/link-fixes.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/link-fixes.js scripts/test/link-fixes.test.js
git commit -m "feat: auto-fix missing rel=noopener noreferrer on target=_blank links"
```

---

## Task 7: SEO scaffolds (robots.txt + sitemap.xml)

**Files:**
- Create: `scripts/lib/scaffold-seo.js`
- Test: `scripts/test/scaffold-seo.test.js`

**Interfaces:**
- Produces: `generateRobotsTxt(): string`; `generateSitemapXml(pages: string[]): string`.

- [ ] **Step 1: Write the failing test**

```js
// scripts/test/scaffold-seo.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { generateRobotsTxt, generateSitemapXml } = require('../lib/scaffold-seo');

test('generates a permissive robots.txt pointing at the sitemap', () => {
  const content = generateRobotsTxt();
  assert.ok(content.includes('User-agent: *'));
  assert.ok(content.includes('Allow: /'));
  assert.ok(content.includes('Sitemap: sitemap.xml'));
});

test('generates a valid minimal sitemap.xml for the given pages', () => {
  const xml = generateSitemapXml(['index.html', 'contatti.html']);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('<loc>index.html</loc>'));
  assert.ok(xml.includes('<loc>contatti.html</loc>'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/test/scaffold-seo.test.js`
Expected: FAIL with "Cannot find module '../lib/scaffold-seo'"

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/scaffold-seo.js
function generateRobotsTxt() {
  return ['User-agent: *', 'Allow: /', '', 'Sitemap: sitemap.xml', ''].join('\n');
}

function generateSitemapXml(pages) {
  const urls = pages.map((p) => `  <url><loc>${p}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

module.exports = { generateRobotsTxt, generateSitemapXml };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/test/scaffold-seo.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/scaffold-seo.js scripts/test/scaffold-seo.test.js
git commit -m "feat: add robots.txt and sitemap.xml scaffold generators"
```

---

## Task 8: README.md scaffold

**Files:**
- Create: `scripts/lib/scaffold-readme.js`
- Test: `scripts/test/scaffold-readme.test.js`

**Interfaces:**
- Produces: `generateReadme({ folderName: string, title: string|null, packageJson: object|null, subdirs: string[] }): string`.

- [ ] **Step 1: Write the failing test**

```js
// scripts/test/scaffold-readme.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { generateReadme } = require('../lib/scaffold-readme');

test('uses package.json name/description and an npm start hint when available', () => {
  const md = generateReadme({
    folderName: 'nuovobushido',
    title: 'Accademia Bushido',
    packageJson: { name: 'nuovobushido', description: 'Modern redesign of Accademia Bushido website', scripts: { start: 'node server.js' } },
    subdirs: ['assets', 'cv'],
  });

  assert.ok(md.startsWith('# nuovobushido'));
  assert.ok(md.includes('Modern redesign of Accademia Bushido website'));
  assert.ok(md.includes('npm start'));
  assert.ok(md.includes('- `assets/`'));
  assert.ok(md.includes('- `cv/`'));
});

test('falls back to folder name, page title, and a static-file hint without package.json', () => {
  const md = generateReadme({ folderName: 'psico', title: 'Psicologa a Cirie', packageJson: null, subdirs: [] });

  assert.ok(md.startsWith('# psico'));
  assert.ok(md.includes('Psicologa a Cirie'));
  assert.ok(md.includes('npx serve'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/test/scaffold-readme.test.js`
Expected: FAIL with "Cannot find module '../lib/scaffold-readme'"

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/scaffold-readme.js
function generateReadme({ folderName, title, packageJson, subdirs }) {
  const name = (packageJson && packageJson.name) || folderName;
  const description = (packageJson && packageJson.description) || title || folderName;
  const startCmd = packageJson && packageJson.scripts && packageJson.scripts.start
    ? 'npm start'
    : 'Apri index.html direttamente nel browser, oppure: npx serve .';
  const structure = subdirs.length > 0
    ? subdirs.map((d) => `- \`${d}/\``).join('\n')
    : '(nessuna sottocartella)';

  return [
    `# ${name}`,
    '',
    description,
    '',
    '## Avvio locale',
    '',
    startCmd,
    '',
    '## Struttura del progetto',
    '',
    structure,
    '',
  ].join('\n');
}

module.exports = { generateReadme };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/test/scaffold-readme.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/scaffold-readme.js scripts/test/scaffold-readme.test.js
git commit -m "feat: add README.md scaffold generator"
```

---

## Task 9: llms.txt scaffold

**Files:**
- Create: `scripts/lib/scaffold-llms.js`
- Test: `scripts/test/scaffold-llms.test.js`

**Interfaces:**
- Produces: `generateLlmsTxt({ title: string, summary: string, pages: Array<{ path: string, description: string }> }): string` following the [llmstxt.org](https://llmstxt.org) format (H1 title, blockquote summary, `## Pages` link list).

- [ ] **Step 1: Write the failing test**

```js
// scripts/test/scaffold-llms.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { generateLlmsTxt } = require('../lib/scaffold-llms');

test('generates an llms.txt with title, summary blockquote, and page links', () => {
  const content = generateLlmsTxt({
    title: 'SKII',
    summary: 'Sito web statico.',
    pages: [{ path: 'index.html', description: 'Homepage del sito' }],
  });

  assert.ok(content.startsWith('# SKII'));
  assert.ok(content.includes('> Sito web statico.'));
  assert.ok(content.includes('## Pages'));
  assert.ok(content.includes('- [index.html](index.html): Homepage del sito'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/test/scaffold-llms.test.js`
Expected: FAIL with "Cannot find module '../lib/scaffold-llms'"

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/scaffold-llms.js
function generateLlmsTxt({ title, summary, pages }) {
  const pageLines = pages.map((p) => `- [${p.path}](${p.path}): ${p.description}`).join('\n');

  return [
    `# ${title}`,
    '',
    `> ${summary}`,
    '',
    '## Pages',
    '',
    pageLines,
    '',
  ].join('\n');
}

module.exports = { generateLlmsTxt };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/test/scaffold-llms.test.js`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/scaffold-llms.js scripts/test/scaffold-llms.test.js
git commit -m "feat: add llms.txt scaffold generator"
```

---

## Task 10: Favicon placeholder generator (pure-JS ICO encoder)

**Files:**
- Create: `scripts/lib/favicon-generator.js`
- Test: `scripts/test/favicon-generator.test.js`

**Interfaces:**
- Produces: `generateFaviconIco(letter: string, bgColorHex: string, fgColorHex: string): Buffer` — a structurally valid 32x32, 32bpp `.ico` file with the given letter (A-Z or 0-9) rendered as a blocky 3x5 glyph, centered, foreground on background color. Falls back to the '0' glyph for unsupported characters.

- [ ] **Step 1: Write the failing test**

```js
// scripts/test/favicon-generator.test.js
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
  assert.strictEqual(buf.readUInt16LE(12), 32); // bit count
  assert.strictEqual(buf.readUInt32LE(18), 22); // image offset (6-byte ICONDIR + 16-byte ICONDIRENTRY)
  assert.strictEqual(buf.readUInt32LE(22), 40); // BITMAPINFOHEADER biSize, must start exactly at imageOffset
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/test/favicon-generator.test.js`
Expected: FAIL with "Cannot find module '../lib/favicon-generator'"

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/favicon-generator.js
// Blocky 3x5 decorative font. Purely cosmetic placeholder — not meant to be pixel-perfect,
// the report tells the user to replace this favicon with real branding.
const FONT_3X5 = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '###', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '..#', '..#', '..#'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'],
  N: ['#.#', '###', '###', '###', '#.#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '##.', '.##'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#.#', '#.#', '#.#', '###', '#.#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
};

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

function generateFaviconIco(letter, bgColorHex, fgColorHex) {
  const size = 32;
  const bg = hexToRgb(bgColorHex);
  const fg = hexToRgb(fgColorHex);
  const glyph = FONT_3X5[String(letter || '0').toUpperCase()] || FONT_3X5['0'];
  const cell = 6;
  const glyphW = 3 * cell;
  const glyphH = 5 * cell;
  const offsetX = Math.floor((size - glyphW) / 2);
  const offsetY = Math.floor((size - glyphH) / 2);

  const pixels = new Array(size * size).fill(bg);
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      if (glyph[row][col] !== '#') continue;
      for (let dy = 0; dy < cell; dy++) {
        for (let dx = 0; dx < cell; dx++) {
          const x = offsetX + col * cell + dx;
          const y = offsetY + row * cell + dy;
          pixels[y * size + x] = fg;
        }
      }
    }
  }

  const headerSize = 40;
  const xorSize = size * size * 4;
  const andRowBytes = Math.ceil(size / 32) * 4;
  const andSize = andRowBytes * size;
  const bmpSize = headerSize + xorSize + andSize;
  const imageOffset = 6 + 16; // ICONDIR + one ICONDIRENTRY

  const buf = Buffer.alloc(imageOffset + bmpSize);
  let o = 0;
  buf.writeUInt16LE(0, o); o += 2; // reserved
  buf.writeUInt16LE(1, o); o += 2; // type = icon
  buf.writeUInt16LE(1, o); o += 2; // image count

  buf.writeUInt8(size, o); o += 1; // width
  buf.writeUInt8(size, o); o += 1; // height
  buf.writeUInt8(0, o); o += 1; // color count
  buf.writeUInt8(0, o); o += 1; // reserved
  buf.writeUInt16LE(1, o); o += 2; // planes
  buf.writeUInt16LE(32, o); o += 2; // bit count
  buf.writeUInt32LE(bmpSize, o); o += 4; // bytes in resource
  buf.writeUInt32LE(imageOffset, o); o += 4; // image offset (4-byte field per ICO spec)

  buf.writeUInt32LE(headerSize, o); o += 4;
  buf.writeInt32LE(size, o); o += 4;
  buf.writeInt32LE(size * 2, o); o += 4; // ICO convention: doubled height
  buf.writeUInt16LE(1, o); o += 2;
  buf.writeUInt16LE(32, o); o += 2;
  buf.writeUInt32LE(0, o); o += 4; // BI_RGB
  buf.writeUInt32LE(xorSize, o); o += 4;
  buf.writeInt32LE(0, o); o += 4;
  buf.writeInt32LE(0, o); o += 4;
  buf.writeUInt32LE(0, o); o += 4;
  buf.writeUInt32LE(0, o); o += 4;

  for (let y = size - 1; y >= 0; y--) {
    for (let x = 0; x < size; x++) {
      const p = pixels[y * size + x];
      buf.writeUInt8(p.b, o); o += 1;
      buf.writeUInt8(p.g, o); o += 1;
      buf.writeUInt8(p.r, o); o += 1;
      buf.writeUInt8(255, o); o += 1;
    }
  }

  buf.fill(0, o, o + andSize);

  return buf;
}

module.exports = { generateFaviconIco };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/test/favicon-generator.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/favicon-generator.js scripts/test/favicon-generator.test.js
git commit -m "feat: add dependency-free favicon placeholder ICO generator"
```

---

## Task 11: Google Fonts self-hosting

**Files:**
- Create: `scripts/lib/font-selfhost.js`
- Test: `scripts/test/font-selfhost.test.js`

**Interfaces:**
- Produces:
  - `parseGoogleFontsImport(cssContent: string): { fullMatch: string, url: string } | null`
  - `parseFontFaceUrls(cssText: string): Array<{ raw: string, url: string|null, family: string, weight: string, style: string }>` (filters out entries without a resolvable `url`)
  - `buildLocalFontFaceCss(fonts: Array<{ family: string, weight: string, style: string, localFileName: string }>): string`
  - `rewriteCssWithLocalFonts(cssContent: string, importMatch: { fullMatch: string }, fontFaceCss: string): string`
  - `selfHostGoogleFonts(cssFilePath: string, siteDir: string, deps: { readFile, writeFile, mkdir, fetchText, fetchBuffer }): Promise<{ applied: boolean, findings: Finding[] }>` — all I/O is injected via `deps` so the orchestrator is unit-testable without a real network call.

- [ ] **Step 1: Write the failing test**

```js
// scripts/test/font-selfhost.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const {
  parseGoogleFontsImport,
  parseFontFaceUrls,
  selfHostGoogleFonts,
} = require('../lib/font-selfhost');

test('parses a Google Fonts @import line', () => {
  const css = "@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700&display=swap');\nbody { color: red; }";
  const result = parseGoogleFontsImport(css);
  assert.ok(result);
  assert.ok(result.url.startsWith('https://fonts.googleapis.com/'));
});

test('returns null when there is no Google Fonts import', () => {
  assert.strictEqual(parseGoogleFontsImport('body { color: red; }'), null);
});

test('extracts font-face family/weight/style/url from Google-served CSS', () => {
  const googleCss = `@font-face {\n  font-family: 'Outfit';\n  font-style: normal;\n  font-weight: 400;\n  src: url(https://fonts.gstatic.com/s/outfit/v11/abc.woff2) format('woff2');\n}`;
  const [font] = parseFontFaceUrls(googleCss);
  assert.strictEqual(font.family, 'Outfit');
  assert.strictEqual(font.weight, '400');
  assert.strictEqual(font.style, 'normal');
  assert.strictEqual(font.url, 'https://fonts.gstatic.com/s/outfit/v11/abc.woff2');
});

test('downloads and rewrites a Google Fonts import to local files', async () => {
  const writes = {};
  const deps = {
    readFile: async () => "@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400&display=swap');\nbody { color: red; }",
    writeFile: async (p, content) => { writes[p] = content; },
    mkdir: async () => {},
    fetchText: async () => `@font-face {\n  font-family: 'Outfit';\n  font-style: normal;\n  font-weight: 400;\n  src: url(https://fonts.gstatic.com/s/outfit/v11/abc.woff2) format('woff2');\n}`,
    fetchBuffer: async () => Buffer.from('fake-font-bytes'),
  };

  const result = await selfHostGoogleFonts('/site/index.css', '/site', deps);

  assert.strictEqual(result.applied, true);
  assert.ok(writes['/site/fonts/outfit-400-normal.woff2'].equals(Buffer.from('fake-font-bytes')));
  assert.ok(writes['/site/index.css'].includes("url('fonts/outfit-400-normal.woff2')"));
  assert.ok(!writes['/site/index.css'].includes('fonts.googleapis.com'));
  assert.strictEqual(result.findings[0].code, 'externalized-google-fonts');
});

test('does nothing when no Google Fonts import is present', async () => {
  const deps = {
    readFile: async () => 'body { color: red; }',
    writeFile: async () => { throw new Error('should not write'); },
    mkdir: async () => {},
    fetchText: async () => { throw new Error('should not fetch'); },
    fetchBuffer: async () => { throw new Error('should not fetch'); },
  };

  const result = await selfHostGoogleFonts('/site/index.css', '/site', deps);
  assert.deepStrictEqual(result, { applied: false, findings: [] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/test/font-selfhost.test.js`
Expected: FAIL with "Cannot find module '../lib/font-selfhost'"

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/font-selfhost.js
function parseGoogleFontsImport(cssContent) {
  const re = /@import\s+url\(['"]?(https:\/\/fonts\.googleapis\.com\/[^'")]+)['"]?\)\s*;?/;
  const match = cssContent.match(re);
  if (!match) return null;
  return { fullMatch: match[0], url: match[1] };
}

function parseFontFaceUrls(cssText) {
  const blocks = cssText.match(/@font-face\s*\{[^}]*\}/g) || [];
  return blocks
    .map((block) => {
      const urlMatch = block.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/);
      const familyMatch = block.match(/font-family:\s*['"]([^'"]+)['"]/);
      const weightMatch = block.match(/font-weight:\s*(\d+)/);
      const styleMatch = block.match(/font-style:\s*(\w+)/);
      return {
        raw: block,
        url: urlMatch ? urlMatch[1] : null,
        family: familyMatch ? familyMatch[1] : 'unknown',
        weight: weightMatch ? weightMatch[1] : '400',
        style: styleMatch ? styleMatch[1] : 'normal',
      };
    })
    .filter((font) => font.url);
}

function buildLocalFontFaceCss(fonts) {
  return fonts
    .map((f) => `@font-face {\n  font-family: '${f.family}';\n  font-style: ${f.style};\n  font-weight: ${f.weight};\n  font-display: swap;\n  src: url('fonts/${f.localFileName}') format('woff2');\n}`)
    .join('\n\n');
}

function rewriteCssWithLocalFonts(cssContent, importMatch, fontFaceCss) {
  return cssContent.replace(importMatch.fullMatch, fontFaceCss);
}

async function selfHostGoogleFonts(cssFilePath, siteDir, deps) {
  const { readFile, writeFile, mkdir, fetchText, fetchBuffer } = deps;
  const cssContent = await readFile(cssFilePath, 'utf8');
  const importMatch = parseGoogleFontsImport(cssContent);
  if (!importMatch) return { applied: false, findings: [] };

  const googleCss = await fetchText(importMatch.url);
  const fontFaces = parseFontFaceUrls(googleCss);
  await mkdir(`${siteDir}/fonts`, { recursive: true });

  const localized = [];
  for (const font of fontFaces) {
    const localFileName = `${font.family.replace(/\s+/g, '-').toLowerCase()}-${font.weight}-${font.style}.woff2`;
    const bytes = await fetchBuffer(font.url);
    await writeFile(`${siteDir}/fonts/${localFileName}`, bytes);
    localized.push({ ...font, localFileName });
  }

  const fontFaceCss = buildLocalFontFaceCss(localized);
  const newCss = rewriteCssWithLocalFonts(cssContent, importMatch, fontFaceCss);
  await writeFile(cssFilePath, newCss);

  return {
    applied: true,
    findings: [{
      code: 'externalized-google-fonts',
      category: 'performance',
      autoFixed: true,
      message: `Font Google Fonts reso locale (${localized.length} file .woff2 scaricati in fonts/)`,
    }],
  };
}

module.exports = { parseGoogleFontsImport, parseFontFaceUrls, buildLocalFontFaceCss, rewriteCssWithLocalFonts, selfHostGoogleFonts };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/test/font-selfhost.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/font-selfhost.js scripts/test/font-selfhost.test.js
git commit -m "feat: add Google Fonts self-hosting with injectable network deps"
```

---

## Task 12: Oversized image finder

**Files:**
- Create: `scripts/lib/image-compress.js`
- Test: `scripts/test/image-compress.test.js`

**Interfaces:**
- Produces: `findOversizedImages(siteDir: string, listFilesRecursive: (dir: string) => string[], statFile: (path: string) => { size: number }, thresholdBytes?: number): Array<{ path: string, size: number }>` — defaults `thresholdBytes` to 150000. Actual compression is not performed by this module: it is applied by the per-site Agent via `npx sharp-cli` as documented in `SKILL.md` (Task 15), since a real image codec is required and isn't worth hand-rolling for a personal-scope tool.

- [ ] **Step 1: Write the failing test**

```js
// scripts/test/image-compress.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { findOversizedImages } = require('../lib/image-compress');

test('returns only jpg/png files above the size threshold', () => {
  const files = ['/site/a.png', '/site/b.jpg', '/site/c.svg', '/site/d.png'];
  const sizes = { '/site/a.png': 200000, '/site/b.jpg': 50000, '/site/c.svg': 500000, '/site/d.png': 100000 };

  const result = findOversizedImages('/site', () => files, (p) => ({ size: sizes[p] }), 150000);

  assert.deepStrictEqual(result, [{ path: '/site/a.png', size: 200000 }]);
});

test('uses a 150000 byte default threshold', () => {
  const files = ['/site/a.png'];
  const result = findOversizedImages('/site', () => files, () => ({ size: 200000 }));
  assert.strictEqual(result.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/test/image-compress.test.js`
Expected: FAIL with "Cannot find module '../lib/image-compress'"

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/image-compress.js
function findOversizedImages(siteDir, listFilesRecursive, statFile, thresholdBytes = 150000) {
  return listFilesRecursive(siteDir)
    .filter((file) => /\.(jpe?g|png)$/i.test(file))
    .map((file) => ({ path: file, size: statFile(file).size }))
    .filter((file) => file.size > thresholdBytes);
}

module.exports = { findOversizedImages };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/test/image-compress.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/image-compress.js scripts/test/image-compress.test.js
git commit -m "feat: add oversized image finder"
```

---

## Task 13: CLI wiring (`static-audit.js`)

**Files:**
- Create: `scripts/static-audit.js`
- Test: `scripts/test/static-audit.integration.test.js`

**Interfaces:**
- Consumes: every module from Tasks 1–12.
- Produces the CLI contract used by `SKILL.md`:
  - `node scripts/static-audit.js --discover <rootDir>` → prints `{ "sites": string[] }` to stdout.
  - `node scripts/static-audit.js <siteDir>` → prints `{ "site": string, "findings": Finding[] }` to stdout (report-only, no writes).
  - `node scripts/static-audit.js <siteDir> --fix` → same as above, but writes fixes to disk first (`findings[].autoFixed` reflects what was actually applied).

- [ ] **Step 1: Write the failing test**

```js
// scripts/test/static-audit.integration.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/test/static-audit.integration.test.js`
Expected: FAIL with "Cannot find module" or ENOENT on `static-audit.js`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/static-audit.js
#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { discoverSites } = require('./lib/discover-sites');
const { checkAndFixDocumentMeta } = require('./lib/document-checks');
const { fixImgTags } = require('./lib/img-fixes');
const { fixExternalLinks } = require('./lib/link-fixes');
const { generateRobotsTxt, generateSitemapXml } = require('./lib/scaffold-seo');
const { generateReadme } = require('./lib/scaffold-readme');
const { generateLlmsTxt } = require('./lib/scaffold-llms');
const { generateFaviconIco } = require('./lib/favicon-generator');
const { findOversizedImages } = require('./lib/image-compress');
const { parseGoogleFontsImport, selfHostGoogleFonts } = require('./lib/font-selfhost');

async function realFetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
  return res.text();
}

async function realFetchBuffer(url) {
  const res = await fetch(url);
  return Buffer.from(await res.arrayBuffer());
}

function listFilesRecursive(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full));
    else out.push(full);
  }
  return out;
}

function extractTitle(html) {
  const match = html.match(/<title>([^<]*)<\/title>/i);
  return match ? match[1].trim() : null;
}

async function auditSite(siteDir, fix) {
  const findings = [];
  const indexPath = path.join(siteDir, 'index.html');
  const originalHtml = fs.readFileSync(indexPath, 'utf8');
  let html = originalHtml;

  const docResult = checkAndFixDocumentMeta(html);
  html = docResult.html;
  findings.push(...docResult.findings);

  const imgResult = fixImgTags(html, (src) => {
    if (/^https?:\/\//i.test(src)) return null;
    return path.join(siteDir, src);
  });
  html = imgResult.html;
  findings.push(...imgResult.findings);

  const linkResult = fixExternalLinks(html);
  html = linkResult.html;
  findings.push(...linkResult.findings);

  if (fix && html !== originalHtml) fs.writeFileSync(indexPath, html);

  const title = extractTitle(html);

  const robotsPath = path.join(siteDir, 'robots.txt');
  if (!fs.existsSync(robotsPath)) {
    findings.push({ code: 'missing-robots-txt', category: 'seo', autoFixed: !!fix, message: 'robots.txt mancante' });
    if (fix) fs.writeFileSync(robotsPath, generateRobotsTxt());
  }

  const sitemapPath = path.join(siteDir, 'sitemap.xml');
  if (!fs.existsSync(sitemapPath)) {
    findings.push({ code: 'missing-sitemap-xml', category: 'seo', autoFixed: !!fix, message: 'sitemap.xml mancante' });
    if (fix) fs.writeFileSync(sitemapPath, generateSitemapXml(['index.html']));
  }

  const readmePath = path.join(siteDir, 'README.md');
  if (!fs.existsSync(readmePath)) {
    findings.push({ code: 'missing-readme', category: 'code-quality', autoFixed: !!fix, message: 'README.md mancante' });
    if (fix) {
      const pkgPath = path.join(siteDir, 'package.json');
      const packageJson = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf8')) : null;
      const subdirs = fs.readdirSync(siteDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name !== '.git')
        .map((e) => e.name);
      fs.writeFileSync(readmePath, generateReadme({ folderName: path.basename(siteDir), title, packageJson, subdirs }));
    }
  }

  const llmsPath = path.join(siteDir, 'llms.txt');
  if (!fs.existsSync(llmsPath)) {
    findings.push({ code: 'missing-llms-txt', category: 'seo', autoFixed: !!fix, message: 'llms.txt mancante' });
    if (fix) {
      fs.writeFileSync(llmsPath, generateLlmsTxt({
        title: title || path.basename(siteDir),
        summary: 'Sito web statico.',
        pages: [{ path: 'index.html', description: 'Homepage del sito' }],
      }));
    }
  }

  const faviconPath = path.join(siteDir, 'favicon.ico');
  if (!fs.existsSync(faviconPath)) {
    findings.push({ code: 'missing-favicon', category: 'code-quality', autoFixed: !!fix, message: "favicon.ico mancante, generato un placeholder da sostituire con un'icona di brand reale" });
    if (fix) {
      const letter = (title || path.basename(siteDir)).trim()[0] || '0';
      fs.writeFileSync(faviconPath, generateFaviconIco(letter, '#1a1a2e', '#e94560'));
    }
  }

  for (const img of findOversizedImages(siteDir, listFilesRecursive, (p) => fs.statSync(p))) {
    findings.push({ code: 'oversized-image', category: 'performance', autoFixed: false, message: `Immagine ${path.relative(siteDir, img.path)} pesa ${Math.round(img.size / 1024)}KB, valuta la compressione (es. npx sharp-cli)` });
  }

  const cssPath = path.join(siteDir, 'index.css');
  if (fs.existsSync(cssPath) && parseGoogleFontsImport(fs.readFileSync(cssPath, 'utf8'))) {
    if (fix) {
      const result = await selfHostGoogleFonts(cssPath, siteDir, {
        readFile: (p) => fs.promises.readFile(p, 'utf8'),
        writeFile: (p, c) => fs.promises.writeFile(p, c),
        mkdir: (p, opts) => fs.promises.mkdir(p, opts),
        fetchText: realFetchText,
        fetchBuffer: realFetchBuffer,
      });
      findings.push(...result.findings);
    } else {
      findings.push({ code: 'external-google-fonts', category: 'performance', autoFixed: false, message: 'Font Google Fonts caricati da CDN esterno, possono essere resi locali' });
    }
  }

  return findings;
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--discover') {
    process.stdout.write(JSON.stringify({ sites: discoverSites(args[1] || '.') }, null, 2));
    return;
  }

  const siteDir = path.resolve(args[0]);
  const fix = args.includes('--fix');
  const findings = await auditSite(siteDir, fix);
  process.stdout.write(JSON.stringify({ site: siteDir, findings }, null, 2));
}

main();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/test/static-audit.integration.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full test suite**

Run: `node --test scripts/test/`
Expected: PASS (all tests from Tasks 1–13)

- [ ] **Step 6: Commit**

```bash
git add scripts/static-audit.js scripts/test/static-audit.integration.test.js
git commit -m "feat: wire up static-audit CLI with discover/report/fix modes"
```

---

## Task 14: SKILL.md — baseline pressure scenario (RED)

This task has no code deliverable — it establishes the baseline behavior that `SKILL.md` (Task 15) must fix, per the `superpowers:writing-skills` TDD methodology. **REQUIRED SUB-SKILL:** superpowers:writing-skills.

- [ ] **Step 1: Prepare a disposable copy of a real site as the test fixture**

```bash
mkdir -p /tmp/audit-baseline
cp -r "D:/GitHub/robertocontiero/psico" /tmp/audit-baseline/psico
```

- [ ] **Step 2: Dispatch a fresh subagent with the raw task, no skill available**

Use the Agent tool (`general-purpose`) with exactly this prompt:

> Migliora il sito statico che trovi in `/tmp/audit-baseline/psico`. Occupati di performance, SEO, accessibilità e qualità del codice.

- [ ] **Step 3: Record the baseline behavior verbatim**

Write down, without editing: which files it touched and how, whether it modified any `<a href>` outbound link, whether it ran `git commit`/`git push`, whether it produced any report file, whether it invented ad-hoc tooling instead of a repeatable process, and whether it asked for confirmation before big changes. This baseline is the list of gaps `SKILL.md` must close in Task 15.

- [ ] **Step 4: Clean up the fixture**

```bash
rm -rf /tmp/audit-baseline
```

No commit for this task (no files are added to the skill).

---

## Task 15: Write SKILL.md (GREEN)

**Files:**
- Create: `SKILL.md`

**Interfaces:**
- Consumes: the CLI contract from Task 13 (`--discover`, plain run, `--fix`).

- [ ] **Step 1: Write SKILL.md**

```markdown
---
name: auditing-static-sites
description: Use when the user wants to audit or improve one or more static HTML/CSS/JS websites in a folder — checking performance, SEO, accessibility, and code-quality hygiene (missing meta tags, robots.txt, sitemap.xml, favicon, README, llms.txt, external font dependencies) — and applying safe mechanical fixes automatically.
---

# Auditing Static Sites

## Overview

Audits every static site found under a target folder using `scripts/static-audit.js`
(mechanical checks) plus Lighthouse (performance/SEO/accessibility/best-practices
scores), applies safe automatic fixes, and produces a per-site `AUDIT.md` plus an
aggregated dashboard Artifact.

## When NOT to use

- Sites with a build pipeline (React/Vue/bundlers) — this skill targets plain
  HTML/CSS/JS served as-is, with no build step to invert.
- When the user wants design/UX changes, not hygiene fixes — those stay
  report-only by design; this skill never edits visual design.

## Procedure

1. **Discover sites**

   ```
   node <skill-dir>/scripts/static-audit.js --discover <target-dir>
   ```

   Returns `{ "sites": string[] }`. If the array is empty, tell the user no
   static site was found under that folder and stop.

2. **Audit each site in parallel.** For every site path returned, dispatch an
   Agent (`general-purpose`, foreground, no worktree — each site is already an
   isolated git repo) with this exact prompt template, substituting `{siteDir}`
   and `{skillDir}`:

   > Audit and fix the static website at `{siteDir}`.
   > 1. Run `node {skillDir}/scripts/static-audit.js {siteDir}` and read the JSON findings.
   > 2. Run `node {skillDir}/scripts/static-audit.js {siteDir} --fix` to apply the safe automatic fixes.
   > 3. For every finding with code `oversized-image`, compress that file with
   >    `npx --yes sharp-cli -i "<file>" -o "<file's directory>/.audit-tmp" -q 80`,
   >    compare the size of the file inside `.audit-tmp` against the original, and
   >    only replace the original if it is at least 10% smaller; then delete `.audit-tmp`.
   > 4. Start a local static server for `{siteDir}`
   >    (`npx --yes serve {siteDir} -l 4173`), then run
   >    `npx --yes lighthouse http://localhost:4173 --output=json --output-path=stdout --chrome-flags="--headless" --only-categories=performance,accessibility,best-practices,seo`.
   >    Stop the server afterward.
   > 5. Write `{siteDir}/AUDIT.md` with three sections: "Punteggi Lighthouse" (the
   >    4 category scores), "Fix applicati automaticamente" (every finding with
   >    `autoFixed: true`, plus any image actually compressed in step 3), and "Da
   >    rivedere manualmente" (every finding with `autoFixed: false`, plus your own
   >    read of `index.html`/`index.css` for alt-text quality, missing meta
   >    description, color contrast, and heading hierarchy — the script does not
   >    check these).
   > 6. Do NOT modify any `<a href="...">` outbound link or any third-party embed
   >    (Google Maps / YouTube iframe). Do NOT run any `git` command. Do NOT commit.
   > 7. Return exactly this JSON as your final message, nothing else:
   >    `{ "site": "{siteDir}", "scores": { "performance": N, "accessibility": N, "best-practices": N, "seo": N }, "autoFixed": N, "openFindings": [...] }`

3. **Aggregate.** Once every per-site agent has returned its JSON, build an
   Artifact HTML dashboard (see the `artifact-design` skill) comparing Lighthouse
   scores across all sites, the total auto-fixed count, and the open findings per
   site.

4. **Report to the user.** List each site's scores, how many fixes were applied,
   and point to its `AUDIT.md` plus the dashboard Artifact link. Explicitly
   remind them that nothing was committed — they should review `git status` /
   `git diff` in each site's repo before committing anything.

## Constraints

- Never touch `<a href="...">` outbound links or third-party embeds (Maps/YouTube
  iframes) — only resource-loading tags (`<img>`, `<link>`, `@import`,
  `<script src>`) are in scope for the "external resources" check.
- Never run `git commit`, `git push`, or any other git command.
- Only the fixes implemented in `scripts/static-audit.js` (plus the image
  compression and Lighthouse steps above) happen automatically. Alt-text
  quality, meta description content, design/UX, color contrast, heading
  hierarchy, and CSS/JS minification are always report-only.
```

- [ ] **Step 2: Re-run the same pressure scenario from Task 14, this time with the skill available**

```bash
mkdir -p /tmp/audit-green
cp -r "D:/GitHub/robertocontiero/psico" /tmp/audit-green/psico
```

Dispatch a fresh subagent (Agent tool, `general-purpose`) with the skill file readable (place a copy of `SKILL.md` where the agent's prompt tells it to look, or paste the skill content into the prompt preceded by "You have access to this skill:") and this task:

> Migliora il sito statico che trovi in `/tmp/audit-green/psico`. Occupati di performance, SEO, accessibilità e qualità del codice.

- [ ] **Step 3: Verify compliance against this checklist**

- [ ] Ran `static-audit.js` (report, then `--fix`) instead of ad-hoc edits
- [ ] Ran Lighthouse and captured scores
- [ ] Wrote `AUDIT.md` with the three required sections
- [ ] Did not modify any `<a href="...">` link
- [ ] Did not run any `git` command
- [ ] Final message was the exact JSON contract from step 7 of the procedure

If every box is checked, proceed to Task 16. If any fails, note the exact
rationalization or gap and continue to Task 16's REFACTOR loop instead of
editing `SKILL.md` blindly.

- [ ] **Step 4: Clean up the fixture**

```bash
rm -rf /tmp/audit-green
```

- [ ] **Step 5: Commit**

```bash
git add SKILL.md
git commit -m "feat: add auditing-static-sites SKILL.md orchestration procedure"
```

---

## Task 16: REFACTOR loopholes + real-world smoke test

**Files:**
- Modify: `SKILL.md` (only if Task 15's verification found gaps)

- [ ] **Step 1: If Task 15 step 3 found any unchecked box, add an explicit counter to SKILL.md**

For each gap observed, add a line under "Constraints" naming the specific
rationalization the agent used and forbidding it explicitly (e.g. if it
skipped Lighthouse because the server "was slow to start", add: "Do not skip
the Lighthouse step even if the local server takes a few seconds to become
ready — retry the request instead of giving up."). Re-run Task 15 steps 2–3
with the updated `SKILL.md` until all boxes are checked twice in a row with two
different fresh subagents.

- [ ] **Step 2: Run the real folder as a dry run (no --fix) to sanity-check discovery and reporting**

```bash
node "C:/Users/Utente/.claude/skills/auditing-static-sites/scripts/static-audit.js" --discover "D:/GitHub/robertocontiero"
```

Expected: `{ "sites": [...AccademiaBushido, SKII, helparti, psico paths...] }` — verify all 4 appear.

```bash
node "C:/Users/Utente/.claude/skills/auditing-static-sites/scripts/static-audit.js" "D:/GitHub/robertocontiero/psico"
```

Expected: JSON findings array, no files modified (`--fix` was not passed) — verify with `git status` inside `psico` that nothing changed.

- [ ] **Step 3: Apply fixes to exactly one real site and review the diff before touching the rest**

```bash
node "C:/Users/Utente/.claude/skills/auditing-static-sites/scripts/static-audit.js" "D:/GitHub/robertocontiero/psico" --fix
cd "D:/GitHub/robertocontiero/psico" && git status && git diff -- index.html
```

Review the diff manually: confirm only the expected mechanical changes appear
(charset/viewport/lang, img dimensions/lazy-loading, link rel, new
robots.txt/sitemap.xml/README.md/llms.txt/favicon.ico) and that no `<a href>`
link was touched. Do not commit — leave it for the user to review.

- [ ] **Step 4: Commit the skill changes (not the audited site's changes)**

```bash
git add SKILL.md
git commit -m "refactor: close pressure-scenario loopholes in auditing-static-sites skill"
```

(If Task 15 required no changes, skip Task 16 entirely — there is nothing to
refactor or commit.)

---

## Self-Review Notes

- **Spec coverage:** every "Fix automatici" item from the design doc has a task
  (charset/viewport/lang → Task 3; img width/height/lazy → Task 5; noopener →
  Task 6; robots/sitemap → Task 7; README → Task 8; llms.txt → Task 9; favicon →
  Task 10; Google Fonts self-hosting → Task 11; image compression → Task 12 +
  SKILL.md step 3 in Task 15). Every "Solo report" item is either produced
  directly as a `autoFixed: false` finding (oversized images, external Google
  Fonts before `--fix`, generic external resources) or delegated to the
  per-site agent's manual read (alt-text quality, meta description, contrast,
  heading hierarchy) as instructed in Task 15's prompt template. Discovery,
  parallel per-site agents, `AUDIT.md`, and the aggregated dashboard are all
  covered by Tasks 1 and 15.
- **No git commit automation:** verified absent from every task and explicitly
  forbidden in `SKILL.md`'s constraints and per-site agent prompt.
- **Type consistency:** every check/fix module (Tasks 3, 5, 6) returns the same
  `Finding` shape defined in Task 3 and consumed identically by the CLI (Task
  13) and by `SKILL.md`'s `AUDIT.md`-writing instructions (Task 15).
