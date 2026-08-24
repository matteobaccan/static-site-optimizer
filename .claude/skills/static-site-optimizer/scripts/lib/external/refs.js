// Detection of external (off-origin) references in HTML and CSS.
//
// Scope rule, deliberate and load-bearing: only tags that LOAD a subresource are
// reported. <a href>, <form action> and <iframe src> are never rewritten — changing
// an outbound link or an embed changes what the page does, not how it loads.
const { findTags } = require('../html/tags');

// Hosts whose whole purpose is to phone home. Self-hosting them would either break
// them or silently keep the tracking alive, so they are report-only.
const TRACKER_HOSTS = [
  'google-analytics.com',
  'googletagmanager.com',
  'googlesyndication.com',
  'doubleclick.net',
  'stats.g.doubleclick.net',
  'connect.facebook.net',
  'facebook.net',
  'static.hotjar.com',
  'hotjar.com',
  'clarity.ms',
  'matomo.cloud',
  'cdn.segment.com',
  'mixpanel.com',
  'fullstory.com',
  'widget.intercom.io',
  'js.hs-scripts.com',
];

// Hosts that only work as a live third-party embed.
const EMBED_HOSTS = [
  'google.com/maps',
  'maps.google.com',
  'youtube.com',
  'youtube-nocookie.com',
  'player.vimeo.com',
  'open.spotify.com',
];

const DEFAULT_EXT = {
  stylesheet: '.css',
  script: '.js',
  font: '.woff2',
  image: '.png',
  media: '.bin',
  other: '.bin',
};

function normalizeUrl(url) {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return trimmed;
}

function isExternalUrl(url) {
  const normalized = normalizeUrl(url);
  return !!normalized && /^https?:\/\//i.test(normalized);
}

function hostOf(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;
  try {
    return new URL(normalized).host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function matchesHostList(url, list) {
  const normalized = normalizeUrl(url);
  if (!normalized) return false;
  const bare = normalized.replace(/^https?:\/\//i, '').replace(/^www\./, '');
  return list.some((entry) => bare === entry || bare.startsWith(`${entry}/`) || bare.startsWith(`${entry}?`));
}

function isTrackerUrl(url) {
  return matchesHostList(url, TRACKER_HOSTS);
}

function isEmbedUrl(url) {
  return matchesHostList(url, EMBED_HOSTS);
}

// Splits a srcset value into candidates, preserving each descriptor.
function parseSrcset(value) {
  return String(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [url, ...descriptor] = part.split(/\s+/);
      return { url, descriptor: descriptor.join(' ') };
    });
}

function stringifySrcset(candidates) {
  return candidates.map((c) => (c.descriptor ? `${c.url} ${c.descriptor}` : c.url)).join(', ');
}

// What a <link> actually pulls down, from rel/as. Returns null for links that load
// nothing (canonical, alternate, preconnect, dns-prefetch...).
function linkKind(attrs) {
  const rel = String(attrs.rel || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (rel.includes('stylesheet')) return 'stylesheet';
  if (rel.includes('icon') || rel.includes('apple-touch-icon') || rel.includes('shortcut')) return 'image';
  if (rel.includes('manifest')) return 'other';
  if (rel.includes('modulepreload')) return 'script';
  if (rel.includes('preload')) {
    const as = String(attrs.as || '').toLowerCase();
    if (as === 'style') return 'stylesheet';
    if (as === 'script') return 'script';
    if (as === 'font') return 'font';
    if (as === 'image') return 'image';
    return 'other';
  }
  return null;
}

const LOADERS = [
  { tag: 'link', attr: 'href', kind: linkKind },
  { tag: 'script', attr: 'src', kind: () => 'script' },
  { tag: 'img', attr: 'src', kind: () => 'image' },
  { tag: 'img', attr: 'srcset', kind: () => 'image', srcset: true },
  { tag: 'source', attr: 'src', kind: () => 'media' },
  { tag: 'source', attr: 'srcset', kind: () => 'image', srcset: true },
  { tag: 'video', attr: 'src', kind: () => 'media' },
  { tag: 'video', attr: 'poster', kind: () => 'image' },
  { tag: 'audio', attr: 'src', kind: () => 'media' },
  { tag: 'track', attr: 'src', kind: () => 'other' },
];

// Every external subresource an HTML document loads, in document order. Each ref
// carries its tag range so a caller can rewrite it in place.
function findHtmlExternalRefs(html) {
  const refs = [];

  for (const loader of LOADERS) {
    for (const tag of findTags(html, loader.tag)) {
      const raw = tag.attrs[loader.attr];
      if (!raw) continue;
      const kind = loader.kind(tag.attrs);
      if (!kind) continue;

      const urls = loader.srcset ? parseSrcset(raw).map((c) => c.url) : [raw];
      const external = urls.filter(isExternalUrl).map(normalizeUrl);
      if (external.length === 0) continue;

      refs.push({
        tagName: loader.tag,
        attr: loader.attr,
        srcset: !!loader.srcset,
        kind,
        urls: external,
        rawValue: raw,
        attrs: tag.attrs,
        selfClosing: tag.selfClosing,
        start: tag.start,
        end: tag.end,
      });
    }
  }

  return refs.sort((a, b) => a.start - b.start);
}

// Hints that exist only to speed up a third-party host. Once nothing external is
// left they are dead weight, so they are surfaced separately from real loads.
function findPreconnectHints(html) {
  return findTags(html, 'link')
    .filter((tag) => {
      const rel = String(tag.attrs.rel || '').toLowerCase().split(/\s+/);
      return (rel.includes('preconnect') || rel.includes('dns-prefetch')) && isExternalUrl(tag.attrs.href);
    })
    .map((tag) => ({ url: normalizeUrl(tag.attrs.href), host: hostOf(tag.attrs.href), start: tag.start, end: tag.end }));
}

function findTrackers(html) {
  const scripts = findTags(html, 'script')
    .filter((tag) => isTrackerUrl(tag.attrs.src))
    .map((tag) => ({ url: normalizeUrl(tag.attrs.src), host: hostOf(tag.attrs.src), via: 'script' }));

  const iframes = findTags(html, 'iframe')
    .filter((tag) => isTrackerUrl(tag.attrs.src))
    .map((tag) => ({ url: normalizeUrl(tag.attrs.src), host: hostOf(tag.attrs.src), via: 'iframe' }));

  return [...scripts, ...iframes];
}

function findThirdPartyEmbeds(html) {
  return findTags(html, 'iframe')
    .filter((tag) => isExternalUrl(tag.attrs.src) && !isTrackerUrl(tag.attrs.src))
    .map((tag) => ({ url: normalizeUrl(tag.attrs.src), host: hostOf(tag.attrs.src), known: isEmbedUrl(tag.attrs.src) }));
}

const CSS_IMPORT_RE = /@import\s+(?:url\(\s*)?['"]?([^'")\s;]+)['"]?\s*\)?[^;]*;/gi;
const CSS_URL_RE = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;

function cssRefKind(url) {
  return /\.(woff2?|ttf|otf|eot)(\?|#|$)/i.test(url) ? 'font' : 'image';
}

// Inline payloads and same-document fragments (SVG sprites, filters) resolve to
// nothing fetchable and must never be rewritten.
function isNonFetchable(url) {
  return !url || /^(data:|#|blob:|about:)/i.test(url.trim());
}

// External refs inside a stylesheet: @import first (it drags in a whole extra
// stylesheet), then plain url() for fonts and images.
//
// `includeRelative` matters when the stylesheet itself came from another origin:
// its relative url()s resolve against THAT origin, so once the file is copied
// locally they are external too and have to be followed. The caller resolves them
// against the stylesheet url before deciding.
function findCssExternalRefs(css, { includeRelative = false } = {}) {
  const refs = [];
  const importRanges = [];
  const wanted = (url) => !isNonFetchable(url) && (includeRelative || isExternalUrl(url));
  let match;

  CSS_IMPORT_RE.lastIndex = 0;
  while ((match = CSS_IMPORT_RE.exec(css)) !== null) {
    importRanges.push([match.index, match.index + match[0].length]);
    if (!wanted(match[1])) continue;
    refs.push({
      type: 'import',
      kind: 'stylesheet',
      url: normalizeUrl(match[1]),
      raw: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  CSS_URL_RE.lastIndex = 0;
  while ((match = CSS_URL_RE.exec(css)) !== null) {
    if (importRanges.some(([s, e]) => match.index >= s && match.index < e)) continue;
    if (!wanted(match[1])) continue;
    const url = normalizeUrl(match[1]);
    refs.push({
      type: 'url',
      kind: cssRefKind(url),
      url,
      raw: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return refs.sort((a, b) => a.start - b.start);
}

module.exports = {
  TRACKER_HOSTS,
  EMBED_HOSTS,
  DEFAULT_EXT,
  normalizeUrl,
  isExternalUrl,
  isTrackerUrl,
  isEmbedUrl,
  hostOf,
  parseSrcset,
  stringifySrcset,
  linkKind,
  cssRefKind,
  isNonFetchable,
  findHtmlExternalRefs,
  findPreconnectHints,
  findTrackers,
  findThirdPartyEmbeds,
  findCssExternalRefs,
};
