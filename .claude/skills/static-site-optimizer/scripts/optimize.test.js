const { test } = require('node:test');
const assert = require('node:assert');
const { parseArgs } = require('./optimize');

test('reads the site path and the boolean flags', () => {
  const args = parseArgs(['./site', '--fix', '--compress-images']);

  assert.deepStrictEqual(args.positional, ['./site']);
  assert.strictEqual(args.fix, true);
  assert.strictEqual(args.compress, true);
  assert.strictEqual(args.discover, false);
});

test('defaults to report mode, no compression, and no assumed language', () => {
  const args = parseArgs(['./site']);

  assert.strictEqual(args.fix, false);
  assert.strictEqual(args.compress, false);
  assert.strictEqual(args.lang, null, 'the language must come from the site or the user, never from a default');
});

test('does not mistake a flag value for the site path', () => {
  const args = parseArgs(['--lang', 'it', './site', '--fix']);

  assert.deepStrictEqual(args.positional, ['./site'], 'the language code must not be read as a positional argument');
  assert.strictEqual(args.lang, 'it');
});

test('accepts --lang=code as well', () => {
  assert.strictEqual(parseArgs(['./site', '--lang=de']).lang, 'de');
});

test('treats an empty invocation and -h alike as a request for help', () => {
  assert.strictEqual(parseArgs([]).help, true);
  assert.strictEqual(parseArgs(['-h']).help, true);
  assert.strictEqual(parseArgs(['--help']).help, true);
  assert.strictEqual(parseArgs(['./site']).help, false);
});
