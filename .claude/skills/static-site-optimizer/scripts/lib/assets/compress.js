const path = require('node:path');

const DEFAULT_THRESHOLD_BYTES = 150000;

function findOversizedImages(siteDir, listFilesRecursive, statFile, thresholdBytes = DEFAULT_THRESHOLD_BYTES) {
  return listFilesRecursive(siteDir)
    .filter((file) => /\.(jpe?g|png)$/i.test(file))
    .map((file) => ({ path: file, size: statFile(file).size }))
    .filter((file) => file.size > thresholdBytes);
}

// Re-encodes one image via `npx sharp-cli` into a scratch folder and keeps the
// result only if it is meaningfully smaller. Format, name and dimensions are never
// changed: a marginal gain is not worth silently swapping a file the user picked.
async function compressImage(absPath, deps, options = {}) {
  const { quality = 80, minGainRatio = 0.1 } = options;
  const { run, statSize, copyFile, removeDir, fileExists } = deps;

  const tmpDir = path.join(path.dirname(absPath), '.audit-tmp');
  const candidate = path.join(tmpDir, path.basename(absPath));
  const before = statSize(absPath);

  try {
    await run('npx', ['--yes', 'sharp-cli', '-i', absPath, '-o', tmpDir, '-q', String(quality)]);
    if (!fileExists(candidate)) {
      return { compressed: false, before, after: before, reason: 'sharp-cli non ha prodotto un output' };
    }

    const after = statSize(candidate);
    if (after > before * (1 - minGainRatio)) {
      return { compressed: false, before, after, reason: `guadagno sotto il ${Math.round(minGainRatio * 100)}%` };
    }

    await copyFile(candidate, absPath);
    return { compressed: true, before, after };
  } catch (err) {
    return { compressed: false, before, after: before, reason: err && err.message ? err.message : String(err) };
  } finally {
    await removeDir(tmpDir);
  }
}

module.exports = { findOversizedImages, compressImage, DEFAULT_THRESHOLD_BYTES };
