function generateReadme({ folderName, title, packageJson, subdirs }) {
  const name = (packageJson && packageJson.name) || folderName;
  const description = (packageJson && packageJson.description) || title || folderName;
  const startCmd = packageJson && packageJson.scripts && packageJson.scripts.start
    ? 'npm start'
    : 'Open index.html directly in a browser, or run: npx serve .';
  const structure = subdirs.length > 0
    ? subdirs.map((d) => `- \`${d}/\``).join('\n')
    : '(no subfolders)';

  return [
    `# ${name}`,
    '',
    description,
    '',
    '## Running locally',
    '',
    startCmd,
    '',
    '## Project structure',
    '',
    structure,
    '',
  ].join('\n');
}

module.exports = { generateReadme };
