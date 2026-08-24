// Blocky 3x5 decorative font. Purely cosmetic placeholder — not meant to be pixel-perfect,
// the report tells the user to replace this favicon with real branding.
const FONT_3X5 = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '###', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '..#', '..#', '..#'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'],
  N: ['#.#', '###', '###', '###', '#.#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '##.', '.##'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#.#', '#.#', '#.#', '###', '#.#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
};

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

function generateFaviconIco(letter, bgColorHex, fgColorHex) {
  const size = 32;
  const bg = hexToRgb(bgColorHex);
  const fg = hexToRgb(fgColorHex);
  const glyph = FONT_3X5[String(letter || '0').toUpperCase()] || FONT_3X5['0'];
  const cell = 6;
  const glyphW = 3 * cell;
  const glyphH = 5 * cell;
  const offsetX = Math.floor((size - glyphW) / 2);
  const offsetY = Math.floor((size - glyphH) / 2);

  const pixels = new Array(size * size).fill(bg);
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      if (glyph[row][col] !== '#') continue;
      for (let dy = 0; dy < cell; dy++) {
        for (let dx = 0; dx < cell; dx++) {
          const x = offsetX + col * cell + dx;
          const y = offsetY + row * cell + dy;
          pixels[y * size + x] = fg;
        }
      }
    }
  }

  const headerSize = 40;
  const xorSize = size * size * 4;
  const andRowBytes = Math.ceil(size / 32) * 4;
  const andSize = andRowBytes * size;
  const bmpSize = headerSize + xorSize + andSize;
  const imageOffset = 6 + 16; // ICONDIR + one ICONDIRENTRY

  const buf = Buffer.alloc(imageOffset + bmpSize);
  let o = 0;
  buf.writeUInt16LE(0, o); o += 2; // reserved
  buf.writeUInt16LE(1, o); o += 2; // type = icon
  buf.writeUInt16LE(1, o); o += 2; // image count

  buf.writeUInt8(size, o); o += 1; // width
  buf.writeUInt8(size, o); o += 1; // height
  buf.writeUInt8(0, o); o += 1; // color count
  buf.writeUInt8(0, o); o += 1; // reserved
  buf.writeUInt16LE(1, o); o += 2; // planes
  buf.writeUInt16LE(32, o); o += 2; // bit count
  buf.writeUInt32LE(bmpSize, o); o += 4; // bytes in resource
  buf.writeUInt32LE(imageOffset, o); o += 4; // image offset (4-byte field per ICO spec)

  buf.writeUInt32LE(headerSize, o); o += 4;
  buf.writeInt32LE(size, o); o += 4;
  buf.writeInt32LE(size * 2, o); o += 4; // ICO convention: doubled height
  buf.writeUInt16LE(1, o); o += 2;
  buf.writeUInt16LE(32, o); o += 2;
  buf.writeUInt32LE(0, o); o += 4; // BI_RGB
  buf.writeUInt32LE(xorSize, o); o += 4;
  buf.writeInt32LE(0, o); o += 4;
  buf.writeInt32LE(0, o); o += 4;
  buf.writeUInt32LE(0, o); o += 4;
  buf.writeUInt32LE(0, o); o += 4;

  for (let y = size - 1; y >= 0; y--) {
    for (let x = 0; x < size; x++) {
      const p = pixels[y * size + x];
      buf.writeUInt8(p.b, o); o += 1;
      buf.writeUInt8(p.g, o); o += 1;
      buf.writeUInt8(p.r, o); o += 1;
      buf.writeUInt8(255, o); o += 1;
    }
  }

  buf.fill(0, o, o + andSize);

  return buf;
}

module.exports = { generateFaviconIco };
