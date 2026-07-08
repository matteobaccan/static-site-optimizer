function generateReadme({ folderName, title, packageJson, subdirs }) {
  const name = (packageJson && packageJson.name) || folderName;
  const description = (packageJson && packageJson.description) || title || folderName;
  const startCmd = packageJson && packageJson.scripts && packageJson.scripts.start
    ? 'npm start'
    : 'Apri index.html direttamente nel browser, oppure: npx serve .';
  const structure = subdirs.length > 0
    ? subdirs.map((d) => `- \`${d}/\``).join('\n')
    : '(nessuna sottocartella)';

  return [
    `# ${name}`,
    '',
    description,
    '',
    '## Avvio locale',
    '',
    startCmd,
    '',
    '## Struttura del progetto',
    '',
    structure,
    '',
  ].join('\n');
}

module.exports = { generateReadme };
