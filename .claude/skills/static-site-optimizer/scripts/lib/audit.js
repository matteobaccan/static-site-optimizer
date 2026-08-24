// Orchestration: walk a site, run every check over it, and — in fix mode — apply
// the safe subset in place.
//
// Two modes, one code path: without `fix` nothing is written and every finding is
// reported with autoFixed:false; with `fix` the safe subset is applied.
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const { checkAndFixDocumentMeta } = require('./html/document');
const { fixImgTags } = require('./html/images');
const { fixExternalLinks, fixContactLinks, checkOfficeDocuments } = require('./html/links');
const { generateRobotsTxt, generateSitemapXml } = require('./scaffold/seo');
const { generateReadme } = require('./scaffold/readme');
const { generateLlmsTxt } = require('./scaffold/llms');
const { generateFaviconIco } = require('./assets/favicon');
const { findOversizedImages, compressImage, DEFAULT_THRESHOLD_BYTES } = require('./assets/compress');
const { AssetStore, rewriteHtmlRefs, rewriteCssRefs } = require('./external/self-host');
const { buildExternalReportFindings, describeSelfHostableRefs, describeCssExternalRefs } = require('./external/findings');
const { listFilesRecursive, findHtmlPages, findCssFiles, extractTitle, extractMetaDescription } = require('./site/files');
const { detectLanguage } = require('./site/language');

// Google Fonts (and a few CDNs) serve different payloads to non-browser clients —
// woff2 for a browser UA, legacy ttf otherwise. Ask for the modern one.
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const netDeps = {
  async fetchText(url) {
    const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  },
  async fetchBinary(url) {
    const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { bytes: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') };
  },
  writeFile: (p, data) => fs.promises.writeFile(p, data),
  mkdir: (p, opts) => fs.promises.mkdir(p, opts),
};

const compressDeps = {
  run: (cmd, args) => new Promise((resolve, reject) => {
    execFile(cmd, args, { shell: process.platform === 'win32' }, (err, stdout, stderr) => (
      err ? reject(new Error(String(stderr || err.message).trim().split('\n').pop())) : resolve(stdout)
    ));
  }),
  statSize: (p) => fs.statSync(p).size,
  copyFile: (from, to) => fs.promises.copyFile(from, to),
  removeDir: (p) => fs.promises.rm(p, { recursive: true, force: true }),
  fileExists: (p) => fs.existsSync(p),
};

/**
 * Settle on the language to stamp on <html lang>, and say where it came from.
 *
 * An explicit --lang always wins. Otherwise the site is only allowed to speak for
 * itself: a language DECLARED somewhere in its own markup may be applied, while a
 * text heuristic is returned as a suggestion and applied to nothing. That keeps
 * the same rule the optimizer uses for domain names — use what the site states,
 * never what it seems to imply.
 */
function resolveLanguage(pages, explicitLang) {
  const detected = detectLanguage(pages);

  if (explicitLang) {
    return { lang: explicitLang, source: 'flag', applied: true, detected };
  }
  if (detected.confidence === 'high') {
    return { lang: detected.lang, source: detected.source, applied: true, detected };
  }
  return { lang: null, source: detected.source, applied: false, suggestion: detected.lang, detected };
}

function pageLabel(pageRel) {
  return pageRel === 'index.html' ? null : pageRel;
}

function dirOf(pageRel) {
  const dir = path.posix.dirname(pageRel);
  return dir === '.' ? '' : dir;
}

async function processPage(siteDir, pageRel, options, store) {
  const { fix, lang } = options;
  const findings = [];
  const abs = path.join(siteDir, pageRel);
  const originalHtml = fs.readFileSync(abs, 'utf8');
  const docDir = dirOf(pageRel);
  let html = originalHtml;

  const stamp = (list) => findings.push(...list.map((f) => ({ ...f, page: pageRel, autoFixed: fix && f.autoFixed !== false })));

  const doc = checkAndFixDocumentMeta(html, { lang });
  html = doc.html;
  stamp(doc.findings);

  const imgs = fixImgTags(html, (src) => {
    if (/^(https?:)?\/\//i.test(src) || src.startsWith('data:')) return null;
    // A root-relative src resolves from the site root, not from the page's folder.
    return src.startsWith('/') ? path.join(siteDir, src) : path.join(siteDir, docDir, src);
  });
  html = imgs.html;
  stamp(imgs.findings);

  const links = fixExternalLinks(html);
  html = links.html;
  stamp(links.findings);

  const contacts = fixContactLinks(html);
  html = contacts.html;
  stamp(contacts.findings);

  findings.push(...checkOfficeDocuments(html).findings.map((f) => ({ ...f, page: pageRel, autoFixed: false })));

  // The point of the skill: pull every subresource onto the site's own origin.
  if (fix) {
    const selfHosted = await rewriteHtmlRefs(html, docDir, store);
    html = selfHosted.html;
    findings.push(...selfHosted.findings.map((f) => ({ ...f, page: pageRel })));
  } else {
    findings.push(...describeSelfHostableRefs(html, pageLabel(pageRel)).map((f) => ({ ...f, page: pageRel })));
  }

  // Trackers, embeds and stale preconnect hints are always report-only.
  findings.push(...buildExternalReportFindings(html, pageLabel(pageRel)).map((f) => ({ ...f, page: pageRel })));

  if (!extractMetaDescription(html)) {
    findings.push({
      code: 'missing-meta-description',
      category: 'seo',
      autoFixed: false,
      page: pageRel,
      message: 'No meta description. It has to be written by hand: the right text depends on what the page says, and cannot be generated mechanically.',
    });
  }

  if (fix && html !== originalHtml) fs.writeFileSync(abs, html);

  return { findings, title: extractTitle(html) };
}

async function processStylesheets(siteDir, fix, store) {
  const findings = [];

  for (const cssRel of findCssFiles(siteDir)) {
    const abs = path.join(siteDir, cssRel);
    const original = fs.readFileSync(abs, 'utf8');

    if (!fix) {
      findings.push(...describeCssExternalRefs(original, cssRel));
      continue;
    }

    const rewritten = await rewriteCssRefs(original, dirOf(cssRel), store);
    findings.push(...rewritten.findings.map((f) => ({ ...f, page: cssRel })));
    if (rewritten.css !== original) fs.writeFileSync(abs, rewritten.css);
  }

  return findings;
}

function scaffoldMissingFiles(siteDir, fix, pages, homeTitle) {
  const findings = [];
  const add = (code, category, message, filename, generate) => {
    const target = path.join(siteDir, filename);
    if (fs.existsSync(target)) return;
    findings.push({ code, category, autoFixed: !!fix, message });
    if (fix) fs.writeFileSync(target, generate());
  };

  add('missing-robots-txt', 'seo', 'No robots.txt', 'robots.txt', generateRobotsTxt);
  add(
    'missing-sitemap-xml',
    'seo',
    `No sitemap.xml (${pages.length} indexable ${pages.length === 1 ? 'page' : 'pages'})`,
    'sitemap.xml',
    () => generateSitemapXml(pages),
  );

  add('missing-readme', 'code-quality', 'No README.md', 'README.md', () => {
    const pkgPath = path.join(siteDir, 'package.json');
    const packageJson = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf8')) : null;
    const subdirs = fs.readdirSync(siteDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== '.git' && e.name !== 'node_modules')
      .map((e) => e.name);
    return generateReadme({ folderName: path.basename(siteDir), title: homeTitle, packageJson, subdirs });
  });

  add('missing-llms-txt', 'seo', 'No llms.txt', 'llms.txt', () => generateLlmsTxt({
    title: homeTitle || path.basename(siteDir),
    summary: 'A static website.',
    pages: pages.map((p) => ({ path: p, description: p === 'index.html' ? 'Site homepage' : p.replace(/\.html?$/i, '') })),
  }));

  add(
    'missing-favicon',
    'code-quality',
    'No favicon.ico; a placeholder was generated and must be replaced with real brand artwork',
    'favicon.ico',
    () => generateFaviconIco(((homeTitle || path.basename(siteDir)).trim()[0] || '0'), '#1a1a2e', '#e94560'),
  );

  return findings;
}

async function processImages(siteDir, compress) {
  const findings = [];

  for (const img of findOversizedImages(siteDir, listFilesRecursive, (p) => fs.statSync(p))) {
    const rel = path.relative(siteDir, img.path).split(path.sep).join('/');
    const kb = Math.round(img.size / 1024);

    if (!compress) {
      findings.push({
        code: 'oversized-image',
        category: 'performance',
        autoFixed: false,
        message: `Image ${rel} weighs ${kb}KB (threshold ${Math.round(DEFAULT_THRESHOLD_BYTES / 1024)}KB). Re-encode it with --compress-images.`,
      });
      continue;
    }

    const result = await compressImage(img.path, compressDeps);
    findings.push(result.compressed
      ? {
        code: 'compressed-image',
        category: 'performance',
        autoFixed: true,
        message: `Image ${rel} re-encoded from ${kb}KB to ${Math.round(result.after / 1024)}KB (same format, same dimensions)`,
      }
      : {
        code: 'oversized-image',
        category: 'performance',
        autoFixed: false,
        message: `Image ${rel} weighs ${kb}KB and was not re-encoded: ${result.reason}`,
      });
  }

  return findings;
}

async function auditSite(siteDir, { fix = false, compress = false, lang = null } = {}) {
  const findings = [];
  const pages = findHtmlPages(siteDir);
  if (pages.length === 0) throw new Error(`No HTML page found in ${siteDir}`);

  const language = resolveLanguage(
    pages.map((p) => ({ path: p, html: fs.readFileSync(path.join(siteDir, p), 'utf8') })),
    lang,
  );

  const store = new AssetStore(siteDir, netDeps);

  let homeTitle = null;
  for (const pageRel of pages) {
    const result = await processPage(siteDir, pageRel, { fix, lang: language.lang }, store);
    findings.push(...result.findings);
    if (pageRel === pages[0]) homeTitle = result.title;
  }

  findings.push(...(await processStylesheets(siteDir, fix, store)));
  findings.push(...scaffoldMissingFiles(siteDir, fix, pages, homeTitle));

  // Fonts pulled in through a downloaded stylesheet are not reported one by one —
  // eight woff2 subsets would drown the report — so surface the total instead.
  if (fix && store.downloaded.length > 0) {
    const bytes = store.downloaded.reduce((sum, a) => sum + a.bytes, 0);
    findings.push({
      code: 'self-hosting-summary',
      category: 'external-refs',
      autoFixed: true,
      message: `${store.downloaded.length} files downloaded and served locally from assets/ (${Math.round(bytes / 1024)}KB total)`,
    });
  }

  findings.push(...(await processImages(siteDir, compress)));

  return { findings, language };
}

function summarize(findings) {
  return {
    total: findings.length,
    autoFixed: findings.filter((f) => f.autoFixed).length,
    open: findings.filter((f) => !f.autoFixed).length,
    externalRefsRemaining: findings.filter((f) => f.code === 'external-resource' || f.code === 'external-asset-download-failed').length,
    selfHostedFiles: findings.filter((f) => f.code === 'self-hosted-asset' || f.code === 'self-hosted-css-asset').length,
  };
}

module.exports = { auditSite, resolveLanguage, summarize };
