// Works out what language a site is written in, so the `lang` attribute is never
// guessed from thin air.
//
// Two very different kinds of answer come out of here, and the caller must treat
// them differently:
//
//   - MARKUP evidence (a lang attribute on another page, og:locale, hreflang) is
//     the site stating its own language. Using it is not a guess.
//   - TEXT evidence is a stopword heuristic. It is good enough to *propose* to a
//     human, never good enough to write into a file on its own.
const { findTags } = require('../html/tags');

// Small, deliberately common function-word sets. Overlap between languages is
// expected — the winner is decided by total hits across the whole set, not by any
// single word.
const STOPWORDS = {
  it: ['il', 'lo', 'la', 'gli', 'le', 'di', 'del', 'della', 'che', 'per', 'con', 'non', 'una', 'sono', 'anche', 'come', 'più', 'nostro', 'nostra', 'questo', 'questa', 'siamo', 'alla', 'dei', 'delle', 'nel', 'nella', 'ma', 'se', 'suo'],
  en: ['the', 'of', 'and', 'to', 'in', 'is', 'that', 'for', 'with', 'you', 'this', 'are', 'we', 'our', 'on', 'as', 'be', 'from', 'your', 'have', 'has', 'will', 'can', 'all', 'more', 'about', 'they', 'what'],
  fr: ['le', 'la', 'les', 'des', 'du', 'et', 'est', 'pour', 'avec', 'dans', 'une', 'nous', 'notre', 'vous', 'sur', 'qui', 'que', 'plus', 'sont', 'cette', 'aux', 'ses', 'mais', 'tout', 'être'],
  de: ['der', 'die', 'das', 'und', 'ist', 'für', 'mit', 'den', 'dem', 'ein', 'eine', 'nicht', 'sich', 'auch', 'wir', 'unsere', 'sie', 'von', 'zu', 'im', 'auf', 'werden', 'oder', 'aus', 'bei'],
  es: ['el', 'los', 'las', 'de', 'del', 'y', 'es', 'para', 'con', 'en', 'una', 'no', 'nuestro', 'nuestra', 'que', 'por', 'se', 'son', 'más', 'este', 'esta', 'como', 'pero', 'todo', 'sus'],
  pt: ['os', 'as', 'do', 'da', 'dos', 'das', 'e', 'é', 'para', 'com', 'em', 'uma', 'não', 'nosso', 'nossa', 'que', 'por', 'se', 'são', 'mais', 'este', 'esta', 'como', 'mas', 'seu'],
  nl: ['de', 'het', 'een', 'en', 'van', 'is', 'voor', 'met', 'in', 'op', 'wij', 'onze', 'niet', 'ook', 'zijn', 'dat', 'die', 'te', 'aan', 'door', 'maar', 'als', 'bij'],
};

// 'it-IT' / 'IT' / 'it_IT' all mean the same primary subtag.
function normalizeLangCode(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().toLowerCase().match(/^([a-z]{2,3})(?:[-_][a-z0-9]+)*$/i);
  return match ? match[1] : null;
}

// The site declaring its own language, in descending order of trust.
function langFromMarkup(html) {
  const htmlTag = findTags(html, 'html')[0];
  const declared = htmlTag && normalizeLangCode(htmlTag.attrs.lang);
  if (declared) return { lang: declared, source: 'html-lang' };

  for (const tag of findTags(html, 'meta')) {
    const property = String(tag.attrs.property || '').toLowerCase();
    const name = String(tag.attrs.name || '').toLowerCase();
    const equiv = String(tag.attrs['http-equiv'] || '').toLowerCase();

    if (property === 'og:locale') {
      const lang = normalizeLangCode(tag.attrs.content);
      if (lang) return { lang, source: 'og-locale' };
    }
    if (name === 'language' || equiv === 'content-language') {
      const lang = normalizeLangCode(tag.attrs.content);
      if (lang) return { lang, source: 'meta-language' };
    }
  }

  // A single hreflang value means a single-language site declaring which one.
  const hreflangs = [...new Set(
    findTags(html, 'link')
      .filter((tag) => String(tag.attrs.rel || '').toLowerCase().includes('alternate') && tag.attrs.hreflang)
      .map((tag) => normalizeLangCode(tag.attrs.hreflang))
      .filter((lang) => lang && lang !== 'x-default'),
  )];
  if (hreflangs.length === 1) return { lang: hreflangs[0], source: 'hreflang' };

  return null;
}

// Visible prose only: scripts, styles, tags and entities carry no language signal
// and would skew the counts (a jQuery bundle is full of English keywords).
function extractText(html) {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ');
}

function tokenize(text) {
  return text.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
}

// Stopword frequency. Returns null when there is not enough prose to judge.
function guessFromText(text, { minTokens = 40 } = {}) {
  const tokens = tokenize(text);
  if (tokens.length < minTokens) return null;

  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);

  const scores = Object.entries(STOPWORDS)
    .map(([lang, words]) => {
      const hits = words.reduce((sum, word) => sum + (counts.get(word) || 0), 0);
      return { lang, score: hits / tokens.length };
    })
    .sort((a, b) => b.score - a.score);

  const [best, runnerUp] = scores;
  if (!best || best.score === 0) return null;

  // A clear winner needs both a real signal and daylight over the next language;
  // Italian and Spanish, or Spanish and Portuguese, sit close together.
  const margin = runnerUp && runnerUp.score > 0 ? best.score / runnerUp.score : Infinity;
  const confidence = best.score >= 0.06 && margin >= 1.6 ? 'medium' : 'low';

  return { lang: best.lang, source: 'text', confidence, score: Number(best.score.toFixed(4)), margin: Number(margin.toFixed(2)) };
}

/**
 * Decide the site's language from its pages.
 *
 * @param {Array<{path: string, html: string}>} pages
 * @returns {{lang: string|null, source: string, confidence: 'high'|'medium'|'low'|'none', evidence: string|null}}
 *   `confidence: 'high'` means the site declared it and the caller may apply it.
 *   Anything lower is a suggestion for a human to confirm.
 */
function detectLanguage(pages) {
  for (const page of pages) {
    const declared = langFromMarkup(page.html);
    if (declared) {
      return {
        lang: declared.lang,
        source: declared.source,
        confidence: 'high',
        evidence: `declared as "${declared.lang}" in ${page.path}`,
      };
    }
  }

  const guess = guessFromText(pages.map((p) => extractText(p.html)).join(' '));
  if (guess) {
    return {
      lang: guess.lang,
      source: 'text',
      confidence: guess.confidence,
      evidence: `stopword analysis of the page text (score ${guess.score}, ${guess.margin}x the next language)`,
    };
  }

  return { lang: null, source: 'none', confidence: 'none', evidence: null };
}

module.exports = { STOPWORDS, normalizeLangCode, langFromMarkup, extractText, tokenize, guessFromText, detectLanguage };
