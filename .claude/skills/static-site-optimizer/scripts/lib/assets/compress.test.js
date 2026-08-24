const { test } = require('node:test');
const assert = require('node:assert');
const { findOversizedImages } = require('./compress');

test('returns only jpg/png files above the size threshold', () => {
  const files = ['/site/a.png', '/site/b.jpg', '/site/c.svg', '/site/d.png'];
  const sizes = { '/site/a.png': 200000, '/site/b.jpg': 50000, '/site/c.svg': 500000, '/site/d.png': 100000 };

  const result = findOversizedImages('/site', () => files, (p) => ({ size: sizes[p] }), 150000);

  assert.deepStrictEqual(result, [{ path: '/site/a.png', size: 200000 }]);
});

test('uses a 150000 byte default threshold', () => {
  const files = ['/site/a.png'];
  const result = findOversizedImages('/site', () => files, () => ({ size: 200000 }));
  assert.strictEqual(result.length, 1);
});

const { compressImage } = require('./compress');

// A fake sharp-cli: whatever it "produces" lands in the scratch folder at the size
// the test asks for, so only the keep-or-discard decision is under test.
function makeCompressDeps({ before, after, produceOutput = true }) {
  const calls = { run: [], copied: [], removed: [] };
  return {
    calls,
    deps: {
      run: async (cmd, args) => { calls.run.push([cmd, ...args].join(' ')); },
      statSize: (p) => (p.includes('.audit-tmp') ? after : before),
      copyFile: async (from, to) => { calls.copied.push([from, to]); },
      removeDir: async (p) => { calls.removed.push(p); },
      fileExists: () => produceOutput,
    },
  };
}

test('replaces the original only when the re-encode is meaningfully smaller', async () => {
  const { deps, calls } = makeCompressDeps({ before: 200000, after: 120000 });

  const result = await compressImage('/site/a.jpg', deps);

  assert.strictEqual(result.compressed, true);
  assert.strictEqual(calls.copied.length, 1);
  assert.match(calls.run[0], /sharp-cli/);
});

test('keeps the original when the gain is under 10%', async () => {
  const { deps, calls } = makeCompressDeps({ before: 200000, after: 195000 });

  const result = await compressImage('/site/a.jpg', deps);

  assert.strictEqual(result.compressed, false);
  assert.match(result.reason, /10%/);
  assert.strictEqual(calls.copied.length, 0);
});

test('reports a reason instead of throwing when sharp-cli produces nothing', async () => {
  const { deps } = makeCompressDeps({ before: 200000, after: 0, produceOutput: false });

  const result = await compressImage('/site/a.jpg', deps);

  assert.strictEqual(result.compressed, false);
  assert.match(result.reason, /sharp-cli/);
});

test('always cleans up the scratch folder, including after a failure', async () => {
  const { deps, calls } = makeCompressDeps({ before: 200000, after: 100000 });
  deps.run = async () => { throw new Error('npx non disponibile'); };

  const result = await compressImage('/site/a.jpg', deps);

  assert.strictEqual(result.compressed, false);
  assert.strictEqual(result.reason, 'npx non disponibile');
  assert.strictEqual(calls.removed.length, 1);
  assert.match(calls.removed[0], /\.audit-tmp$/);
});
