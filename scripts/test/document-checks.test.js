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
