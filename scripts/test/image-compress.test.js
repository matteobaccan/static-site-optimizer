const { test } = require('node:test');
const assert = require('node:assert');
const { findOversizedImages } = require('../lib/image-compress');

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
