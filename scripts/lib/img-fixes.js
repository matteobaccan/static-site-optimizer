const fs = require('node:fs');
const { findTags, stringifyTag, replaceRange } = require('./html-tags');
const { getImageDimensions } = require('./image-dimensions');

function fixImgTags(html, resolveImagePath) {
  const findings = [];
  let result = html;
  const total = findTags(result, 'img').length;

  for (let i = 0; i < total; i++) {
    const tag = findTags(result, 'img')[i];
    if (!tag) break;

    const attrs = { ...tag.attrs };
    let changed = false;

    if ((!('width' in attrs) || !('height' in attrs)) && tag.attrs.src) {
      const absPath = resolveImagePath(tag.attrs.src);
      if (absPath && fs.existsSync(absPath)) {
        const dims = getImageDimensions(fs.readFileSync(absPath));
        if (dims) {
          attrs.width = String(dims.width);
          attrs.height = String(dims.height);
          changed = true;
          findings.push({ code: 'missing-img-dimensions', category: 'performance', autoFixed: true, message: `width/height aggiunti a ${tag.attrs.src}` });
        }
      }
    }

    if (i >= 2 && !('loading' in attrs)) {
      attrs.loading = 'lazy';
      changed = true;
      findings.push({ code: 'missing-lazy-loading', category: 'performance', autoFixed: true, message: `loading="lazy" aggiunto a ${tag.attrs.src || '(immagine senza src)'}` });
    }

    if (changed) {
      const newRaw = stringifyTag('img', attrs, tag.selfClosing);
      result = replaceRange(result, tag.start, tag.end, newRaw);
    }
  }

  return { html: result, findings };
}

module.exports = { fixImgTags };
