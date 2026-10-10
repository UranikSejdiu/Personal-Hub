// Run the actual editor callbacks against delayed saves and failures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

module.exports = async function verifyModal(root) {
  const slots = [], writes = [], saved = [];
  let cursor = 0, tree, closed = 0;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => { slots[index] = value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback: fn => fn,
  };
  const element = (type, props) => ({ type, props });
  const deferWrite = (...args) => new Promise((resolve, reject) => writes.push({ args, resolve, reject }));
  const mocks = {
    react: hooks,
    'react/jsx-runtime': { jsx: element, jsxs: element },
    'react-native': Object.fromEntries(['View', 'Pressable', 'Modal', 'ScrollView'].map(key => [key, key])),
    'react-native-keyboard-controller': { KeyboardAvoidingView: 'KeyboardAvoidingView' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 16 }) },
    './ui/Typography': { Text: 'Text', TextInput: 'TextInput' },
    './AppIcons': { X: 'X' },
    './NumberInput': { NumberInput: 'NumberInput' },
    '../lib/i18n': { useI18n: () => ({ t: key => key }) },
    '../lib/theme': { useThemeColors: () => ({}), useThemeVariables: () => ({}) },
    '../lib/dhikr': { addDhikr: deferWrite, updateDhikr: deferWrite },
  };
  const filename = path.join(root, 'src/components/DhikrModal.tsx');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: key => {
    assert(key in mocks, 'Unexpected editor dependency: ' + key); return mocks[key];
  } }, { filename });
  const props = { mode: 'edit', dhikr: { id: 1, name: 'SubhanAllah', daily_limit: 33, total_count: 1250, daily_count: 12 },
    onSave: row => saved.push(row), onClose: () => closed++ };
  const render = () => { cursor = 0; tree = module.exports.DhikrModal(props); };
  const nodes = predicate => {
    const found = [];
    const visit = node => {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node?.props) return;
      if (predicate(node)) found.push(node.props);
      visit(node.props.children);
    };
    visit(tree); return found;
  };
  const button = label => nodes(node => node.type === 'Pressable' && node.props.accessibilityLabel === label)[0];
  const limit = () => nodes(node => node.type === 'NumberInput' && node.props.accessibilityLabel === 'limitLabel')[0];
  render();
  limit().onChange(Infinity); render();
  await button('save').onPress(); render();
  assert.equal(writes.length, 0, 'Non-finite limits cannot be saved');
  limit().onChange(33); render();
  const save = button('save').onPress;
  save(); save(); render();
  assert.equal(writes.length, 1, 'Double taps cannot create duplicate saves');
  assert.equal(limit().disabled, true);
  assert.equal(nodes(node => node.type === 'TextInput')[0].editable, false);
  tree.props.onRequestClose(); button('cancel').onPress();
  assert.equal(closed, 0, 'Dismissal is blocked while the write is pending');
  writes[0].reject(new Error('Disk failed'));
  await new Promise(resolve => setImmediate(resolve)); render();
  assert.equal(nodes(node => node.props.accessibilityRole === 'alert')[0].children, 'errorSavingData');
  assert.equal(limit().disabled, false);
  assert.equal(saved.length, 0);
  button('save').onPress(); render();
  writes[1].resolve(); await new Promise(resolve => setImmediate(resolve)); render();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].total_count, 1250, 'Unedited lifetime counts survive saving');
  tree.props.onRequestClose(); assert.equal(closed, 1);
  console.log('Passed: editor validation, double-save isolation, dismissal lock, failure retry, and count preservation.');
};
