---
name: static-site-optimizer
description: Use when the user wants to optimize, audit or clean up one or more static HTML/CSS/JS websites in a folder — above all to cut every external dependency (CDN fonts, CDN scripts and stylesheets, remote images) by self-hosting it, plus mechanical performance/SEO/accessibility hygiene (meta tags, image dimensions, lazy loading, robots.txt, sitemap.xml, favicon, README, llms.txt). Applies ONLY the fixed list of safe automatic fixes below; everything else is report-only.
---

# Static Site Optimizer

## Overview

Takes a folder of plain static sites and, for each one, makes the site load
**entirely from its own origin**: every stylesheet, script, font and image
pulled from a CDN is downloaded into `assets/` and the reference rewritten to
the local copy. On top of that it applies a fixed list of mechanical hygiene
fixes, runs Lighthouse, and writes a per-site `AUDIT.md` plus an aggregated
dashboard Artifact.

The whole pass is driven by `scripts/optimize.js` (Node, no runtime
dependencies). Only `--compress-images` and the Lighthouse step reach for
external tooling via `npx`.

Why this matters — GDPR exposure, one source of truth, one DNS resolution,
supply-chain risk, visitors behind blockers — is set out in
`reference/why-self-hosting.md`. Read it before arguing with a user who wants to
keep a CDN reference, and cite it in `AUDIT.md` when a tracker or embed stays.

**This skill is deliberately narrow.** Left to a generic "improve this site"
instruction, a capable agent will rewrite contact forms, guess the site's real
domain, edit business content, convert image formats and fix application bugs
it happens to notice — all plausible, all outside what a hygiene pass should
touch without a human's sign-off. This skill replaces that free-for-all with
the fixed procedure and fix list below.

## When NOT to use

- Sites with a build pipeline (React/Vue/bundlers) — this targets plain
  HTML/CSS/JS served as-is, with no build step to invert.
- When the user wants design/UX changes, content changes, or bug fixes beyond
  the list below — those stay report-only by design.

## The ONLY automatic fixes in scope

All applied by `node scripts/optimize.js <site> --fix`:

**Removing external references** (the point of the skill)

- `<link rel="stylesheet">`, `<script src>`, `<img src|srcset>`,
  `<source>`, `<video poster>`, `<link rel="preload|icon|manifest">` pointing
  at another origin → downloaded under `assets/{css,js,img,fonts,media}/` and
  rewritten to the local path.
- A downloaded stylesheet is followed one level deeper: its `@import` and
  `url()` refs (webfonts, background images) are fetched too and rewritten
  relative to the stylesheet's new location. This is what turns a Google Fonts
  `<link>` or `@import` into local `.woff2` files.
- `font-display: swap` is added to downloaded `@font-face` blocks that lack it.
- `integrity` and `crossorigin` are dropped from a tag once its asset is local
  (the SRI hash described the remote copy).

**Mechanical hygiene**

- Missing `<meta charset>`, missing `<meta viewport>`
- Missing `lang` on `<html>` — see **Language** below. Applied only when the
  language is known, never guessed.
- Missing `width`/`height` on `<img>` (read from the real image file);
  `loading="lazy"` on every image but the first two of each page
- Missing `rel="noopener noreferrer"` on `<a target="_blank">`
- Plain-text emails and phone numbers → `mailto:` / `tel:` links
- Missing `robots.txt` / `sitemap.xml` / `README.md` / `llms.txt` (scaffolded,
  with the sitemap and llms.txt listing every HTML page found)
- Missing `favicon.ico` → a generated placeholder letter tile, **not** real branding
- With `--compress-images`: JPEG/PNG over 150KB re-encoded via `npx sharp-cli`,
  same format and dimensions, kept only if at least 10% smaller

## Never auto-fixed — report only

- **Trackers and analytics** (Google Analytics, GTM, Meta Pixel, Hotjar…):
  reported with their host. Removing them changes what the site does.
- **Third-party embeds** (Maps, YouTube, Vimeo iframes): must stay external to
  work. Reported with a suggestion to use a click-to-load facade.
- **`<a href>` outbound links and `<form action>`**: never rewritten, ever.
- Stale `preconnect`/`dns-prefetch` hints left over after self-hosting
- Meta description content, alt-text quality, colour contrast, heading
  hierarchy, CSS/JS minification, ARIA/focus management, application bugs,
  links to Office documents

**Nothing else is ever auto-fixed.** Do not additionally: rewrite forms or
their endpoints, invent or assume the site's real domain, edit business content
(emails, phone numbers, addresses, prices), convert images between formats, fix
JS bugs you notice, or restructure HTML/CSS beyond the list above. Anything
broken or improvable that is not on the fix list goes into `AUDIT.md` under
"Da rivedere manualmente" as a suggestion — never as something you fixed.

## Language

`lang` is the one fix whose value cannot be read off the file being fixed, so the
optimizer resolves it in this order and says which rung it landed on:

1. `--lang <code>` passed explicitly — always wins.
2. A language the site **declares about itself** on any of its pages (`<html lang>`,
   `og:locale`, `content-language`, a single `hreflang`). Applied automatically:
   this is evidence from the site, not a guess — the same rule that governs domain
   names.
3. A **stopword analysis of the page text**. Reported as a *suggestion* and applied
   to nothing. `missing-lang` stays open with `autoFixed: false`.

`node scripts/optimize.js <site> --detect-lang` returns
`{ lang, source, confidence, evidence }` without touching anything, so you can ask
the user before doing any work. A wrong `lang` makes a screen reader mispronounce
every word, which is worse than no attribute — hence rung 3 never writes.

## Procedure

1. **Discover sites**

   ```
   node <skill-dir>/scripts/optimize.js --discover <target-dir>
   ```

   Returns `{ "sites": string[] }` (a folder counts as a site if it has an
   `index.html` in its root). If the array is empty, tell the user no static
   site was found under that folder and stop.

2. **Settle the language, once, before doing any work.** For each site run:

   ```
   node <skill-dir>/scripts/optimize.js <site> --detect-lang
   ```

   This is offline and instant. Then:

   - `confidence: "high"` for every site — the sites declare their own language.
     Do not ask; carry on and let the optimizer use it.
   - Otherwise — ask the user with AskUserQuestion, **offering the detected
     language as the recommended first option**, e.g. "Italiano (`it`) —
     rilevato dal testo delle pagine" alongside a couple of plausible
     alternatives. One question covers all sites when they agree; ask per site
     when the detections differ. Pass the answer as `--lang <code>` in step 3.
   - `lang: null` (nothing declared, too little text) — ask the same way, with no
     recommended option, and say the detection came back empty.

   Never invent a language, and never leave the decision to the per-site agents:
   they see one site each and would answer inconsistently.

3. **Optimize each site in parallel.** For every site path returned, dispatch a
   `general-purpose` Agent (foreground, no worktree — each site is already an
   isolated git repo) with this prompt, substituting `{siteDir}`, `{skillDir}`
   and `{langFlag}` (` --lang <code>` from step 2, or empty when the site
   declares its own language):

   > Optimize the static website at `{siteDir}`. You are executing a fixed
   > procedure — do not use your own judgment to go beyond it, no matter how
   > clearly beneficial an extra change looks.
   > 1. Run `node {skillDir}/scripts/optimize.js {siteDir}` and read the JSON findings.
   > 2. Run `node {skillDir}/scripts/optimize.js {siteDir} --fix --compress-images{langFlag}`
   >    to apply the safe automatic fixes. This downloads external assets into
   >    `{siteDir}/assets/` and rewrites the references to them; it needs network
   >    access. If a download fails the original URL is left intact and reported —
   >    do not hand-edit it yourself.
   > 3. Start a local static server (`npx --yes serve {siteDir} -l 4173`), then run
   >    `npx --yes lighthouse http://localhost:4173 --output=json --output-path=stdout --chrome-flags="--headless" --only-categories=performance,accessibility,best-practices,seo`.
   >    Stop the server afterwards. Do not skip this step or estimate the scores
   >    yourself if the server is slow to start or Lighthouse takes a while — wait
   >    for it, or retry; a slow local server is normal, not a reason to fabricate
   >    scores or omit them.
   > 4. Write `{siteDir}/AUDIT.md` with exactly four sections:
   >    "Punteggi Lighthouse" (the 4 category scores);
   >    "Riferimenti esterni" (what was self-hosted, and what is still external —
   >    trackers, embeds, failed downloads — each with its host);
   >    "Fix applicati automaticamente" (every finding with `autoFixed: true`);
   >    "Da rivedere manualmente" (every finding with `autoFixed: false`, plus your
   >    own read of the pages for alt-text quality, meta description, colour
   >    contrast and heading hierarchy — the script does not judge these).
   >    Anything broken, outdated or improvable that is NOT one of the fixes this
   >    skill performs goes in the last section as a suggestion, never as done.
   > 5. Do NOT modify any `<a href>` outbound link, any `<form action>`, or any
   >    third-party embed. Do NOT edit business content (emails, phone numbers,
   >    addresses, prices). Do NOT assume or write in a domain name that isn't
   >    already present verbatim in the site's own files. Do NOT convert any image
   >    to another format. Do NOT run any `git` command. Do NOT commit.
   > 6. Return exactly this JSON as your final message and nothing else — no prose
   >    before or after:
   >    `{ "site": "{siteDir}", "scores": { "performance": N, "accessibility": N, "best-practices": N, "seo": N }, "autoFixed": N, "selfHostedFiles": N, "externalRefsRemaining": N, "openFindings": [...] }`

4. **Aggregate.** Once every per-site agent has returned, build an Artifact HTML
   dashboard (load the `artifact-design` skill first) comparing Lighthouse
   scores across sites, self-hosted file counts, external references still
   remaining, and open findings per site.

5. **Report to the user.** Per site: scores, fixes applied, how many external
   references were eliminated and which remain (naming the hosts). Call out
   explicitly, by site name, any generated `favicon.ico` — it is a coloured
   letter tile, not branding, and is the one auto-fix a human must replace
   rather than merely review. Remind them nothing was committed: they should
   review `git status` / `git diff` in each site's repo first.

## Constraints

- Only resource-loading tags are in scope for self-hosting. `<a href>`,
  `<form action>` and `<iframe src>` are never rewritten — changing those
  changes what the page does, not how it loads.
- Never edit business content: emails, phone numbers, addresses, prices, form
  endpoints. A form pointing at a broken endpoint, a wrong email or a similar
  real bug is an `AUDIT.md` finding — never an edit, even when the correct fix
  seems obvious from elsewhere on the site.
- Never assume, guess or write in a domain name. Only use one already present
  verbatim in the site's own files (prefer relative paths in `sitemap.xml` over
  inventing an absolute URL).
- Never convert an image to another format, and never resize one. `--compress-images`
  re-encodes at the same format and dimensions or leaves the file alone.
- Never run `git commit`, `git push`, or any other git command.
- A tracker is reported, never removed and never self-hosted.

## Reference

- `reference/why-self-hosting.md` — the rationale: privacy/GDPR, one source of
  truth, one DNS resolution, supply-chain security, blocked visitors
- `reference/checks.md` — every finding code, what triggers it, and whether it
  is auto-fixed
- `reference/self-hosting.md` — how the asset store, naming and path rewriting
  work, and what to do when a download fails
