// scripts/test/scaffold-seo.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { generateRobotsTxt, generateSitemapXml } = require('./seo');

test('generates a permissive robots.txt pointing at the sitemap', () => {
  const content = generateRobotsTxt();
  assert.ok(content.includes('User-agent: *'));
  assert.ok(content.includes('Allow: /'));
  assert.ok(content.includes('Sitemap: sitemap.xml'));
});

test('generates a valid minimal sitemap.xml for the given pages', () => {
  const xml = generateSitemapXml(['index.html', 'contatti.html']);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('<loc>index.html</loc>'));
  assert.ok(xml.includes('<loc>contatti.html</loc>'));
});
