function findOversizedImages(siteDir, listFilesRecursive, statFile, thresholdBytes = 150000) {
  return listFilesRecursive(siteDir)
    .filter((file) => /\.(jpe?g|png)$/i.test(file))
    .map((file) => ({ path: file, size: statFile(file).size }))
    .filter((file) => file.size > thresholdBytes);
}

module.exports = { findOversizedImages };
