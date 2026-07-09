// scripts/lib/font-selfhost.js
function parseGoogleFontsImport(cssContent) {
  const re = /@import\s+url\(['"]?(https:\/\/fonts\.googleapis\.com\/[^'")]+)['"]?\)\s*;?/;
  const match = cssContent.match(re);
  if (!match) return null;
  return { fullMatch: match[0], url: match[1] };
}

function parseFontFaceUrls(cssText) {
  const blocks = cssText.match(/@font-face\s*\{[^}]*\}/g) || [];
  return blocks
    .map((block) => {
      const urlMatch = block.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/);
      const familyMatch = block.match(/font-family:\s*['"]([^'"]+)['"]/);
      const weightMatch = block.match(/font-weight:\s*(\d+)/);
      const styleMatch = block.match(/font-style:\s*(\w+)/);
      return {
        raw: block,
        url: urlMatch ? urlMatch[1] : null,
        family: familyMatch ? familyMatch[1] : 'unknown',
        weight: weightMatch ? weightMatch[1] : '400',
        style: styleMatch ? styleMatch[1] : 'normal',
      };
    })
    .filter((font) => font.url);
}

function buildLocalFontFaceCss(fonts) {
  return fonts
    .map((f) => `@font-face {\n  font-family: '${f.family}';\n  font-style: ${f.style};\n  font-weight: ${f.weight};\n  font-display: swap;\n  src: url('fonts/${f.localFileName}') format('woff2');\n}`)
    .join('\n\n');
}

function rewriteCssWithLocalFonts(cssContent, importMatch, fontFaceCss) {
  return cssContent.replace(importMatch.fullMatch, fontFaceCss);
}

async function selfHostGoogleFonts(cssFilePath, siteDir, deps) {
  const { readFile, writeFile, mkdir, fetchText, fetchBuffer } = deps;
  const cssContent = await readFile(cssFilePath, 'utf8');
  const importMatch = parseGoogleFontsImport(cssContent);
  if (!importMatch) return { applied: false, findings: [] };

  const googleCss = await fetchText(importMatch.url);
  const fontFaces = parseFontFaceUrls(googleCss);
  await mkdir(`${siteDir}/fonts`, { recursive: true });

  const localized = [];
  for (const font of fontFaces) {
    const localFileName = `${font.family.replace(/\s+/g, '-').toLowerCase()}-${font.weight}-${font.style}.woff2`;
    const bytes = await fetchBuffer(font.url);
    await writeFile(`${siteDir}/fonts/${localFileName}`, bytes);
    localized.push({ ...font, localFileName });
  }

  const fontFaceCss = buildLocalFontFaceCss(localized);
  const newCss = rewriteCssWithLocalFonts(cssContent, importMatch, fontFaceCss);
  await writeFile(cssFilePath, newCss);

  return {
    applied: true,
    findings: [{
      code: 'externalized-google-fonts',
      category: 'performance',
      autoFixed: true,
      message: `Font Google Fonts reso locale (${localized.length} file .woff2 scaricati in fonts/)`,
    }],
  };
}

module.exports = { parseGoogleFontsImport, parseFontFaceUrls, buildLocalFontFaceCss, rewriteCssWithLocalFonts, selfHostGoogleFonts };
