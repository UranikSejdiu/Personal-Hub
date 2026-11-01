// Exercise the legacy lint APIs that need compatibility with minimatch 11.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { Linter } = require('eslint');

module.exports = async function checkDependencies(root) {
  const pluginModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'plugins/withWindowsCMakePaths.js'), 'utf8'), {
    module: pluginModule,
    require: name => {
      assert.equal(name, 'expo/config-plugins');
      return { withProjectBuildGradle: (config, action) => action(config) };
    },
  });
  const template = 'apply plugin: "expo-root-project"\napply plugin: "com.facebook.react.rootproject"\n// Other native configuration\n';
  const applyPlugin = contents => pluginModule.exports({ modResults: { contents } }).modResults.contents;
  const configured = applyPlugin(template);
  assert.equal(applyPlugin(configured), configured, 'Repeated prebuilds must not duplicate settings or remove other native configuration');
  assert(configured.indexOf('-DCMAKE_OBJECT_PATH_MAX=240') < configured.indexOf('apply plugin: "expo-root-project"'), 'Register the path limit before React eagerly evaluates the app');
  assert(configured.endsWith('// Other native configuration\n'));
  for (const consumer of ['eslint', '@eslint/config-array', '@eslint/eslintrc', 'eslint-plugin-react', 'eslint-plugin-import']) {
    const requireFromConsumer = createRequire(require.resolve(consumer));
    const match = requireFromConsumer('minimatch');
    assert.equal(requireFromConsumer('minimatch/package.json').version, '11.0.3');
    assert.equal(match('src/components/NoteCard.tsx', '**/*.{ts,tsx}'), true, consumer);
    assert.equal(match('node_modules/a.js', 'src/**'), false, consumer);
    assert.equal(new match.Minimatch('**/*.tsx').match('src/NoteCard.tsx'), true, consumer);
  }
  const linter = new Linter();
  const plugins = { import: require('eslint-plugin-import'), react: require('eslint-plugin-react') };
  const languageOptions = { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } };
  const check = (code, rules) => linter.verify(code, [{ files: ['**/*.jsx'], languageOptions, plugins, rules }], {
    filename: path.join(root, 'dependency-probe.jsx'),
  });
  assert.deepEqual(check('import x from "react/jsx-runtime";', {
    'import/no-internal-modules': ['error', { allow: ['react/**'] }],
  }), []);
  const forbidden = check('import x from "react/jsx-runtime";', {
    'import/no-internal-modules': ['error', { forbid: ['react/**'] }],
  });
  assert.equal(forbidden.length, 1);
  assert.equal(forbidden[0].ruleId, 'import/no-internal-modules');
  assert.equal(forbidden[0].fatal, undefined);
  assert.deepEqual(check('const view = <Bad_name />;', {
    'react/jsx-pascal-case': ['error', { ignore: ['Bad_*'] }],
  }), []);
  assert.equal(check('const view = <Bad_name />;', { 'react/jsx-pascal-case': 'error' })[0]?.ruleId, 'react/jsx-pascal-case');
  const { glob, globSync } = require('glob');
  const files = globSync('app/**/*.tsx', { cwd: root, ignore: ['**/_layout.tsx'] }).map(file => file.replaceAll('\\', '/'));
  assert(files.length > 0, 'App routes must be discoverable');
  assert(!files.some(file => file.endsWith('_layout.tsx')));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(glob('**/*', { cwd: root, signal: controller.signal }), { name: 'AbortError' });
  console.log('Passed dependency compatibility: fixed matcher resolution, legacy lint rules, file discovery and cancelled traversal.');
};
