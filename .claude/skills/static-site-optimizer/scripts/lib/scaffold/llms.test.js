// scripts/test/scaffold-llms.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { generateLlmsTxt } = require('./llms');

test('generates an llms.txt with title, summary blockquote, and page links', () => {
  const content = generateLlmsTxt({
    title: 'SKII',
    summary: 'A static website.',
    pages: [{ path: 'index.html', description: 'Site homepage' }],
  });

  assert.ok(content.startsWith('# SKII'));
  assert.ok(content.includes('> A static website.'));
  assert.ok(content.includes('## Pages'));
  assert.ok(content.includes('- [index.html](index.html): Site homepage'));
});
