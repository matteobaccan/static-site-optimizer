const fs = require('node:fs');
const path = require('node:path');

const IGNORED_DIRS = new Set(['.git', 'node_modules', '.audit-tmp', 'vendor']);

function listFilesRecursive(dir, ignored = IGNORED_DIRS) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full, ignored));
    else out.push(full);
  }
  return out;
}

function toSiteRelative(siteDir, absPath) {
  return path.relative(siteDir, absPath).split(path.sep).join('/');
}

// Every HTML page of the site, site-relative and posix-separated, with the
// homepage first so sitemap/llms.txt lead with it.
function findHtmlPages(siteDir) {
  return listFilesRecursive(siteDir)
    .filter((file) => /\.html?$/i.test(file))
    .map((file) => toSiteRelative(siteDir, file))
    .sort((a, b) => {
      if (a === 'index.html') return -1;
      if (b === 'index.html') return 1;
      return a.localeCompare(b);
    });
}

// Local stylesheets. Anything already parked under the generated assets/ folder is
// skipped: it was written by the optimizer and its refs are local by construction.
function findCssFiles(siteDir, assetsDir = 'assets') {
  return listFilesRecursive(siteDir)
    .filter((file) => /\.css$/i.test(file))
    .map((file) => toSiteRelative(siteDir, file))
    .filter((rel) => !rel.startsWith(`${assetsDir}/`))
    .sort();
}

function extractTitle(html) {
  const match = html.match(/<title>([^<]*)<\/title>/i);
  return match ? match[1].trim() : null;
}

function extractMetaDescription(html) {
  const match = html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i);
  return match ? match[1].trim() : null;
}

module.exports = {
  IGNORED_DIRS,
  listFilesRecursive,
  toSiteRelative,
  findHtmlPages,
  findCssFiles,
  extractTitle,
  extractMetaDescription,
};
