const { test } = require('node:test');
const assert = require('node:assert');
const {
  buildExternalReportFindings,
  describeSelfHostableRefs,
  describeCssExternalRefs,
} = require('./findings');

test('reports a tracker without ever marking it as fixed', () => {
  const findings = buildExternalReportFindings('<script src="https://www.google-analytics.com/analytics.js"></script>');
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].code, 'external-tracker');
  assert.strictEqual(findings[0].autoFixed, false);
});

test('reports a maps embed as something a human must decide about', () => {
  const findings = buildExternalReportFindings('<iframe src="https://www.google.com/maps/embed?pb=1"></iframe>');
  assert.strictEqual(findings[0].code, 'third-party-embed');
  assert.match(findings[0].message, /click-to-load facade/);
});

test('reports a preconnect hint left behind after self-hosting', () => {
  const findings = buildExternalReportFindings('<link rel="preconnect" href="https://fonts.gstatic.com">');
  assert.strictEqual(findings[0].code, 'stale-preconnect');
});

test('names the page when the finding is not on the homepage', () => {
  const findings = buildExternalReportFindings('<script src="https://clarity.ms/tag/x"></script>', 'blog/post.html');
  assert.match(findings[0].message, /blog\/post\.html/);
});

test('lists self-hostable resources in report mode but skips trackers', () => {
  const html = `
    <link rel="stylesheet" href="https://cdn.example.com/a.css">
    <script src="https://www.googletagmanager.com/gtag/js?id=G-1"></script>
  `;
  const findings = describeSelfHostableRefs(html);
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].code, 'external-resource');
  assert.match(findings[0].message, /cdn\.example\.com/);
  assert.strictEqual(findings[0].autoFixed, false);
});

test('lists external css refs with the stylesheet they came from', () => {
  const findings = describeCssExternalRefs("@import url('https://fonts.googleapis.com/css2?family=Inter');", 'index.css');
  assert.match(findings[0].message, /index\.css/);
  assert.match(findings[0].message, /fonts\.googleapis\.com/);
});
