# Finding codes

Every entry `scripts/optimize.js` can emit. `autoFixed` is `true` only when the
run was given `--fix` **and** the check is in the auto-fix list — a report-only
run always reports `autoFixed: false` for everything.

Each finding carries `code`, `category`, `autoFixed`, `message`, and — for
per-page checks — the `page` it came from (site-relative path).

## External references — the point of the skill

| Code | Trigger | Auto-fixed |
|---|---|---|
| `external-resource` | Report mode: a subresource loaded from another origin that `--fix` would pull local | no (report mode only) |
| `self-hosted-asset` | `--fix`: an HTML subresource downloaded into `assets/` and its reference rewritten | yes |
| `self-hosted-css-asset` | `--fix`: an `@import` or `url()` inside a stylesheet downloaded and rewritten | yes |
| `self-hosting-summary` | `--fix`: one line with the total file count and bytes pulled local | yes |
| `external-asset-download-failed` | A download failed; the original URL is left untouched | **no** |
| `external-tracker` | A script or iframe from a known analytics/tracking host | **no** — removing it changes behaviour |
| `third-party-embed` | An `<iframe>` to a third party (Maps, YouTube, Vimeo…) | **no** — must stay external to work |
| `stale-preconnect` | `<link rel="preconnect\|dns-prefetch">` to an external host | **no** — dead weight after self-hosting, but removal is a human call |

Never in scope, by design: `<a href>` outbound links, `<form action>`, and the
`src` of an embed iframe. Only tags that *load a subresource* are rewritten.

## Document hygiene

`missing-lang` is the one fix whose value cannot be read off the file being
fixed. It is resolved in three rungs — `--lang`, then a language the site
declares about itself somewhere (applied: that is evidence, not a guess), then a
stopword analysis of the text (reported as a suggestion, never written). The
resolution is echoed in the run's `language` block and in the finding message.
`--detect-lang` reports the detection alone, without touching anything.

A wrong `lang` makes a screen reader mispronounce every word, which is worse
than no attribute at all — hence the refusal to write a heuristic guess.

| Code | Trigger | Auto-fixed |
|---|---|---|
| `missing-lang` | `<html>` without `lang` | only when the language is known: `--lang`, or one the site declares elsewhere. A text-only guess is reported, not applied. |
| `missing-charset` | No `<meta charset>` | yes — `UTF-8` |
| `missing-viewport` | No `<meta name="viewport">` | yes |
| `missing-meta-description` | No `<meta name="description">` | **no** — the text depends on the content |

## Images

| Code | Trigger | Auto-fixed |
|---|---|---|
| `missing-img-dimensions` | `<img>` without `width`/`height`, resolvable to a real local file | yes — read from the file header (PNG/JPEG/GIF) |
| `missing-lazy-loading` | `<img>` past the first two of a page, without `loading` | yes — `loading="lazy"` |
| `oversized-image` | JPEG/PNG over 150KB | only with `--compress-images`, and only if the re-encode saves ≥10% |
| `compressed-image` | An image actually re-encoded smaller | yes |

Compression keeps the format, the filename and the pixel dimensions. A gain
under 10% is not worth swapping a file the user chose, so the original stays.

## Links

| Code | Trigger | Auto-fixed |
|---|---|---|
| `missing-noopener` | `<a target="_blank">` without `rel="noopener noreferrer"` | yes — merged into any existing `rel` |
| `missing-mailto` | A plain-text email, or an `href` that is an address without `mailto:` | yes |
| `missing-tel` | A plain-text phone number, or an `href` that is a number without `tel:` | yes |
| `format-phone` | `++39` inside an existing link's text | yes — normalised to `+39` |
| `office-document-link` | A link to `.doc/.docx/.ppt/.pptx` | **no** — suggests converting to PDF |

## Site-level files

| Code | Trigger | Auto-fixed |
|---|---|---|
| `missing-robots-txt` | No `robots.txt` | yes — permissive, pointing at the sitemap |
| `missing-sitemap-xml` | No `sitemap.xml` | yes — lists every HTML page found, by relative path |
| `missing-readme` | No `README.md` | yes — from folder name, `<title>`, `package.json`, subfolders |
| `missing-llms-txt` | No `llms.txt` | yes — [llmstxt.org](https://llmstxt.org) format, one line per page |
| `missing-favicon` | No `favicon.ico` | yes — **a placeholder letter tile, not branding**; always flag it to the user |

The sitemap uses relative paths on purpose. The optimizer never guesses a
domain: it only uses one already present verbatim in the site's own files.
