#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { discoverSites } = require('./lib/discover-sites');
const { checkAndFixDocumentMeta } = require('./lib/document-checks');
const { fixImgTags } = require('./lib/img-fixes');
const { fixExternalLinks } = require('./lib/link-fixes');
const { generateRobotsTxt, generateSitemapXml } = require('./lib/scaffold-seo');
const { generateReadme } = require('./lib/scaffold-readme');
const { generateLlmsTxt } = require('./lib/scaffold-llms');
const { generateFaviconIco } = require('./lib/favicon-generator');
const { findOversizedImages } = require('./lib/image-compress');
const { parseGoogleFontsImport, selfHostGoogleFonts } = require('./lib/font-selfhost');

async function realFetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
  return res.text();
}

async function realFetchBuffer(url) {
  const res = await fetch(url);
  return Buffer.from(await res.arrayBuffer());
}

function listFilesRecursive(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full));
    else out.push(full);
  }
  return out;
}

function extractTitle(html) {
  const match = html.match(/<title>([^<]*)<\/title>/i);
  return match ? match[1].trim() : null;
}

async function auditSite(siteDir, fix) {
  const findings = [];
  const indexPath = path.join(siteDir, 'index.html');
  const originalHtml = fs.readFileSync(indexPath, 'utf8');
  let html = originalHtml;

  const docResult = checkAndFixDocumentMeta(html);
  html = docResult.html;
  findings.push(...docResult.findings);

  const imgResult = fixImgTags(html, (src) => {
    if (/^https?:\/\//i.test(src)) return null;
    return path.join(siteDir, src);
  });
  html = imgResult.html;
  findings.push(...imgResult.findings);

  const linkResult = fixExternalLinks(html);
  html = linkResult.html;
  findings.push(...linkResult.findings);

  if (fix && html !== originalHtml) fs.writeFileSync(indexPath, html);

  const title = extractTitle(html);

  const robotsPath = path.join(siteDir, 'robots.txt');
  if (!fs.existsSync(robotsPath)) {
    findings.push({ code: 'missing-robots-txt', category: 'seo', autoFixed: !!fix, message: 'robots.txt mancante' });
    if (fix) fs.writeFileSync(robotsPath, generateRobotsTxt());
  }

  const sitemapPath = path.join(siteDir, 'sitemap.xml');
  if (!fs.existsSync(sitemapPath)) {
    findings.push({ code: 'missing-sitemap-xml', category: 'seo', autoFixed: !!fix, message: 'sitemap.xml mancante' });
    if (fix) fs.writeFileSync(sitemapPath, generateSitemapXml(['index.html']));
  }

  const readmePath = path.join(siteDir, 'README.md');
  if (!fs.existsSync(readmePath)) {
    findings.push({ code: 'missing-readme', category: 'code-quality', autoFixed: !!fix, message: 'README.md mancante' });
    if (fix) {
      const pkgPath = path.join(siteDir, 'package.json');
      const packageJson = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf8')) : null;
      const subdirs = fs.readdirSync(siteDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name !== '.git')
        .map((e) => e.name);
      fs.writeFileSync(readmePath, generateReadme({ folderName: path.basename(siteDir), title, packageJson, subdirs }));
    }
  }

  const llmsPath = path.join(siteDir, 'llms.txt');
  if (!fs.existsSync(llmsPath)) {
    findings.push({ code: 'missing-llms-txt', category: 'seo', autoFixed: !!fix, message: 'llms.txt mancante' });
    if (fix) {
      fs.writeFileSync(llmsPath, generateLlmsTxt({
        title: title || path.basename(siteDir),
        summary: 'Sito web statico.',
        pages: [{ path: 'index.html', description: 'Homepage del sito' }],
      }));
    }
  }

  const faviconPath = path.join(siteDir, 'favicon.ico');
  if (!fs.existsSync(faviconPath)) {
    findings.push({ code: 'missing-favicon', category: 'code-quality', autoFixed: !!fix, message: "favicon.ico mancante, generato un placeholder da sostituire con un'icona di brand reale" });
    if (fix) {
      const letter = (title || path.basename(siteDir)).trim()[0] || '0';
      fs.writeFileSync(faviconPath, generateFaviconIco(letter, '#1a1a2e', '#e94560'));
    }
  }

  for (const img of findOversizedImages(siteDir, listFilesRecursive, (p) => fs.statSync(p))) {
    findings.push({ code: 'oversized-image', category: 'performance', autoFixed: false, message: `Immagine ${path.relative(siteDir, img.path)} pesa ${Math.round(img.size / 1024)}KB, valuta la compressione (es. npx sharp-cli)` });
  }

  const cssPath = path.join(siteDir, 'index.css');
  if (fs.existsSync(cssPath) && parseGoogleFontsImport(fs.readFileSync(cssPath, 'utf8'))) {
    if (fix) {
      const result = await selfHostGoogleFonts(cssPath, siteDir, {
        readFile: (p) => fs.promises.readFile(p, 'utf8'),
        writeFile: (p, c) => fs.promises.writeFile(p, c),
        mkdir: (p, opts) => fs.promises.mkdir(p, opts),
        fetchText: realFetchText,
        fetchBuffer: realFetchBuffer,
      });
      findings.push(...result.findings);
    } else {
      findings.push({ code: 'external-google-fonts', category: 'performance', autoFixed: false, message: 'Font Google Fonts caricati da CDN esterno, possono essere resi locali' });
    }
  }

  return findings;
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--discover') {
    process.stdout.write(JSON.stringify({ sites: discoverSites(args[1] || '.') }, null, 2));
    return;
  }

  const siteDir = path.resolve(args[0]);
  const fix = args.includes('--fix');
  const findings = await auditSite(siteDir, fix);
  process.stdout.write(JSON.stringify({ site: siteDir, findings }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
