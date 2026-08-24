const fs = require('node:fs');
const path = require('node:path');

function discoverSites(rootDir) {
  return fs.readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(rootDir, entry.name))
    .filter((dir) => fs.existsSync(path.join(dir, 'index.html')));
}

module.exports = { discoverSites };
