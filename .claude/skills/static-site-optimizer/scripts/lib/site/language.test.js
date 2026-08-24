const { test } = require('node:test');
const assert = require('node:assert');
const { normalizeLangCode, langFromMarkup, extractText, guessFromText, detectLanguage } = require('./language');

const ITALIAN = `
  Siamo uno studio di psicologia che si occupa di terapia per adulti e adolescenti.
  Il nostro approccio è centrato sulla persona e sulle sue risorse, non solo sui
  sintomi che la portano da noi. Offriamo percorsi individuali e di coppia, con
  colloqui che si svolgono in studio oppure online. Per fissare un primo incontro
  potete scriverci una mail o telefonare durante gli orari di segreteria, e vi
  risponderemo entro pochi giorni con le informazioni che vi servono.
`;

const ENGLISH = `
  We are a design studio that works with small businesses and independent shops.
  Our approach is simple: we listen to what you need, we show you what it will
  look like, and we build it. All of our work is done in house, and you can talk
  to the people who are doing it. If you have a project in mind, send us a note
  with a few lines about what you are trying to do and we will get back to you.
`;

test('normalizes a language code down to its primary subtag', () => {
  assert.strictEqual(normalizeLangCode('it'), 'it');
  assert.strictEqual(normalizeLangCode('it-IT'), 'it');
  assert.strictEqual(normalizeLangCode('en_US'), 'en');
  assert.strictEqual(normalizeLangCode('  DE  '), 'de');
  assert.strictEqual(normalizeLangCode(''), null);
  assert.strictEqual(normalizeLangCode(undefined), null);
});

test('reads a lang attribute the site already declares', () => {
  assert.deepStrictEqual(langFromMarkup('<html lang="it-IT"><body></body></html>'), { lang: 'it', source: 'html-lang' });
});

test('falls back to og:locale, then to a content-language meta', () => {
  assert.deepStrictEqual(
    langFromMarkup('<html><head><meta property="og:locale" content="fr_FR"></head></html>'),
    { lang: 'fr', source: 'og-locale' },
  );
  assert.deepStrictEqual(
    langFromMarkup('<html><head><meta http-equiv="content-language" content="de"></head></html>'),
    { lang: 'de', source: 'meta-language' },
  );
});

test('uses hreflang only when the site declares exactly one language', () => {
  const single = '<html><head><link rel="alternate" hreflang="es" href="/es/"></head></html>';
  assert.deepStrictEqual(langFromMarkup(single), { lang: 'es', source: 'hreflang' });

  const multi = `<html><head>
    <link rel="alternate" hreflang="es" href="/es/">
    <link rel="alternate" hreflang="en" href="/en/">
  </head></html>`;
  assert.strictEqual(langFromMarkup(multi), null, 'a multilingual site cannot be reduced to one lang');
});

test('finds nothing to read in markup that declares nothing', () => {
  assert.strictEqual(langFromMarkup('<html><head><title>x</title></head></html>'), null);
});

test('ignores script and style content when collecting prose', () => {
  const html = '<html><body><script>const the = "of and to in is that for";</script><p>Ciao a tutti</p></body></html>';
  const text = extractText(html);

  assert.ok(text.includes('Ciao a tutti'));
  assert.ok(!text.includes('const'), 'script bodies would skew the counts towards English');
});

test('recognizes Italian and English prose from stopword frequency', () => {
  assert.strictEqual(guessFromText(ITALIAN).lang, 'it');
  assert.strictEqual(guessFromText(ENGLISH).lang, 'en');
});

test('refuses to guess when there is barely any text', () => {
  assert.strictEqual(guessFromText('Ciao'), null);
  assert.strictEqual(guessFromText(''), null);
});

test('prefers what the site declares over what the text looks like', () => {
  const pages = [{ path: 'index.html', html: `<html lang="en"><body><p>${ITALIAN}</p></body></html>` }];
  const result = detectLanguage(pages);

  assert.strictEqual(result.lang, 'en');
  assert.strictEqual(result.source, 'html-lang');
  assert.strictEqual(result.confidence, 'high');
});

test('picks up a declaration from any page, not just the homepage', () => {
  const pages = [
    { path: 'index.html', html: '<html><body></body></html>' },
    { path: 'about.html', html: '<html lang="it"><body></body></html>' },
  ];
  const result = detectLanguage(pages);

  assert.strictEqual(result.lang, 'it');
  assert.match(result.evidence, /about\.html/);
});

test('never reports high confidence for a text-only guess', () => {
  const pages = [{ path: 'index.html', html: `<html><body><p>${ITALIAN}</p></body></html>` }];
  const result = detectLanguage(pages);

  assert.strictEqual(result.lang, 'it');
  assert.strictEqual(result.source, 'text');
  assert.notStrictEqual(result.confidence, 'high', 'a heuristic must never authorise an automatic fix');
});

test('reports nothing detected rather than inventing a language', () => {
  const result = detectLanguage([{ path: 'index.html', html: '<html><body><p>404</p></body></html>' }]);

  assert.strictEqual(result.lang, null);
  assert.strictEqual(result.confidence, 'none');
});
