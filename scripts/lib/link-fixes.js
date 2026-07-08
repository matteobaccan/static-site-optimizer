const { findTags, stringifyTag, replaceRange } = require('./html-tags');

function fixExternalLinks(html) {
  const findings = [];
  let result = html;
  const total = findTags(result, 'a').length;

  for (let i = 0; i < total; i++) {
    const tag = findTags(result, 'a')[i];
    if (!tag) break;
    if ((tag.attrs.target || '').toLowerCase() !== '_blank') continue;

    const existingRel = (tag.attrs.rel || '').split(/\s+/).filter(Boolean);
    const missing = ['noopener', 'noreferrer'].filter((token) => !existingRel.includes(token));
    if (missing.length === 0) continue;

    const attrs = { ...tag.attrs, rel: [...existingRel, ...missing].join(' ') };
    const newRaw = stringifyTag('a', attrs, tag.selfClosing);
    result = replaceRange(result, tag.start, tag.end, newRaw);
    findings.push({ code: 'missing-noopener', category: 'performance', autoFixed: true, message: 'rel="noopener noreferrer" aggiunto a un link target="_blank"' });
  }

  return { html: result, findings };
}

module.exports = { fixExternalLinks };
