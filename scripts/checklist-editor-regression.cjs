// Executes the real screen callbacks with mocked hooks/native UI. No device rendering.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

function fixture(root, { screen = 'checklist', archived = false, kind = screen === 'checklist' ? 'checklist' : 'text', id = '1' } = {}) {
  const ts = require('typescript');
  const slots = [];
  let cursor = 0;
  let effects = [];
  let tree;
  let saveWait = Promise.resolve();
  const saved = [];
  const deleted = [];
  const restored = [];
  const errors = [];
  const successes = [];
  let backs = 0;
  let beforeRemove;
  const html = '<p>Current draft</p>';
  let htmlWait = Promise.resolve(html);
  const nativeEditor = { getHTML: () => htmlWait };
  const initial = [
    { id: 1, text: 'first', checked: false },
    { id: 2, text: 'second', checked: false },
    { id: 3, text: 'done', checked: true },
  ];
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const hooks = {
    forwardRef: render => render,
    useState(initialValue) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initialValue === 'function' ? initialValue() : initialValue;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(value) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: value };
      return slots[index];
    },
    useMemo(fn, deps) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { deps, value: fn() };
      return slots[index].value;
    },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) {
        slots[index]?.cleanup?.();
        slots[index] = { deps };
        effects.push(() => { slots[index].cleanup = fn(); });
      }
    },
  };
  const element = (type, props) => {
    if (type === 'EnrichedTextInput' && props.ref) props.ref.current = nativeEditor;
    return { type, props };
  };
  const redirects = [];
  const router = { back() { backs++; }, replace(route) { redirects.push(route); } };
  const navigation = {
    addListener(event, callback) { assert.equal(event, 'beforeRemove'); beforeRemove = callback; return () => {}; },
    dispatch() { backs++; },
  };
  const haptics = { light: async () => {}, success: async () => {} };
  const t = key => key;
  const mocks = {
    react: hooks,
    'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'Fragment' },
    'react-native': Object.fromEntries(['Pressable', 'Text', 'TextInput', 'View'].map(name => [name, name])),
    'react-native-keyboard-controller': { KeyboardAwareScrollView: 'KeyboardAwareScrollView', KeyboardStickyView: 'KeyboardStickyView', useKeyboardState: () => false },
    'react-native-enriched-html': { EnrichedTextInput: 'EnrichedTextInput', EnrichedText: 'EnrichedText' },
    'react-native-gesture-handler': { ScrollView: 'GestureScrollView' },
    'react-native-reanimated': { default: { createAnimatedComponent: component => component }, __esModule: true },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    'react-native-draggable-flatlist': { default: 'DraggableFlatList', ScaleDecorator: 'ScaleDecorator', __esModule: true },
    'expo-router': { useRouter: () => router, useLocalSearchParams: () => ({ id }), useNavigation: () => navigation },
    'sonner-native': { toast: { error: message => errors.push(message), success: message => successes.push(message) } },
    '../../src/components/AppIcons': new Proxy({}, { get: (_target, name) => name }),
    '../../src/lib/i18n': { useI18n: () => ({ t }) },
    '../../src/lib/theme': { useThemeColors: () => ({}) },
    '../../src/hooks/useHaptics': { useHaptics: () => haptics },
    '../../src/components/ConfirmDialog': { ConfirmDialog: 'ConfirmDialog' },
    '../../src/components/NoteActions': { NoteActions: 'NoteActions' },
    '../../src/components/ui/Checkbox': { Checkbox: 'Checkbox' },
    '../../src/components/ChecklistItemRow': { ChecklistItemRow: 'ChecklistItemRow' },
    '../../src/lib/db': { withTransaction: fn => fn({}) },
    '../../src/lib/notes': {
      getNote: async () => ({ id: 1, kind, title: 'Shopping', content: '<p>Loaded</p>', is_pinned: false, is_archived: archived }),
      getChecklistItems: async () => initial,
      saveChecklistNote: async (_id, fields, items) => { saved.push({ fields, items }); await saveWait; },
      updateNote: async (_id, fields) => { saved.push({ fields }); await saveWait; },
      createNote: async fields => { saved.push({ fields }); await saveWait; return { id: 2 }; },
      deleteNote: async noteId => { deleted.push(noteId); await saveWait; },
      restoreNote: async noteId => { restored.push(noteId); await saveWait; },
    },
    '../../src/lib/noteContent': {
      contentToEditorHtml: value => value, applyCheckedStrikethrough: value => value,
      hasCheckboxMarkup: () => false, parseCheckedStates: () => [],
    },
    '../../src/lib/utils': { withAlpha: value => value },
  };
  const filename = path.join(root, `app/(notes)/${screen}.tsx`);
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  const localRequire = name => {
    if (!(name in mocks)) throw new Error(`Unexpected screen dependency: ${name}`);
    return mocks[name];
  };
  vm.runInThisContext(`(function(require,module,exports,requestAnimationFrame,cancelAnimationFrame){${js}\n})`, { filename })(
    localRequire, module, module.exports, callback => setTimeout(callback, 0), clearTimeout
  );
  const find = (node, predicate) => {
    if (!node || typeof node !== 'object') return undefined;
    if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
    return predicate(node) ? node : find([node.props?.children, node.props?.ListHeaderComponent, node.props?.ListFooterComponent], predicate);
  };
  return {
    render() {
      cursor = 0; effects = [];
      tree = module.exports.default();
      effects.forEach(fn => fn());
    },
    list: () => find(tree, node => node.type === 'DraggableFlatList').props,
    save: () => find(tree, node => node.props?.accessibilityLabel === 'save')?.props,
    actions: () => find(tree, node => node.type === 'NoteActions').props,
    confirm: () => find(tree, node => node.type === 'ConfirmDialog').props,
    title: () => find(tree, node => node.type === 'TextInput').props,
    richEditor: () => find(tree, node => node.type === 'EnrichedTextInput')?.props,
    richText: () => find(tree, node => node.type === 'EnrichedText')?.props,
    control: label => find(tree, node => node.props?.accessibilityLabel === label)?.props,
    remove: event => beforeRemove(event),
    deferSave() {
      let finish;
      saveWait = new Promise((resolve, reject) => { finish = error => error ? reject(error) : resolve(); });
      return finish;
    },
    deferHtml() {
      let finish;
      htmlWait = new Promise(resolve => { finish = () => resolve(html); });
      return finish;
    },
    saved, deleted, restored, errors, successes, redirects,
    get backs() { return backs; },
  };
}

module.exports = async function verifyChecklistEditor(root) {
  const editor = fixture(root);
  editor.render();
  await Promise.resolve();
  await Promise.resolve();
  editor.render();
  const beforeDrag = editor.list();
  const onScroll = () => {};
  const scroll = beforeDrag.renderScrollComponent({ onScroll, keyboardShouldPersistTaps: 'handled' });
  assert.equal(scroll.props.onScroll, onScroll, 'Keyboard awareness must preserve drag-list scroll events');
  assert.equal(scroll.props.ScrollViewComponent({}, null).type, 'GestureScrollView', 'Keyboard awareness must preserve gesture handling');
  beforeDrag.onDragBegin?.(0);
  await editor.save().onPress();
  assert.equal(editor.saved.length, 0, 'Save must not persist the old order while a drop is pending');
  assert.equal(editor.backs, 0, 'Save must not unmount an active drag');
  editor.render();
  assert.equal(editor.save().disabled, true);
  let prevented = false;
  editor.remove({ preventDefault() { prevented = true; }, data: { action: { type: 'GO_BACK' } } });
  assert.equal(prevented, true);
  assert.equal(editor.backs, 0);
  beforeDrag.onDragEnd({ from: 0, to: 1, data: [beforeDrag.data[1], beforeDrag.data[0]] });
  const finish = editor.deferSave();
  // Invoke the still-mounted callback before the reordered state commits.
  const save = editor.save().onPress();
  const duplicate = editor.save().onPress();
  assert.equal(editor.saved.length, 1, 'Only one transaction may start before React re-renders');
  assert.deepEqual(editor.saved[0].items, [
    { text: 'second', checked: false }, { text: 'first', checked: false }, { text: 'done', checked: true },
  ]);
  assert.equal(editor.backs, 0, 'Navigation must wait for the write');
  assert.deepEqual(editor.successes, [], 'Save feedback must wait for persistence');
  editor.render();
  assert.equal(editor.save().accessibilityState.busy, true);
  editor.remove({ preventDefault() {}, data: { action: { type: 'GO_BACK' } } });
  assert.equal(editor.backs, 0, 'Back must not discard an in-flight save');
  finish();
  await Promise.all([save, duplicate]);
  assert.equal(editor.backs, 1);
  assert.deepEqual(editor.errors, []);
  assert.deepEqual(editor.successes, ['savedSuccess'], 'A successful write reports success once');

  const failed = fixture(root);
  failed.render();
  await Promise.resolve();
  await Promise.resolve();
  failed.render();
  const fail = failed.deferSave();
  const pending = failed.save().onPress();
  failed.render();
  assert.equal(failed.save().disabled, true);
  const row = failed.list().renderItem({ item: failed.list().data[0], isActive: false, drag() {} }).props.children.props;
  assert.equal(row.disabled, true, 'Items must not change during a pending save');
  row.onToggle(row.item.key);
  fail(new Error('Injected write failure'));
  await pending;
  failed.render();
  assert.equal(failed.backs, 0, 'Failed save must leave the editor open');
  assert.equal(failed.save().disabled, false, 'Failed save must allow retry');
  assert.deepEqual(failed.errors, ['saveFailed']);
  assert.deepEqual(failed.successes, [], 'Failed writes must not report success');
  failed.deferSave()();
  await failed.save().onPress();
  assert.equal(failed.saved.length, 2);
  assert.equal(failed.saved[1].items[0].checked, false);
  assert.equal(failed.backs, 1);
  assert.deepEqual(failed.successes, ['savedSuccess']);
};

module.exports.fixture = fixture;

if (require.main === module) {
  module.exports(path.resolve(__dirname, '..')).then(() => console.log('Checklist editor lifecycle passed')).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
