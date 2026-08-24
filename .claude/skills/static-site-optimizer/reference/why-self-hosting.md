# Why zero external references

Every `<link>`, `<script>` or `<img>` pointing at another origin is a decision
with legal, operational, performance and security consequences. This document is
the reasoning behind the skill's central rule: **if the browser must fetch it to
render the page, it belongs on your own origin.**

## Privacy and GDPR

**An external request leaks the visitor's IP address, and an IP address is
personal data.** The moment a page tells a browser to fetch a font from
`fonts.gstatic.com`, the visitor's browser opens a connection to Google and
hands over its IP, `User-Agent`, and a `Referer` naming the exact page being
read. The site owner never sees this happen, but they are the one who caused it.

This is not theoretical. In January 2022 the Landgericht München I
(Az. 3 O 17493/20) ordered a website operator to pay damages to a visitor for
exactly this: embedding Google Fonts from Google's servers transferred the
visitor's IP to the US without a legal basis. The ruling triggered a wave of
copycat claims across Germany and Austria. Self-hosting the same font files
makes the entire question moot — no transfer, no legal basis needed, nothing to
disclose.

The knock-on effects are all in the same direction:

- **No consent banner for these resources.** A webfont or a CDN script is not
  "strictly necessary" for the service the user asked for, so under ePrivacy and
  GDPR it needs prior consent. Consent that most visitors do not give, on a
  banner that costs conversions. Local assets need no consent because no third
  party is involved.
- **No third-party cookies you did not choose.** A CDN can set or read cookies
  on its own domain on every request. You cannot audit that, and you cannot turn
  it off.
- **No international transfer problem.** Post-Schrems II, sending personal data
  to a US provider requires a transfer mechanism and a documented assessment.
  A file served from your own EU server involves no transfer at all.
- **A shorter privacy policy and a shorter record of processing activities.**
  Every third party you drop is one fewer processor to name, one fewer DPA to
  sign, one fewer entry to keep current.

The skill still refuses to remove trackers and embeds automatically — those are
a business decision. But it removes the ones nobody chose deliberately: the font
CDN somebody copy-pasted from a tutorial in 2019.

## One source of truth

**What is in the repository is what gets served.** No qualifiers.

A CDN reference is a promise that a file you do not control will keep being the
file you tested against. That promise is weaker than it looks. Mutable URLs
(`@latest`, unversioned paths) can change under you. Google Fonts silently
changes which subsets and which `unicode-range` blocks it returns depending on
the requesting `User-Agent`. Providers retire endpoints. The bytes your visitor
receives in a year are not necessarily the bytes you saw in the browser today.

Once everything is local, the site becomes:

- **Reproducible.** `git clone` gives you a complete, working site. The diff
  shows every change to every asset, including the day a font file changed.
- **Archivable.** It still works in five years, offline, on a LAN, on a kiosk,
  in a museum, on a machine with no internet at all.
- **Debuggable.** "Works on my machine" stops being about the network.

Link rot is the slow version of the same problem: a CDN URL that 404s in 2031
takes your typography with it. A file in your repo cannot 404.

## One DNS resolution

Each additional origin costs a full connection setup **before the first byte of
content arrives**: DNS lookup, TCP handshake, TLS handshake. On a mobile network
that is comfortably 100–300 ms per origin, and it happens on the critical path
when the resource is a stylesheet or a font.

A Google Fonts `@import` is the worst shape of this, because the round trips
chain instead of overlapping:

```
DNS + TCP + TLS to fonts.googleapis.com  ->  fetch the CSS
        DNS + TCP + TLS to fonts.gstatic.com  ->  fetch the .woff2
                ...only now can text render
```

Three sequential network trips to two extra hosts before a single word appears.
Self-hosted, the font is one request on a connection that is *already open*.

**HTTP/2 and HTTP/3 make this worse for third parties, not better.** Both
multiplex unlimited parallel requests over a single connection — but only per
origin. Assets on your own domain ride the connection the browser already
established for the HTML. A third-party origin cannot, no matter the protocol.

And the old counter-argument is dead. "Everyone already has jQuery cached from
that CDN" stopped being true around 2020, when every major browser partitioned
the HTTP cache by top-level site to close a privacy leak. A visitor who
downloaded a library from a CDN on another site gets **no cache hit** on yours.
The shared-cache benefit that justified CDNs for a decade no longer exists; only
the costs remain.

## Security

**A third-party script has the same power over your page as your own code.** It
can read the DOM, rewrite forms, intercept input, read `document.cookie`, and
exfiltrate anything it finds — with no way for a visitor to tell the difference.
You are trusting not just the provider's intentions, but their build pipeline,
their DNS, their expiring domains and every employee with deploy access.

In June 2024 the `polyfill.io` domain changed hands and began serving malware to
visitors of more than 100,000 sites. Not one of those sites was itself
compromised. They had simply written `<script src="https://cdn.polyfill.io/...">`
years earlier and moved on.

Self-hosted files change when you change them, and the change shows up in a diff.

Subresource Integrity helps, but only partially: it does not cover fonts or the
assets a stylesheet pulls in, and it breaks by design every time the provider
ships a legitimate update — so it tends to be removed rather than maintained.

There is also a payoff on the other side of the ledger: **with nothing external,
`Content-Security-Policy: default-src 'self'` becomes trivial to deploy.** A
strict CSP is normally an exercise in enumerating exceptions; here there are
none, and the strongest defence against XSS becomes a one-line header.

## The visitor who cannot reach the third party

Self-hosted assets work for everyone. Third-party ones do not.

- **Ad blockers and privacy extensions** block CDN and tracker origins as a
  matter of policy. If your layout depends on a blocked stylesheet or icon font,
  those visitors see a broken page — and they will not tell you.
- **Corporate networks** whitelist by domain. Your site is allowed; your CDN may
  not be.
- **Google's domains are unreachable from mainland China.** A Google Fonts
  `<link>` does not degrade there, it hangs, taking your text rendering with it.
- **Any offline or restricted context** — trade show, ship, hospital, rural
  connection with a captive portal — turns an external dependency into a defect.

Every one of these users is invisible in your analytics, because the same
conditions usually block analytics too.

## Cost and control

A dependency you do not pay for is a dependency you cannot hold anyone to. A
free CDN can add rate limits, require an API key, start injecting a banner, or
shut down with 30 days' notice. Local files have none of that surface: the only
thing that can change them is you.

## What stays external, and why

Three categories are deliberately left alone:

- **Outbound links (`<a href>`) and form actions.** These are destinations, not
  subresources. Nothing is fetched until the user chooses to go there.
- **Third-party embeds** (Maps, YouTube, Vimeo). They cannot work locally by
  definition. The skill reports them and suggests a click-to-load facade — a
  local screenshot that swaps itself for the real iframe on click — so the
  third party is contacted only for visitors who actually want it.
- **Trackers and analytics.** Removing them changes what the site does and what
  the owner can measure. That is a business decision, so the skill names them,
  their host and their page, and leaves the choice to a person.

The first is out of scope on principle. The other two are the honest residue:
after a full pass, whatever external references remain are there because someone
decided they should be, not because nobody looked.
