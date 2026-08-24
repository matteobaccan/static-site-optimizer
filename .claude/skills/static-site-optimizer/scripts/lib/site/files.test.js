const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { findHtmlPages, findCssFiles, extractTitle, extractMetaDescription } = require('./files');

function makeSite(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-files-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return dir;
}

test('lists every html page with the homepage first', () => {
  const dir = makeSite({
    'contatti.html': '',
    'index.html': '',
    'blog/post.html': '',
  });

  assert.deepStrictEqual(findHtmlPages(dir), ['index.html', 'blog/post.html', 'contatti.html']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('skips node_modules and .git when walking the site', () => {
  const dir = makeSite({
    'index.html': '',
    'node_modules/pkg/demo.html': '',
    '.git/hook.html': '',
  });

  assert.deepStrictEqual(findHtmlPages(dir), ['index.html']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('lists local stylesheets but not the ones the optimizer generated', () => {
  const dir = makeSite({
    'index.html': '',
    'index.css': '',
    'styles/theme.css': '',
    'assets/css/vendor-1234abcd.css': '',
  });

  assert.deepStrictEqual(findCssFiles(dir), ['index.css', 'styles/theme.css']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('extracts title and meta description from a page', () => {
  const html = '<head><title> Demo </title><meta name="description" content="Un sito"></head>';
  assert.strictEqual(extractTitle(html), 'Demo');
  assert.strictEqual(extractMetaDescription(html), 'Un sito');
  assert.strictEqual(extractMetaDescription('<head></head>'), null);
});
