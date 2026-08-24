// Report-only findings about external references the optimizer deliberately does
// NOT rewrite: removing a tracker or an embed changes what the page does, and that
// is a decision for a human, not for a mechanical fix.
const {
  findTrackers,
  findThirdPartyEmbeds,
  findPreconnectHints,
  findHtmlExternalRefs,
  findCssExternalRefs,
  isTrackerUrl,
  hostOf,
} = require('./refs');

const KIND_LABEL = {
  stylesheet: 'Stylesheet',
  script: 'Script',
  font: 'Font',
  image: 'Image',
  media: 'Media',
  other: 'Resource',
};

// Report-mode counterpart of the self-hosting fix: what WOULD be pulled local.
function describeSelfHostableRefs(html, pageLabel) {
  const where = pageLabel ? ` (${pageLabel})` : '';
  const findings = [];

  for (const ref of findHtmlExternalRefs(html)) {
    for (const url of ref.urls) {
      if (isTrackerUrl(url)) continue; // covered by external-tracker, never self-hosted
      findings.push({
        code: 'external-resource',
        category: 'external-refs',
        autoFixed: false,
        message: `${KIND_LABEL[ref.kind] || 'Resource'} loaded from ${hostOf(url)}${where}: ${url}. Can be pulled local with --fix.`,
      });
    }
  }

  return findings;
}

function describeCssExternalRefs(css, cssPath) {
  return findCssExternalRefs(css)
    .filter((ref) => !isTrackerUrl(ref.url))
    .map((ref) => ({
      code: 'external-resource',
      category: 'external-refs',
      autoFixed: false,
      message: `${KIND_LABEL[ref.kind] || 'Resource'} loaded from ${hostOf(ref.url)} in ${cssPath}: ${ref.url}. Can be pulled local with --fix.`,
    }));
}

function buildExternalReportFindings(html, pageLabel) {
  const findings = [];
  const where = pageLabel ? ` (${pageLabel})` : '';

  for (const tracker of findTrackers(html)) {
    findings.push({
      code: 'external-tracker',
      category: 'external-refs',
      autoFixed: false,
      message: `Third-party tracker/analytics from ${tracker.host}${where}: ${tracker.url}. Not removed automatically — decide whether it is really needed, then drop it or replace it with self-hosted analytics.`,
    });
  }

  for (const embed of findThirdPartyEmbeds(html)) {
    findings.push({
      code: 'third-party-embed',
      category: 'external-refs',
      autoFixed: false,
      message: `Third-party embed from ${embed.host}${where}: ${embed.url}. It must stay external to work; consider a click-to-load facade (a local image that swaps in the iframe on click) so it is not fetched on first render.`,
    });
  }

  for (const hint of findPreconnectHints(html)) {
    findings.push({
      code: 'stale-preconnect',
      category: 'external-refs',
      autoFixed: false,
      message: `<link rel="preconnect|dns-prefetch"> to ${hint.host}${where}. If nothing is loaded from that host after self-hosting, this hint is dead weight and should be removed by hand.`,
    });
  }

  return findings;
}

module.exports = { buildExternalReportFindings, describeSelfHostableRefs, describeCssExternalRefs };
