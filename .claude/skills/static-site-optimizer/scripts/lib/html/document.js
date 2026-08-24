const { findTags, stringifyTag, replaceRange } = require('./tags');

// `lang` is the one fix here whose value cannot be read off the file being fixed.
// The caller resolves it first (see lib/site/language.js) and passes it in; when it
// passes null — nothing declared anywhere in the site, and the text heuristic was
// not conclusive — the attribute is reported and left alone rather than guessed.
function checkAndFixDocumentMeta(html, { lang = null } = {}) {
  const findings = [];
  let result = html;

  // Check and fix the lang attribute on <html>
  const htmlTags = findTags(result, 'html');
  if (htmlTags.length > 0 && !('lang' in htmlTags[0].attrs)) {
    if (lang) {
      const tag = htmlTags[0];
      const newRaw = stringifyTag('html', { ...tag.attrs, lang }, tag.selfClosing);
      result = replaceRange(result, tag.start, tag.end, newRaw);
      findings.push({ code: 'missing-lang', category: 'accessibility', autoFixed: true, message: `Missing lang attribute on <html>, set to "${lang}"` });
    } else {
      findings.push({
        code: 'missing-lang',
        category: 'accessibility',
        autoFixed: false,
        message: 'Missing lang attribute on <html>. The site does not declare its language anywhere and the text was not conclusive, so it was left alone: re-run with --lang <code>. A wrong lang is worse than none.',
      });
    }
  }

  // Check and fix charset meta tag
  const hasCharset = findTags(result, 'meta').some((tag) => 'charset' in tag.attrs);
  if (!hasCharset) {
    const [head] = findTags(result, 'head');
    if (head) {
      result = replaceRange(result, head.end, head.end, '\n  <meta charset="UTF-8">');
      findings.push({ code: 'missing-charset', category: 'seo', autoFixed: true, message: 'Missing meta charset, added UTF-8' });
    }
  }

  // Check and fix viewport meta tag
  const hasViewport = findTags(result, 'meta').some((tag) => (tag.attrs.name || '').toLowerCase() === 'viewport');
  if (!hasViewport) {
    const [head] = findTags(result, 'head');
    if (head) {
      result = replaceRange(result, head.end, head.end, '\n  <meta name="viewport" content="width=device-width, initial-scale=1">');
      findings.push({ code: 'missing-viewport', category: 'seo', autoFixed: true, message: 'Missing meta viewport, added' });
    }
  }

  return { html: result, findings };
}

module.exports = { checkAndFixDocumentMeta };
