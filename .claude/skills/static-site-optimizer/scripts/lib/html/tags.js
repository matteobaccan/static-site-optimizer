const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function parseAttrs(attrString) {
  const attrs = {};
  let match;
  ATTR_RE.lastIndex = 0;
  while ((match = ATTR_RE.exec(attrString)) !== null) {
    const [, name, dq, sq, uq] = match;
    attrs[name] = dq !== undefined ? dq : sq !== undefined ? sq : uq !== undefined ? uq : null;
  }
  return attrs;
}

function findTags(html, tagName) {
  const re = new RegExp(`<${tagName}(\\s[^>]*?)?\\s*(/?)>`, 'gi');
  const results = [];
  let match;
  while ((match = re.exec(html)) !== null) {
    const attrString = match[1] || '';
    results.push({
      raw: match[0],
      attrs: parseAttrs(attrString),
      start: match.index,
      end: match.index + match[0].length,
      selfClosing: match[2] === '/',
    });
  }
  return results;
}

function stringifyTag(tagName, attrs, selfClosing) {
  const parts = [tagName];
  for (const [key, value] of Object.entries(attrs)) {
    parts.push(value === null ? key : `${key}="${value}"`);
  }
  return `<${parts.join(' ')}${selfClosing ? ' />' : '>'}`;
}

function replaceRange(html, start, end, replacement) {
  return html.slice(0, start) + replacement + html.slice(end);
}

module.exports = { findTags, stringifyTag, replaceRange, parseAttrs };
