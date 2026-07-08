const { findTags, stringifyTag, replaceRange } = require('./html-tags');

function checkAndFixDocumentMeta(html) {
  const findings = [];
  let result = html;

  // Check and fix lang attribute on <html>
  const htmlTags = findTags(result, 'html');
  if (htmlTags.length > 0 && !('lang' in htmlTags[0].attrs)) {
    const tag = htmlTags[0];
    const newRaw = stringifyTag('html', { ...tag.attrs, lang: 'it' }, tag.selfClosing);
    result = replaceRange(result, tag.start, tag.end, newRaw);
    findings.push({ code: 'missing-lang', category: 'accessibility', autoFixed: true, message: 'Attributo lang mancante su <html>, impostato a "it"' });
  }

  // Check and fix charset meta tag
  const hasCharset = findTags(result, 'meta').some((tag) => 'charset' in tag.attrs);
  if (!hasCharset) {
    const [head] = findTags(result, 'head');
    if (head) {
      result = replaceRange(result, head.end, head.end, '\n  <meta charset="UTF-8">');
      findings.push({ code: 'missing-charset', category: 'seo', autoFixed: true, message: 'Meta charset mancante, aggiunto UTF-8' });
    }
  }

  // Check and fix viewport meta tag
  const hasViewport = findTags(result, 'meta').some((tag) => (tag.attrs.name || '').toLowerCase() === 'viewport');
  if (!hasViewport) {
    const [head] = findTags(result, 'head');
    if (head) {
      result = replaceRange(result, head.end, head.end, '\n  <meta name="viewport" content="width=device-width, initial-scale=1">');
      findings.push({ code: 'missing-viewport', category: 'seo', autoFixed: true, message: 'Meta viewport mancante, aggiunto' });
    }
  }

  return { html: result, findings };
}

module.exports = { checkAndFixDocumentMeta };
