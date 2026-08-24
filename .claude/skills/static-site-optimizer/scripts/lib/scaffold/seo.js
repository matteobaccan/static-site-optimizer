function generateRobotsTxt() {
  return ['User-agent: *', 'Allow: /', '', 'Sitemap: sitemap.xml', ''].join('\n');
}

function generateSitemapXml(pages) {
  const urls = pages.map((p) => `  <url><loc>${p}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

module.exports = { generateRobotsTxt, generateSitemapXml };
