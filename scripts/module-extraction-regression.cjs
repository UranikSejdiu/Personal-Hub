const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

module.exports = function verifyExtraction(root) {
  const registryFile = path.join(root, 'src/hub/registry.ts');
  const preferencesFile = path.join(root, 'src/hub/ModulePreferences.tsx');
  const module = { exports: {} };
  const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInThisContext(`(function(module,exports){${compile(registryFile)}\n})`, { filename: registryFile })(module, module.exports);
  const registry = module.exports;
  assert.deepEqual(registry.HUB_APPS.map(app => app.id), ['budget', 'notes', 'tasks']);
  assert.equal(registry.getHubRoute('dhikr'), '/(budget)');
  const preferences = { exports: {} };
  const requireMock = name => {
    if (name === './registry') return registry;
    if (name === 'react') return { createContext: () => null };
    if (name === 'react/jsx-runtime' || name === '@react-native-async-storage/async-storage') return {};
    throw new Error('Unexpected preferences dependency: ' + name);
  };
  vm.runInThisContext(`(function(require,module,exports){${compile(preferencesFile)}\nmodule.exports.validModuleIds = validModuleIds;\n})`, { filename: preferencesFile })(requireMock, preferences, preferences.exports);
  assert.deepEqual(preferences.exports.validModuleIds(['notes', 'dhikr']), ['notes']);
  assert.deepEqual(preferences.exports.validModuleIds(['dhikr', 'budget', 'tasks']), ['budget', 'tasks']);
  assert.equal(preferences.exports.validModuleIds(['dhikr']), null);
  assert.equal(preferences.exports.validModuleIds(['unknown']), null);
  assert.deepEqual(preferences.exports.toggleEnabledModule(['notes'], 'dhikr'), ['notes']);
};
