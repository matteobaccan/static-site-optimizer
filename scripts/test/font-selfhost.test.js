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
