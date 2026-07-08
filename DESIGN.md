# Skill: auditing-static-sites — Design

Data: 2026-07-08

## Problema

`D:\GitHub\robertocontiero` contiene 4 siti statici indipendenti (HTML/CSS/JS vanilla,
senza build system): `AccademiaBushido`, `SKII`, `helparti`, `psico`. Ognuno ha la sua
repo git. Manca un modo ripetibile per verificarne e migliorarne performance, SEO,
accessibilità, qualità del codice e design/UX.

## Obiettivo

Una skill personale (`~/.claude/skills/auditing-static-sites/`) invocabile con
`/auditing-static-sites [cartella]` che:
- analizza tutti i siti trovati in una cartella (default: cartella corrente)
- applica automaticamente i fix meccanici e sicuri
- produce un report per sito + una dashboard aggregata

## Flusso

1. **Discovery**: scan delle sottocartelle della directory target; una cartella è "un
   sito" se contiene un `index.html` in root.
2. **Audit per sito (parallelo)**: per ciascun sito trovato, dispatch di un Agent
   (`general-purpose`, foreground, nessun worktree — ogni sito è già una repo isolata)
   con istruzioni autosufficienti che:
   - esegue `scripts/static-audit.js` (Node, zero dipendenze) → controlli meccanici su
     HTML/CSS/JS/immagini, ritorna JSON di findings
   - avvia un server statico locale (`npx serve` o `python -m http.server`) e lancia
     `npx lighthouse` (categorie: performance, accessibility, best-practices, seo)
   - applica i fix automatici (lista sotto) direttamente sui file del sito
   - scrive `AUDIT.md` nella root del sito (punteggi, fix applicati, problemi aperti)
   - ritorna un riepilogo JSON strutturato al chiamante
3. **Aggregazione**: un ultimo step nel main loop raccoglie i riepiloghi JSON di tutti
   i siti e genera un Artifact HTML con dashboard comparativa (punteggi Lighthouse a
   confronto, conteggio fix applicati, elenco findings aperti per sito).

Nessun commit git automatico: le modifiche restano nel working tree di ogni sito per
revisione manuale dell'utente.

## Fix automatici (meccanici, nessuna ambiguità)

- `<meta charset="UTF-8">` mancante
- `<meta name="viewport" content="width=device-width, initial-scale=1">` mancante
- `lang` mancante su `<html>`
- `width`/`height` mancanti sui tag `<img>` (calcolati dalle dimensioni reali del file
  immagine referenziato — previene layout shift)
- `loading="lazy"` su tutte le immagini `<img>` tranne le prime 2 nell'ordine del
  DOM di ogni pagina (euristica per "sopra il fold")
- `rel="noopener noreferrer"` mancante su link con `target="_blank"`
- `robots.txt` / `sitemap.xml` completamente assenti → scaffold minimo
- Compressione lossless/near-lossless delle immagini JPEG/PNG sopra 150KB
  (via `npx sharp-cli` o `imagemin-cli`), applicata solo se riduce la dimensione di
  almeno il 10%, mantenendo nome/formato file
- `favicon.ico` completamente assente → placeholder generato automaticamente
  (iniziale del `<title>` del sito su sfondo a tinta unita, convertito in `.ico`) e
  collegato con `<link rel="icon">` se il tag manca; il report segnala che va
  sostituito con un'icona di brand reale
- `README.md` completamente assente → scaffold generato da nome cartella, `<title>`
  di `index.html`, `package.json` se presente (nome/descrizione/script `start`),
  ed elenco delle sottocartelle principali come "struttura del progetto"
- `llms.txt` completamente assente → scaffold generato da titolo del sito, heading
  principali e struttura delle pagine (elenco link chiave con una riga di
  descrizione ciascuno), secondo lo standard [llmstxt.org](https://llmstxt.org)
- Font caricati da CDN esterno (es. `@import url('https://fonts.googleapis.com/...')`)
  → self-hosting automatico: scarica i file `.woff2` referenziati, li salva in
  locale nel sito e riscrive il CSS con `@font-face` locali al posto dell'`@import`
  esterno (rilevato in `AccademiaBushido/index.css` e `psico/index.css`)

## Solo report (richiedono giudizio umano)

- Qualità del testo alt (presente ma vago, o assente — proposta suggerita ma non
  inserita automaticamente)
- Meta description assente (bozza suggerita nel report, non inserita)
- Contrasto colori
- Gerarchia heading (h1→h2→h3 saltati)
- CSS/JS non minificati (segnalato con dimensione, non minificato automaticamente:
  nessuna build pipeline con sourcemap per invertire in caso di problemi)
- Coerenza di design/UX tra i siti
- Opportunità Lighthouse architetturali (risorse che bloccano il rendering, ecc.)
- Altre dipendenze da risorse esterne non auto-fixabili in sicurezza (script CDN di
  librerie JS, tracker/analytics di terze parti, immagini ospitate altrove usate
  come asset di pagina): elencate con dominio e raccomandazione di self-hosting o
  rimozione

**Esplicitamente escluso da questo controllo**: i link `<a href="https://...">` in
uscita (partner, social, mappe, documenti Drive) e gli embed legittimi che devono
restare esterni per funzionare (iframe Google Maps, embed YouTube) — non vengono né
segnalati né toccati.

## Formato output

- `AUDIT.md` per sito, nella root del repo del sito (versionato con git dall'utente)
- Un Artifact HTML aggregato con dashboard comparativa tra tutti i siti auditati
  nella sessione corrente

## Struttura della skill

```
~/.claude/skills/auditing-static-sites/
  SKILL.md              # procedura, criteri discovery, istruzioni per gli agent per-sito
  scripts/
    static-audit.js     # controlli statici HTML/CSS/JS/immagini, output JSON
```

## Note tecniche verificate

- Node v26.4.0 / npm 11.12.1 disponibili nell'ambiente
- `npx lighthouse` funzionante (v13.4.0, scaricato on-the-fly)
- Nessuna delle repo dei 4 siti ha una toolchain di build: i fix vanno applicati
  direttamente su HTML/CSS/JS serviti staticamente
- Stato attuale verificato: robots.txt/sitemap.xml/favicon.ico/README.md presenti in
  modo incoerente tra i 4 siti (solo SKII li ha tutti) — da qui la necessità dei fix
  di scaffolding automatico
- Il tool esatto per generare il placeholder favicon (es. rasterizzare un SVG e
  convertirlo in .ico via pacchetto npx) va scelto e verificato in fase di
  implementazione/test della skill

## Fuori scope (v1)

- Nessuna modifica di design/UX automatica (solo segnalazione)
- Nessuna minificazione automatica di CSS/JS
- Nessun commit/push automatico
- Nessuna integrazione con Workflow tool (restiamo su Agent diretti dalla skill)
