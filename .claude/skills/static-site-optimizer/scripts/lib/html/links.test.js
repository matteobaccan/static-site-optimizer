const { test } = require('node:test');
const assert = require('node:assert');
const { fixExternalLinks } = require('./links');

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
