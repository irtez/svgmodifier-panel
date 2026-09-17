const { readFileSync, writeFileSync } = require('fs');
const { resolve } = require('path');
const { compile } = require('json-schema-to-typescript');
const { format } = require('prettier');
const { ESLint } = require('eslint');

async function main() {
  const root = resolve(__dirname, '..');
  const schema = JSON.parse(readFileSync(resolve(root, 'docs/svgmodifier-snapshot-v1.schema.json'), 'utf8'));
  const generated = await compile(schema, 'SvgModifierSnapshotV1', {
    bannerComment: '/* Generated from docs/svgmodifier-snapshot-v1.schema.json. Run npm run capture:types. */',
  });
  const target = resolve(root, 'src/components/capture/models.ts');
  const [linted] = await new ESLint({ cwd: root, fix: true }).lintText(generated, { filePath: target });
  if (linted.errorCount) {
    throw new Error('Generated capture types violate the project lint rules.');
  }
  const content = format(linted.output ?? generated, { ...require('../.prettierrc.js'), parser: 'typescript' });
  if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== content) {
      throw new Error('Capture types are outdated. Run npm run capture:types and commit the result.');
    }
  } else {
    writeFileSync(target, content);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
