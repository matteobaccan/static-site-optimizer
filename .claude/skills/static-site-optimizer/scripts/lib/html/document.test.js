// scripts/test/document-checks.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { checkAndFixDocumentMeta } = require('./document');

test('adds missing lang, charset, and viewport', () => {
  const html = '<html><head><title>Test</title></head><body></body></html>';
  const { html: fixed, findings } = checkAndFixDocumentMeta(html, { lang: 'en' });

  assert.ok(fixed.includes('<html lang="en">'));
  assert.ok(fixed.includes('<meta charset="UTF-8">'));
  assert.ok(fixed.includes('name="viewport"'));
  assert.strictEqual(findings.length, 3);
  assert.deepStrictEqual(findings.map((f) => f.code).sort(), ['missing-charset', 'missing-lang', 'missing-viewport'].sort());
  assert.ok(findings.every((f) => f.autoFixed === true));
});

test('does not duplicate tags that already exist', () => {
  const html = '<html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>';
  const { html: fixed, findings } = checkAndFixDocumentMeta(html, { lang: 'en' });

  assert.strictEqual(fixed, html);
  assert.strictEqual(findings.length, 0);
});

test('stamps the language the caller asked for', () => {
  const { html, findings } = checkAndFixDocumentMeta('<html><head></head><body></body></html>', { lang: 'it' });

  assert.ok(html.includes('<html lang="it">'));
  assert.match(findings.find((f) => f.code === 'missing-lang').message, /set to "it"/);
});

test('leaves lang alone when the caller could not resolve a language', () => {
  const { html, findings } = checkAndFixDocumentMeta('<html><head></head><body></body></html>');
  const lang = findings.find((f) => f.code === 'missing-lang');

  assert.ok(!html.includes('lang='), 'no language must be invented');
  assert.strictEqual(lang.autoFixed, false);
  assert.match(lang.message, /--lang/);
});
