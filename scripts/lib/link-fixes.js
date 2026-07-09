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

function tokenize(html) {
  const tokens = [];
  const re = /(<\/?[a-zA-Z0-9:-]+(?:\s+[^>]*)?>)/g;
  let match;
  let lastIndex = 0;
  while ((match = re.exec(html)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', content: html.slice(lastIndex, match.index) });
    }
    tokens.push({ type: 'tag', content: match[0] });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < html.length) {
    tokens.push({ type: 'text', content: html.slice(lastIndex) });
  }
  return tokens;
}

function cleanPhone(phone) {
  let cleaned = phone.replace(/[\s.-]/g, '');
  if (cleaned.startsWith('++')) {
    cleaned = '+' + cleaned.slice(2);
  }
  return cleaned;
}

function fixContactLinks(html) {
  const findings = [];
  
  // 1. Process plain text nodes using tokenize
  const tokens = tokenize(html);
  let inAnchor = false;
  let inScriptOrStyle = false;
  
  const emailRegex = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
  // This matches Italian mobile and landline numbers like: 335 527 8570, ++39 335 527 8570, 011 123 4567
  const phoneRegex = /(?<!\d)(?:(?:\+?\+?|00)39[\s.-]?)?[30]\d{2,3}[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/g;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === 'tag') {
      const tagContent = token.content;
      const isClose = tagContent.startsWith('</');
      const tagNameMatch = tagContent.match(/<\/?([a-zA-Z0-9:-]+)/);
      const tagName = tagNameMatch ? tagNameMatch[1].toLowerCase() : '';
      
      if (tagName === 'a') {
        inAnchor = !isClose;
      } else if (tagName === 'script' || tagName === 'style') {
        inScriptOrStyle = !isClose;
      }
    } else if (token.type === 'text') {
      if (inScriptOrStyle) {
        continue;
      }
      
      if (inAnchor) {
        // If we are inside an anchor, we don't want to wrap it, but we should fix "++39" to "+39" if present
        if (token.content.includes('++39')) {
          token.content = token.content.replace(/\+\+39/g, '+39');
          findings.push({
            code: 'format-phone',
            category: 'seo',
            autoFixed: true,
            message: `Sostituito '++39' con '+39' nel testo del link esistente`
          });
        }
        continue;
      }
      
      const text = token.content;
      const matches = [];
      
      let match;
      emailRegex.lastIndex = 0;
      while ((match = emailRegex.exec(text)) !== null) {
        matches.push({
          type: 'email',
          value: match[0],
          index: match.index,
          length: match[0].length
        });
      }
      
      phoneRegex.lastIndex = 0;
      while ((match = phoneRegex.exec(text)) !== null) {
        matches.push({
          type: 'phone',
          value: match[0],
          index: match.index,
          length: match[0].length
        });
      }
      
      // Sort matches by index descending so we can replace from end to start without index shifting
      matches.sort((a, b) => b.index - a.index);
      
      // Filter out overlapping matches
      const nonOverlapping = [];
      let lastStart = Infinity;
      for (const m of matches) {
        if (m.index + m.length <= lastStart) {
          nonOverlapping.push(m);
          lastStart = m.index;
        }
      }
      
      if (nonOverlapping.length > 0) {
        let textArr = text.split('');
        for (const m of nonOverlapping) {
          let replacement = '';
          if (m.type === 'email') {
            replacement = `<a href="mailto:${m.value}">${m.value}</a>`;
            findings.push({
              code: 'missing-mailto',
              category: 'seo',
              autoFixed: true,
              message: `Email ${m.value} resa cliccabile con mailto:`
            });
          } else if (m.type === 'phone') {
            const cleaned = cleanPhone(m.value);
            let displayVal = m.value;
            if (displayVal.startsWith('++')) {
              displayVal = '+' + displayVal.slice(2);
            }
            replacement = `<a href="tel:${cleaned}">${displayVal}</a>`;
            findings.push({
              code: 'missing-tel',
              category: 'seo',
              autoFixed: true,
              message: `Telefono ${m.value} reso cliccabile con tel: e formattato con +39`
            });
          }
          textArr.splice(m.index, m.length, replacement);
        }
        token.content = textArr.join('');
      }
    }
  }
  
  // Reconstruct HTML from tokens
  let result = tokens.map(t => t.content).join('');
  
  // 2. Process existing <a> tags that might be missing tel: or mailto:
  const total = findTags(result, 'a').length;
  for (let i = 0; i < total; i++) {
    const tag = findTags(result, 'a')[i];
    if (!tag) break;
    
    let href = tag.attrs.href || '';
    let modified = false;
    
    // Check if href is an email address without mailto:
    if (href && href.includes('@') && !href.toLowerCase().startsWith('mailto:') && !href.toLowerCase().startsWith('http')) {
      href = `mailto:${href}`;
      modified = true;
      findings.push({
        code: 'missing-mailto',
        category: 'seo',
        autoFixed: true,
        message: `Aggiunto mailto: mancante all'attributo href dell'ancora`
      });
    }
    
    // Check if href is a phone number without tel:
    const phoneCleanTest = cleanPhone(href);
    if (href && /^\+?\+?\d+$/.test(phoneCleanTest) && phoneCleanTest.length >= 7 && !href.toLowerCase().startsWith('tel:') && !href.toLowerCase().startsWith('http')) {
      href = `tel:${phoneCleanTest}`;
      modified = true;
      findings.push({
        code: 'missing-tel',
        category: 'seo',
        autoFixed: true,
        message: `Aggiunto tel: mancante all'attributo href dell'ancora`
      });
    }
    
    if (modified) {
      const attrs = { ...tag.attrs, href };
      const newRaw = stringifyTag('a', attrs, tag.selfClosing);
      result = replaceRange(result, tag.start, tag.end, newRaw);
    }
  }

  return { html: result, findings };
}

function checkOfficeDocuments(html) {
  const findings = [];
  const tags = findTags(html, 'a');
  
  for (const tag of tags) {
    const href = tag.attrs.href || '';
    if (!href) continue;
    
    const cleanHref = href.split(/[?#]/)[0];
    if (/\.(docx?|pptx?)$/i.test(cleanHref)) {
      findings.push({
        code: 'office-document-link',
        category: 'best-practices',
        autoFixed: false,
        message: `Trovato link a documento Office (${href}). Si consiglia di convertirlo in formato PDF per una migliore accessibilità e compatibilità.`
      });
    }
  }
  
  return { findings };
}

module.exports = { fixExternalLinks, fixContactLinks, checkOfficeDocuments };
