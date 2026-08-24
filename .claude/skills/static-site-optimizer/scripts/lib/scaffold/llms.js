function generateLlmsTxt({ title, summary, pages }) {
  const pageLines = pages.map((p) => `- [${p.path}](${p.path}): ${p.description}`).join('\n');

  return [
    `# ${title}`,
    '',
    `> ${summary}`,
    '',
    '## Pages',
    '',
    pageLines,
    '',
  ].join('\n');
}

module.exports = { generateLlmsTxt };
