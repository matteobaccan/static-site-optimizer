// Downloads external subresources into the site and rewrites the references that
// point at them, so the page loads entirely from its own origin.
//
// A stylesheet is followed one level deeper: its own @import/url() refs (fonts,
// background images) are fetched too and rewritten relative to where the stylesheet
// now lives. That is what makes a Google Fonts <link> collapse into local .woff2
// files without any font-specific code path.
const path = require('node:path');
const crypto = require('node:crypto');
const { stringifyTag } = require('../html/tags');
const {
  DEFAULT_EXT,
  findHtmlExternalRefs,
  findCssExternalRefs,
  parseSrcset,
  stringifySrcset,
  isExternalUrl,
  isTrackerUrl,
  hostOf,
} = require('./refs');

const KIND_LABEL = {
  stylesheet: 'Stylesheet',
  script: 'Script',
  font: 'Font',
  image: 'Image',
  media: 'Media',
};

const SUBDIR = {
  stylesheet: 'css',
  script: 'js',
  font: 'fonts',
  image: 'img',
  media: 'media',
  other: 'misc',
};

const CONTENT_TYPE_EXT = {
  'text/css': '.css',
  'text/javascript': '.js',
  'application/javascript': '.js',
  'font/woff2': '.woff2',
  'font/woff': '.woff',
  'font/ttf': '.ttf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/svg+xml': '.svg',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
};

function shortHash(value) {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 8);
}

function extFromContentType(contentType) {
  if (!contentType) return null;
  return CONTENT_TYPE_EXT[String(contentType).split(';')[0].trim().toLowerCase()] || null;
}

// Deterministic local name for a remote asset. The URL hash is always appended so
// two different remote files that share a basename can never collide.
function localFileName(url, kind, contentType) {
  let base = '';
  try {
    base = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '');
  } catch {
    base = '';
  }
  base = base.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^-+/, '');

  let ext = path.posix.extname(base);
  let stem = ext ? base.slice(0, -ext.length) : base;
  if (!ext) ext = extFromContentType(contentType) || DEFAULT_EXT[kind] || '.bin';
  if (!stem) stem = kind;

  return `${stem.slice(0, 40)}-${shortHash(url)}${ext}`;
}

// Path of `assetSiteRel` as seen from a document sitting in `fromDirSiteRel`.
function relativeFrom(fromDirSiteRel, assetSiteRel) {
  return path.posix.relative(fromDirSiteRel || '.', assetSiteRel);
}

// Fetches remote assets once each and drops them under <siteDir>/<assetsDir>/.
class AssetStore {
  constructor(siteDir, deps, assetsDir = 'assets') {
    this.siteDir = siteDir;
    this.deps = deps;
    this.assetsDir = assetsDir;
    this.cache = new Map(); // url -> site-relative path (or null if it failed)
    this.pending = new Set(); // cycle guard for @import chains
    this.downloaded = [];
    this.failures = [];
  }

  async ensure(url, kind) {
    if (this.cache.has(url)) return this.cache.get(url);
    if (this.pending.has(url)) return null; // circular @import
    this.pending.add(url);

    try {
      const siteRel = kind === 'stylesheet'
        ? await this.#storeStylesheet(url)
        : await this.#storeBinary(url, kind);
      this.cache.set(url, siteRel);
      return siteRel;
    } catch (err) {
      this.failures.push({ url, reason: err && err.message ? err.message : String(err) });
      this.cache.set(url, null);
      return null;
    } finally {
      this.pending.delete(url);
    }
  }

  async #write(siteRel, data) {
    const abs = path.join(this.siteDir, siteRel);
    await this.deps.mkdir(path.dirname(abs), { recursive: true });
    await this.deps.writeFile(abs, data);
  }

  async #storeBinary(url, kind) {
    const { bytes, contentType } = await this.deps.fetchBinary(url);
    if (!bytes || bytes.length === 0) throw new Error('empty response');
    const siteRel = path.posix.join(this.assetsDir, SUBDIR[kind] || 'misc', localFileName(url, kind, contentType));
    await this.#write(siteRel, bytes);
    this.downloaded.push({ url, siteRel, kind, bytes: bytes.length });
    return siteRel;
  }

  async #storeStylesheet(url) {
    const cssText = await this.deps.fetchText(url);
    const siteRel = path.posix.join(this.assetsDir, 'css', localFileName(url, 'stylesheet', 'text/css'));
    const cssDir = path.posix.dirname(siteRel);

    // Resolve the stylesheet's own refs against ITS url, not the page's.
    const rewritten = await rewriteCssRefs(cssText, cssDir, this, url);
    await this.#write(siteRel, ensureFontDisplaySwap(rewritten.css));
    this.downloaded.push({ url, siteRel, kind: 'stylesheet', bytes: Buffer.byteLength(rewritten.css) });
    return siteRel;
  }
}

// A downloaded webfont stylesheet often omits font-display, which leaves text
// invisible while the file loads. Adding swap is safe and only touches @font-face
// blocks that do not already declare it.
function ensureFontDisplaySwap(css) {
  return css.replace(/@font-face\s*\{[^}]*\}/gi, (block) => (
    /font-display\s*:/i.test(block)
      ? block
      : block.replace(/\{/, '{\n  font-display: swap;')
  ));
}

function resolveAgainst(baseUrl, url) {
  if (!baseUrl) return url;
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

// Rewrites the external url()/@import refs of a stylesheet to local paths.
// `cssDirSiteRel` is where the stylesheet itself will live inside the site.
async function rewriteCssRefs(css, cssDirSiteRel, store, baseUrl = null) {
  // A remote stylesheet's relative refs point at ITS origin, so they count as
  // external here; a local stylesheet's relative refs are already ours.
  const refs = findCssExternalRefs(css, { includeRelative: !!baseUrl });
  const findings = [];
  let result = css;

  // Back to front: earlier offsets stay valid as we splice.
  for (const ref of [...refs].reverse()) {
    const absoluteUrl = resolveAgainst(baseUrl, ref.url);
    if (isTrackerUrl(absoluteUrl) || !isExternalUrl(absoluteUrl)) continue;

    const siteRel = await store.ensure(absoluteUrl, ref.kind);
    if (!siteRel) {
      findings.push({
        code: 'external-asset-download-failed',
        category: 'external-refs',
        autoFixed: false,
        message: `Could not download ${absoluteUrl}; the external reference is left unchanged`,
      });
      continue;
    }

    const localPath = relativeFrom(cssDirSiteRel, siteRel);
    const replacement = ref.type === 'import'
      ? `@import url('${localPath}');`
      : `url('${localPath}')`;
    result = result.slice(0, ref.start) + replacement + result.slice(ref.end);

    findings.push({
      code: 'self-hosted-css-asset',
      category: 'external-refs',
      autoFixed: true,
      message: `External ${(KIND_LABEL[ref.kind] || 'asset').toLowerCase()} ${absoluteUrl} pulled local into ${siteRel}`,
    });
  }

  return { css: result, findings };
}

// Groups refs that share a tag range, so a tag carrying both src and srcset is
// rewritten once with every attribute change applied.
function groupRefsByTag(refs) {
  const groups = new Map();
  for (const ref of refs) {
    const key = `${ref.start}:${ref.end}`;
    if (!groups.has(key)) {
      groups.set(key, { start: ref.start, end: ref.end, tagName: ref.tagName, attrs: { ...ref.attrs }, selfClosing: ref.selfClosing, refs: [] });
    }
    groups.get(key).refs.push(ref);
  }
  return [...groups.values()].sort((a, b) => a.start - b.start);
}

// Rewrites every external subresource reference in an HTML document to a local
// copy. `docDirSiteRel` is the document's own directory relative to the site root.
async function rewriteHtmlRefs(html, docDirSiteRel, store) {
  const groups = groupRefsByTag(findHtmlExternalRefs(html));
  const findings = [];
  let result = html;

  for (const group of [...groups].reverse()) {
    const attrs = { ...group.attrs };
    let changed = false;

    for (const ref of group.refs) {
      if (ref.srcset) {
        const candidates = parseSrcset(ref.rawValue);
        let touched = false;
        for (const candidate of candidates) {
          if (!isExternalUrl(candidate.url) || isTrackerUrl(candidate.url)) continue;
          const siteRel = await store.ensure(candidate.url, ref.kind);
          if (!siteRel) {
            findings.push(downloadFailed(candidate.url));
            continue;
          }
          candidate.url = relativeFrom(docDirSiteRel, siteRel);
          touched = true;
          findings.push(selfHosted(ref.kind, candidate.url, siteRel));
        }
        if (touched) {
          attrs[ref.attr] = stringifySrcset(candidates);
          changed = true;
        }
        continue;
      }

      const url = ref.urls[0];
      if (isTrackerUrl(url)) continue;
      const siteRel = await store.ensure(url, ref.kind);
      if (!siteRel) {
        findings.push(downloadFailed(url));
        continue;
      }
      attrs[ref.attr] = relativeFrom(docDirSiteRel, siteRel);
      changed = true;
      findings.push(selfHosted(ref.kind, url, siteRel));

      // A self-hosted stylesheet no longer needs a crossorigin handshake.
      if (ref.kind === 'stylesheet' || ref.kind === 'font') delete attrs.crossorigin;
      delete attrs.integrity; // the SRI hash describes the remote copy, not ours
    }

    if (changed) {
      const newRaw = stringifyTag(group.tagName, attrs, group.selfClosing);
      result = result.slice(0, group.start) + newRaw + result.slice(group.end);
    }
  }

  return { html: result, findings };
}

function selfHosted(kind, url, siteRel) {
  const label = KIND_LABEL[kind] || 'Asset';
  return {
    code: 'self-hosted-asset',
    category: 'external-refs',
    autoFixed: true,
    message: `External ${label.toLowerCase()} ${url} pulled local into ${siteRel}`,
  };
}

function downloadFailed(url) {
  return {
    code: 'external-asset-download-failed',
    category: 'external-refs',
    autoFixed: false,
    message: `Could not download ${url} (host ${hostOf(url) || 'unknown'}); the external reference is left unchanged`,
  };
}

module.exports = {
  AssetStore,
  SUBDIR,
  shortHash,
  extFromContentType,
  localFileName,
  relativeFrom,
  resolveAgainst,
  ensureFontDisplaySwap,
  rewriteCssRefs,
  rewriteHtmlRefs,
  groupRefsByTag,
};
