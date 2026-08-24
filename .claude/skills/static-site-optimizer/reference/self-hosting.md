# How self-hosting works

The goal: after `--fix`, the site loads nothing from another origin except the
things that cannot work locally (trackers, third-party embeds) — and those are
reported, never silently kept.

## What counts as a subresource

Only tags that make the browser fetch something as part of rendering the page:

```
<link rel="stylesheet|preload|icon|apple-touch-icon|manifest|modulepreload" href>
<script src>   <img src|srcset>   <source src|srcset>
<video src|poster>   <audio src>   <track src>
```

Plus, inside any stylesheet, `@import` and `url()`.

`<a href>`, `<form action>` and `<iframe src>` are **not** subresources for this
purpose. Rewriting them would change where the user goes or what the page does.

`<link rel="canonical">`, `rel="alternate"`, `rel="preconnect"` and
`rel="dns-prefetch"` load nothing, so they are never rewritten either —
preconnect hints are reported instead, since they are dead weight once the host
they point at is no longer used.

## Where files land

```
<site>/assets/css/     stylesheets
<site>/assets/js/      scripts
<site>/assets/fonts/   webfonts
<site>/assets/img/     images
<site>/assets/media/   audio/video
<site>/assets/misc/    anything else
```

The local filename is `<basename>-<sha1(url) first 8 hex><ext>`. The hash is
always appended, so two different remote files that share a basename
(`cdn-a.com/app.js` and `cdn-b.com/app.js`) can never overwrite each other, and
re-running the optimizer produces exactly the same names.

If the URL has no extension — `fonts.googleapis.com/css2?family=Inter` — the
extension comes from the response `Content-Type`, then from the kind of
reference as a last resort.

## Following a stylesheet one level down

A downloaded stylesheet is not just saved: it is parsed, and its own external
refs are fetched too. That is why a single Google Fonts `<link>` ends up as a
local CSS file plus a folder of `.woff2` subsets, with no font-specific code
involved.

Two details make this correct:

- **Relative refs inside a remote stylesheet are external.** `url(../img/bg.png)`
  in a CSS served from `cdn.example.com/theme/` resolves against *that* origin.
  Once the file sits in our `assets/css/`, the same relative path would resolve
  against our origin and 404. So refs in a downloaded stylesheet are resolved
  against the stylesheet's URL before being fetched.
- **Paths are rewritten relative to where the file now lives**, not to the page.
  A stylesheet in `assets/css/` points at its fonts as `../fonts/x.woff2`; a page
  in `blog/` points at that stylesheet as `../assets/css/x.css`.

Downloaded `@font-face` blocks that do not declare `font-display` get
`font-display: swap`, so text stays visible while the font loads.

`integrity` and `crossorigin` are removed from a tag once its asset is local:
the SRI hash described the remote copy, and there is no cross-origin request
left to negotiate.

Each URL is fetched at most once per site, however many pages reference it, and
a circular `@import` chain terminates instead of looping.

## When a download fails

The original URL is left exactly as it was and an
`external-asset-download-failed` finding is emitted with the host and the
reason. A half-rewritten page that points at a file which is not there is worse
than a page that still uses the CDN — so the fix is skipped, not forced.

Do not hand-edit a failed reference. Report it and let the user decide.

## Trackers

Hosts in `TRACKER_HOSTS` (`scripts/lib/external-refs.js`) are never fetched and
never rewritten. Self-hosting an analytics snippet either breaks it or quietly
keeps the tracking alive under the site's own name — both are decisions for a
human. They are reported with their host so the user can remove them, or swap
in something self-hosted, on purpose.

## Network

Only `--fix` touches the network, and only to GET the assets being localized.
A report-only run is completely offline — useful for a first pass, or in CI.
