const { test } = require('node:test');
const assert = require('node:assert');
const {
  findHtmlExternalRefs,
  findCssExternalRefs,
  findTrackers,
  findThirdPartyEmbeds,
  findPreconnectHints,
  isTrackerUrl,
  linkKind,
  parseSrcset,
  stringifySrcset,
  normalizeUrl,
} = require('./refs');

test('finds stylesheet, script and image subresources loaded from another origin', () => {
  const html = `
    <link rel="stylesheet" href="https://cdn.example.com/a.css">
    <script src="https://cdn.example.com/b.js"></script>
    <img src="https://img.example.com/c.png">
  `;
  const kinds = findHtmlExternalRefs(html).map((r) => `${r.tagName}:${r.kind}`);
  assert.deepStrictEqual(kinds, ['link:stylesheet', 'script:script', 'img:image']);
});

test('leaves local references alone', () => {
  const html = '<link rel="stylesheet" href="index.css"><script src="/js/app.js"></script><img src="../a.png">';
  assert.deepStrictEqual(findHtmlExternalRefs(html), []);
});

test('never reports outbound links, form actions or iframe embeds as subresources', () => {
  const html = `
    <a href="https://partner.example.com">partner</a>
    <form action="https://forms.example.com/submit"></form>
    <iframe src="https://www.youtube.com/embed/xyz"></iframe>
  `;
  assert.deepStrictEqual(findHtmlExternalRefs(html), []);
});

test('ignores <link> variants that load nothing', () => {
  const html = `
    <link rel="canonical" href="https://example.com/">
    <link rel="alternate" hreflang="en" href="https://example.com/en/">
    <link rel="preconnect" href="https://fonts.gstatic.com">
  `;
  assert.deepStrictEqual(findHtmlExternalRefs(html), []);
});

test('classifies a preloaded font by its as attribute', () => {
  assert.strictEqual(linkKind({ rel: 'preload', as: 'font' }), 'font');
  assert.strictEqual(linkKind({ rel: 'preload', as: 'style' }), 'stylesheet');
  assert.strictEqual(linkKind({ rel: 'canonical' }), null);
});

test('normalizes protocol-relative urls to https', () => {
  assert.strictEqual(normalizeUrl('//cdn.example.com/a.js'), 'https://cdn.example.com/a.js');
  const refs = findHtmlExternalRefs('<script src="//cdn.example.com/a.js"></script>');
  assert.deepStrictEqual(refs[0].urls, ['https://cdn.example.com/a.js']);
});

test('collects every external candidate of a srcset', () => {
  const refs = findHtmlExternalRefs('<img src="local.png" srcset="https://cdn.example.com/a.png 1x, local2.png 2x">');
  assert.strictEqual(refs.length, 1);
  assert.strictEqual(refs[0].attr, 'srcset');
  assert.deepStrictEqual(refs[0].urls, ['https://cdn.example.com/a.png']);
});

test('round-trips a srcset through parse and stringify', () => {
  const value = 'a.png 1x, b.png 2x';
  assert.strictEqual(stringifySrcset(parseSrcset(value)), value);
});

test('recognizes analytics hosts as trackers', () => {
  assert.ok(isTrackerUrl('https://www.googletagmanager.com/gtag/js?id=G-1'));
  assert.ok(isTrackerUrl('https://connect.facebook.net/en_US/fbevents.js'));
  assert.ok(!isTrackerUrl('https://cdn.jsdelivr.net/npm/x/dist/x.js'));
});

test('reports trackers and third-party embeds separately from loadable assets', () => {
  const html = `
    <script src="https://www.google-analytics.com/analytics.js"></script>
    <iframe src="https://www.google.com/maps/embed?pb=1"></iframe>
    <link rel="preconnect" href="https://fonts.gstatic.com">
  `;
  assert.strictEqual(findTrackers(html).length, 1);
  assert.strictEqual(findThirdPartyEmbeds(html)[0].host, 'google.com');
  assert.strictEqual(findPreconnectHints(html)[0].host, 'fonts.gstatic.com');
});

test('finds @import and url() refs in css and tells fonts from images', () => {
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Inter');
    body { background: url("https://cdn.example.com/bg.jpg"); }
    @font-face { src: url(https://fonts.gstatic.com/s/inter/x.woff2) format('woff2'); }
    .local { background: url('./local.png'); }
  `;
  const refs = findCssExternalRefs(css);
  assert.deepStrictEqual(refs.map((r) => `${r.type}:${r.kind}`), ['import:stylesheet', 'url:image', 'url:font']);
});

test('does not double-count the url() inside an @import', () => {
  const refs = findCssExternalRefs("@import url('https://cdn.example.com/a.css');");
  assert.strictEqual(refs.length, 1);
  assert.strictEqual(refs[0].type, 'import');
});
