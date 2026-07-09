---
name: auditing-static-sites
description: Use when the user wants to audit or improve one or more static HTML/CSS/JS websites in a folder — checking performance, SEO, accessibility, and code-quality hygiene (missing meta tags, robots.txt, sitemap.xml, favicon, README, llms.txt, external font dependencies) — and applying ONLY the safe mechanical fixes listed below, automatically.
---

# Auditing Static Sites

## Overview

Audits every static site found under a target folder using
`scripts/static-audit.js` (mechanical checks) plus Lighthouse
(performance/SEO/accessibility/best-practices scores), applies a **fixed,
narrow list of safe automatic fixes**, and produces a per-site `AUDIT.md`
plus an aggregated dashboard Artifact.

**This skill is deliberately narrow.** Left to a generic "improve this
site" instruction, a capable agent will happily rewrite contact forms,
guess at the site's real domain, edit business content (emails, addresses),
convert images between formats, and fix application bugs it happens to
notice — all plausible-sounding, all outside what a hygiene audit should
touch without a human's sign-off. This skill exists specifically to replace
that free-for-all with the fixed procedure and fix list below.

## When NOT to use

- Sites with a build pipeline (React/Vue/bundlers) — this skill targets
  plain HTML/CSS/JS served as-is, with no build step to invert.
- When the user wants design/UX changes, content changes, or bug fixes
  beyond the fix list below — those stay report-only by design.

## The ONLY automatic fixes in scope

Exactly these, all performed by `scripts/static-audit.js --fix` except the
image compression step, which you run yourself per step 2 below:

- Missing `<meta charset>`, missing `<meta viewport>`, missing `lang` on `<html>`
- Missing `width`/`height` on `<img>` (read from the real file); `loading="lazy"` on every image but the first two
- Missing `rel="noopener noreferrer"` on `<a target="_blank">`
- Missing `robots.txt` / `sitemap.xml` / `README.md` / `llms.txt` (scaffolded)
- Missing `favicon.ico` (a generated placeholder letter tile — NOT real branding)
- A `@import` of Google Fonts in the site's CSS → downloaded and self-hosted
- Oversized JPEG/PNG files (>150KB) → compressed via `npx sharp-cli` (step 2 below)

**Nothing else is ever auto-fixed.** Do not additionally: rewrite forms or
their submission endpoints, invent or assume the site's real domain name,
edit any business content (emails, phone numbers, addresses, prices),
convert images between formats, fix application/JS bugs you happen to
notice, restructure HTML/CSS beyond the list above, or touch ARIA/focus
management. If you notice something broken or worth improving that isn't on
this list, put it in `AUDIT.md`'s "Da rivedere manualmente" section as a
suggestion — do not fix it yourself, no matter how safe it looks or how
sure you are what the right fix is.

## Procedure

1. **Discover sites**

   ```
   node <skill-dir>/scripts/static-audit.js --discover <target-dir>
   ```

   Returns `{ "sites": string[] }`. If the array is empty, tell the user no
   static site was found under that folder and stop.

2. **Audit each site in parallel.** For every site path returned, dispatch
   an Agent (`general-purpose`, foreground, no worktree — each site is
   already an isolated git repo) with this exact prompt template,
   substituting `{siteDir}` and `{skillDir}`:

   > Audit and fix the static website at `{siteDir}`. You are executing a
   > fixed procedure — do not use your own judgment to go beyond it, no
   > matter how clearly beneficial an extra change looks.
   > 1. Run `node {skillDir}/scripts/static-audit.js {siteDir}` and read the JSON findings.
   > 2. Run `node {skillDir}/scripts/static-audit.js {siteDir} --fix` to apply the safe automatic fixes.
   > 3. For every finding with code `oversized-image`, and ONLY those files, compress it with
   >    `npx --yes sharp-cli -i "<file>" -o "<file's directory>/.audit-tmp" -q 80`,
   >    compare the size of the file inside `.audit-tmp` against the original, and
   >    only replace the original if it is at least 10% smaller; then delete `.audit-tmp`.
   >    Do not resize, recompress, or convert the format of any other image.
   > 4. Start a local static server for `{siteDir}`
   >    (`npx --yes serve {siteDir} -l 4173`), then run
   >    `npx --yes lighthouse http://localhost:4173 --output=json --output-path=stdout --chrome-flags="--headless" --only-categories=performance,accessibility,best-practices,seo`.
   >    Stop the server afterward. Do not skip this step or estimate scores
   >    yourself if the server is slow to start or Lighthouse takes a while —
   >    wait for it, or retry the request; a slow local server is normal, not
   >    a reason to fabricate scores or omit them.
   > 5. Write `{siteDir}/AUDIT.md` with exactly three sections: "Punteggi
   >    Lighthouse" (the 4 category scores), "Fix applicati automaticamente"
   >    (every finding with `autoFixed: true`, plus any image actually
   >    compressed in step 3), and "Da rivedere manualmente" (every finding
   >    with `autoFixed: false`, plus your own read of `index.html`/`index.css`
   >    for alt-text quality, missing meta description, color contrast, and
   >    heading hierarchy — the script does not check these). Anything you
   >    noticed that is broken, outdated, or improvable but is NOT one of the
   >    fixes this skill performs goes here too, as a suggestion — never as
   >    something you already fixed.
   > 6. Do NOT modify any `<a href="...">` outbound link or any third-party
   >    embed (Google Maps / YouTube iframe). Do NOT edit any business
   >    content (emails, phone numbers, addresses, prices, form endpoints).
   >    Do NOT assume or write in a domain name that isn't already present
   >    verbatim somewhere in the site's own files. Do NOT convert any image
   >    to a different format. Do NOT run any `git` command. Do NOT commit.
   > 7. Return exactly this JSON as your final message, and nothing else —
   >    no summary prose before or after it:
   >    `{ "site": "{siteDir}", "scores": { "performance": N, "accessibility": N, "best-practices": N, "seo": N }, "autoFixed": N, "openFindings": [...] }`

3. **Aggregate.** Once every per-site agent has returned its JSON, build an
   Artifact HTML dashboard (see the `artifact-design` skill) comparing
   Lighthouse scores across all sites, the total auto-fixed count, and the
   open findings per site.

4. **Report to the user.** List each site's scores, how many fixes were
   applied, and point to its `AUDIT.md` plus the dashboard Artifact link.
   If a generated `favicon.ico` placeholder was created for any site, call
   that out explicitly and by name — it is a colored letter tile, not real
   branding, and is the one auto-fix a human should replace, not just
   review. Explicitly remind them that nothing was committed — they should
   review `git status` / `git diff` in each site's repo before committing
   anything.

## Constraints

- Never touch `<a href="...">` outbound links or third-party embeds
  (Maps/YouTube iframes) — only resource-loading tags (`<img>`, `<link>`,
  `@import`, `<script src>`) are in scope for the "external resources" check.
- Never edit business content: emails, phone numbers, addresses, prices,
  form submission endpoints, or any text that isn't one of the fixes listed
  above. A form pointing at a broken/placeholder endpoint, a wrong email, or
  a similar real bug goes in `AUDIT.md` as a finding — it is never edited
  directly, even if the correct fix seems obvious from context elsewhere on
  the site.
- Never assume, guess, or write in a domain name — only use one if it is
  already present verbatim in the site's own files (e.g. for `sitemap.xml`,
  prefer a relative path over inventing an absolute URL).
- Never convert an image to a different format, resize it beyond what
  `npx sharp-cli -q 80` does for `oversized-image` findings, or touch any
  image the CLI didn't flag.
- Never run `git commit`, `git push`, or any other git command.
- Only the fixes implemented in `scripts/static-audit.js` (plus the image
  compression and Lighthouse steps above) happen automatically. Everything
  else — alt-text quality, meta description content, design/UX, color
  contrast, heading hierarchy, CSS/JS minification, ARIA/focus management,
  application bugs, accessibility rewrites (e.g. converting clickable
  `<span>`/`<div>` to real `<button>`) — is always report-only, regardless
  of how safe or beneficial it looks.
