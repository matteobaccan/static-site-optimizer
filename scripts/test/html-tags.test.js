// scripts/test/html-tags.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { findTags, stringifyTag, replaceRange } = require('../lib/html-tags');

test('finds tags and parses quoted, unquoted, and boolean attributes', () => {
  const html = '<img src="a.png" alt=\'hi\' data-x=1 loading>';
  const [tag] = findTags(html, 'img');
  assert.strictEqual(tag.raw, html);
  assert.strictEqual(tag.start, 0);
  assert.strictEqual(tag.end, html.length);
  assert.strictEqual(tag.selfClosing, false);
  assert.deepStrictEqual(tag.attrs, { src: 'a.png', alt: 'hi', 'data-x': '1', loading: null });
});

test('does not match tags with a similar but different name', () => {
  const html = '<imgx src="a.png">';
  assert.deepStrictEqual(findTags(html, 'img'), []);
});

test('finds self-closing tags', () => {
  const html = '<img src="a.png" />';
  const [tag] = findTags(html, 'img');
  assert.strictEqual(tag.selfClosing, true);
});

test('finds multiple tags in document order', () => {
  const html = '<a href="/one">one</a><a href="/two" target="_blank">two</a>';
  const tags = findTags(html, 'a');
  assert.strictEqual(tags.length, 2);
  assert.strictEqual(tags[0].attrs.href, '/one');
  assert.strictEqual(tags[1].attrs.href, '/two');
});

test('stringifyTag renders quoted attributes and bare boolean attributes', () => {
  const raw = stringifyTag('img', { src: 'a.png', alt: '', loading: null }, false);
  assert.strictEqual(raw, '<img src="a.png" alt="" loading>');
});

test('stringifyTag renders self-closing tags', () => {
  const raw = stringifyTag('img', { src: 'a.png' }, true);
  assert.strictEqual(raw, '<img src="a.png" />');
});

test('replaceRange splices a substring using start/end indices', () => {
  const result = replaceRange('abcdef', 2, 4, 'XY');
  assert.strictEqual(result, 'abXYef');
});
