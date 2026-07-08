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
