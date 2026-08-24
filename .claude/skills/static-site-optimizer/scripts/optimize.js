#!/usr/bin/env node
// static-site-optimizer — command line entry point.
// Argument parsing and JSON output only; the work lives in lib/audit.js.
const fs = require('node:fs');
const path = require('node:path');
const { discoverSites } = require('./lib/site/discover');
const { auditSite, summarize } = require('./lib/audit');
const { findHtmlPages } = require('./lib/site/files');
const { detectLanguage } = require('./lib/site/language');

const FLAGS_WITH_VALUE = new Set(['--lang']);

function parseArgs(argv) {
  const positional = [];
  const flags = new Set();
  const values = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('-')) {
      positional.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg : arg.slice(0, eq);
    if (FLAGS_WITH_VALUE.has(name)) {
      values[name] = eq === -1 ? argv[++i] : arg.slice(eq + 1);
      continue;
    }
    flags.add(name);
  }

  return {
    positional,
    discover: flags.has('--discover'),
    detectLang: flags.has('--detect-lang'),
    fix: flags.has('--fix'),
    compress: flags.has('--compress-images'),
    lang: values['--lang'] || null,
    help: flags.has('--help') || flags.has('-h') || argv.length === 0,
  };
}

const USAGE = `static-site-optimizer

  node optimize.js --discover <dir>        list the static sites under <dir>
  node optimize.js <site> [options]

  --fix               apply the safe mechanical fixes, self-hosting included
  --compress-images   re-encode images over 150KB via npx sharp-cli
                      (same format and dimensions; needs network on first use)
  --lang <code>       language to stamp on <html lang> when the attribute is
                      missing. Omit it and the site is asked instead: a language
                      it declares itself is used, a text-only guess is reported
                      as a suggestion and applied to nothing.

  node optimize.js <site> --detect-lang    report the detected language and stop

Without --fix nothing is written and nothing is fetched: the output is a
report-only JSON list of findings.
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(USAGE);
    return;
  }

  if (args.discover) {
    process.stdout.write(JSON.stringify({ sites: discoverSites(args.positional[0] || '.') }, null, 2));
    return;
  }

  const siteDir = path.resolve(args.positional[0]);

  if (args.detectLang) {
    const pages = findHtmlPages(siteDir).map((p) => ({ path: p, html: fs.readFileSync(path.join(siteDir, p), 'utf8') }));
    process.stdout.write(JSON.stringify({ site: siteDir, ...detectLanguage(pages) }, null, 2));
    return;
  }

  const { findings, language } = await auditSite(siteDir, { fix: args.fix, compress: args.compress, lang: args.lang });

  process.stdout.write(JSON.stringify({
    site: siteDir,
    mode: args.fix ? 'fix' : 'report',
    language,
    summary: summarize(findings),
    findings,
  }, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { parseArgs, USAGE };
