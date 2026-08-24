// scripts/test/scaffold-readme.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { generateReadme } = require('./readme');

test('uses package.json name/description and an npm start hint when available', () => {
  const md = generateReadme({
    folderName: 'nuovobushido',
    title: 'Accademia Bushido',
    packageJson: { name: 'nuovobushido', description: 'Modern redesign of Accademia Bushido website', scripts: { start: 'node server.js' } },
    subdirs: ['assets', 'cv'],
  });

  assert.ok(md.startsWith('# nuovobushido'));
  assert.ok(md.includes('Modern redesign of Accademia Bushido website'));
  assert.ok(md.includes('npm start'));
  assert.ok(md.includes('- `assets/`'));
  assert.ok(md.includes('- `cv/`'));
});

test('falls back to folder name, page title, and a static-file hint without package.json', () => {
  const md = generateReadme({ folderName: 'psico', title: 'Psicologa a Cirie', packageJson: null, subdirs: [] });

  assert.ok(md.startsWith('# psico'));
  assert.ok(md.includes('Psicologa a Cirie'));
  assert.ok(md.includes('npx serve'));
});
