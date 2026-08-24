const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const {
  AssetStore,
  rewriteHtmlRefs,
  rewriteCssRefs,
  localFileName,
  relativeFrom,
  ensureFontDisplaySwap,
} = require('./self-host');

// An in-memory site plus a fake network, so the whole self-hosting chain can be
// exercised without touching disk or the internet.
function makeStore(remote, siteDir = '/site') {
  const written = new Map();
  const requested = [];

  const deps = {
    async fetchText(url) {
      requested.push(url);
      if (!(url in remote)) throw new Error('HTTP 404');
      return remote[url].body;
    },
    async fetchBinary(url) {
      requested.push(url);
      if (!(url in remote)) throw new Error('HTTP 404');
      return { bytes: Buffer.from(remote[url].body), contentType: remote[url].contentType };
    },
    async writeFile(p, data) {
      written.set(p.split(path.sep).join('/'), Buffer.isBuffer(data) ? data.toString() : data);
    },
    async mkdir() {},
  };

  return { store: new AssetStore(siteDir, deps), written, requested };
}

test('builds a deterministic, collision-proof local filename', () => {
  const a = localFileName('https://a.example.com/lib/app.js', 'script', 'text/javascript');
  const b = localFileName('https://b.example.com/lib/app.js', 'script', 'text/javascript');

  assert.match(a, /^app-[0-9a-f]{8}\.js$/);
  assert.notStrictEqual(a, b, 'same basename on different hosts must not collide');
  assert.strictEqual(a, localFileName('https://a.example.com/lib/app.js', 'script', 'text/javascript'));
});

test('derives an extension from the content type when the url has none', () => {
  assert.match(localFileName('https://fonts.googleapis.com/css2?family=Inter', 'stylesheet', 'text/css'), /\.css$/);
  assert.match(localFileName('https://cdn.example.com/image', 'image', 'image/webp'), /\.webp$/);
});

test('computes an asset path relative to the document that uses it', () => {
  assert.strictEqual(relativeFrom('', 'assets/css/a.css'), 'assets/css/a.css');
  assert.strictEqual(relativeFrom('blog', 'assets/css/a.css'), '../assets/css/a.css');
  assert.strictEqual(relativeFrom('assets/css', 'assets/fonts/x.woff2'), '../fonts/x.woff2');
});

test('rewrites an external stylesheet link to a local copy', async () => {
  const { store, written } = makeStore({
    'https://cdn.example.com/a.css': { body: 'body{color:red}', contentType: 'text/css' },
  });

  const { html, findings } = await rewriteHtmlRefs('<link rel="stylesheet" href="https://cdn.example.com/a.css">', '', store);

  assert.match(html, /href="assets\/css\/a-[0-9a-f]{8}\.css"/);
  assert.ok(!html.includes('cdn.example.com'));
  assert.strictEqual(findings[0].code, 'self-hosted-asset');
  assert.strictEqual(findings[0].autoFixed, true);
  assert.strictEqual([...written.values()][0], 'body{color:red}');
});

test('follows a Google Fonts stylesheet down to its woff2 files', async () => {
  const cssUrl = 'https://fonts.googleapis.com/css2?family=Inter&display=swap';
  const fontUrl = 'https://fonts.gstatic.com/s/inter/v1/inter-regular.woff2';
  const { store, written } = makeStore({
    [cssUrl]: {
      body: `@font-face { font-family: 'Inter'; font-weight: 400; src: url(${fontUrl}) format('woff2'); }`,
      contentType: 'text/css',
    },
    [fontUrl]: { body: 'WOFF2BYTES', contentType: 'font/woff2' },
  });

  const { html } = await rewriteHtmlRefs(`<link rel="stylesheet" href="${cssUrl}">`, '', store);

  const paths = [...written.keys()].map((p) => p.replace('/site/', ''));
  assert.ok(paths.some((p) => /^assets\/css\/css2-[0-9a-f]{8}\.css$/.test(p)), `unexpected css path in ${paths}`);
  assert.ok(paths.some((p) => /^assets\/fonts\/inter-regular-[0-9a-f]{8}\.woff2$/.test(p)), `unexpected font path in ${paths}`);

  // The stylesheet must point at the font by a path relative to its own folder.
  const savedCss = [...written.entries()].find(([p]) => p.includes('/css/'))[1];
  assert.match(savedCss, /url\('\.\.\/fonts\/inter-regular-[0-9a-f]{8}\.woff2'\)/);
  assert.ok(!savedCss.includes('gstatic.com'));
  assert.ok(!html.includes('googleapis.com'));
});

test('resolves a relative url() inside a downloaded stylesheet against the stylesheet url', async () => {
  const cssUrl = 'https://cdn.example.com/theme/main.css';
  const { store, requested } = makeStore({
    [cssUrl]: { body: '.a{background:url(../img/bg.png)}', contentType: 'text/css' },
    'https://cdn.example.com/img/bg.png': { body: 'PNG', contentType: 'image/png' },
  });

  await store.ensure(cssUrl, 'stylesheet');
  assert.ok(requested.includes('https://cdn.example.com/img/bg.png'));
});

test('adds font-display: swap only where it is missing', () => {
  const css = "@font-face{font-family:'A';src:url(a.woff2)}@font-face{font-display:block;src:url(b.woff2)}";
  const out = ensureFontDisplaySwap(css);
  assert.strictEqual(out.match(/font-display/g).length, 2);
  assert.ok(out.includes('font-display: swap'));
  assert.ok(out.includes('font-display:block'));
});

test('drops integrity and crossorigin once the asset is served from our own origin', async () => {
  const { store } = makeStore({ 'https://cdn.example.com/a.css': { body: 'x', contentType: 'text/css' } });
  const html = '<link rel="stylesheet" href="https://cdn.example.com/a.css" integrity="sha384-abc" crossorigin="anonymous">';

  const result = await rewriteHtmlRefs(html, '', store);
  assert.ok(!result.html.includes('integrity'));
  assert.ok(!result.html.includes('crossorigin'));
});

test('keeps the original url and reports a finding when a download fails', async () => {
  const { store } = makeStore({});
  const { html, findings } = await rewriteHtmlRefs('<script src="https://down.example.com/a.js"></script>', '', store);

  assert.ok(html.includes('https://down.example.com/a.js'), 'a failed download must not break the reference');
  assert.strictEqual(findings[0].code, 'external-asset-download-failed');
  assert.strictEqual(findings[0].autoFixed, false);
});

test('never self-hosts a tracker', async () => {
  const { store, requested } = makeStore({});
  const html = '<script src="https://www.googletagmanager.com/gtag/js?id=G-1"></script>';

  const result = await rewriteHtmlRefs(html, '', store);
  assert.strictEqual(result.html, html);
  assert.deepStrictEqual(requested, []);
});

test('rewrites both src and srcset of the same tag in one pass', async () => {
  const { store } = makeStore({
    'https://cdn.example.com/a.png': { body: 'A', contentType: 'image/png' },
    'https://cdn.example.com/a2.png': { body: 'B', contentType: 'image/png' },
  });

  const { html } = await rewriteHtmlRefs('<img src="https://cdn.example.com/a.png" srcset="https://cdn.example.com/a2.png 2x" alt="x">', '', store);

  assert.ok(!html.includes('cdn.example.com'), `srcset or src left external: ${html}`);
  assert.match(html, /srcset="assets\/img\/a2-[0-9a-f]{8}\.png 2x"/);
  assert.ok(html.includes('alt="x"'), 'unrelated attributes must survive the rewrite');
});

test('downloads a shared asset once even when several pages reference it', async () => {
  const { store, requested } = makeStore({ 'https://cdn.example.com/a.js': { body: 'x', contentType: 'text/javascript' } });

  await rewriteHtmlRefs('<script src="https://cdn.example.com/a.js"></script>', '', store);
  await rewriteHtmlRefs('<script src="https://cdn.example.com/a.js"></script>', 'blog', store);

  assert.strictEqual(requested.length, 1);
});

test('rewrites a local stylesheet @import to a path relative to that stylesheet', async () => {
  const { store } = makeStore({ 'https://cdn.example.com/a.css': { body: 'x', contentType: 'text/css' } });

  const { css } = await rewriteCssRefs("@import url('https://cdn.example.com/a.css');\nbody{}", 'styles', store);

  assert.match(css, /@import url\('\.\.\/assets\/css\/a-[0-9a-f]{8}\.css'\);/);
});
