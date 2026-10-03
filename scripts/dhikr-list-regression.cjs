// Exercise the screen's Arrange/Done/Cancel callbacks with delayed and failed SQLite writes.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture(root) {
  const slots = [];
  let cursor = 0;
  let focus;
  let focusedCallback;
  let cleanup;
  let tree;
  const writes = [];
  const errors = [];
  const initial = [1, 2, 3].map(id => ({
    id, name: `Dhikr ${id}`, total_count: 0, daily_count: 0, daily_limit: null,
  }));
  let persisted = initial;
  let read = async () => persisted;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const hooks = {
    useState(value) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof value === 'function' ? value() : value;
      return [slots[index], next => {
        slots[index] = typeof next === 'function' ? next(slots[index]) : next;
      }];
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
  };
  const element = (type, props) => ({ type, props });
  const t = key => key;
  const mocks = {
    react: hooks,
    'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'Fragment' },
    'react-native': {
      View: 'View', Text: 'Text', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator',
      Alert: {}, BackHandler: { addEventListener: () => ({ remove() {} }) },
    },
    'react-native-reanimated': {
      __esModule: true,
      default: { FlatList: 'FlatList' },
      LinearTransition: { duration: () => ({}) },
    },
    'expo-router': { useRouter: () => ({ push() {} }), useFocusEffect: fn => { focus = fn; } },
    'sonner-native': { toast: { error: message => errors.push(message) } },
    '../../src/components/AppIcons': new Proxy({}, { get: (_target, name) => name }),
    '../../src/components/ui/Button': { Button: 'Button', IconButton: 'IconButton' },
    '../../src/components/ui/Card': { Card: 'Card' },
    '../../src/components/ui/AnchoredMenu': {
      AnchoredMenu: 'AnchoredMenu',
      useAnchoredMenu: () => ({ triggerRef: { current: null }, anchor: null, open() {}, close() {} }),
    },
    '../../src/components/DhikrModal': { DhikrModal: 'DhikrModal' },
    '../../src/components/ConfirmDialog': { ConfirmDialog: 'ConfirmDialog' },
    '../../src/lib/i18n': { useI18n: () => ({ t }) },
    '../../src/lib/theme': { useThemeColors: () => ({}) },
    '../../src/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
    '../../src/hooks/useHaptics': { useHaptics: () => ({ light: async () => {}, warning: async () => {} }) },
    '../../src/lib/dhikrSelection': { setSelectedDhikrId: async () => {}, clearSelectedDhikrIdIfMissing: async () => {} },
    '../../src/lib/dhikr': {
      loadDhikrs: () => read(),
      deleteDhikr: async id => { persisted = persisted.filter(item => item.id !== id); },
      reorderDhikrs: order => new Promise((resolve, reject) => {
        writes.push({
          order,
          finish: error => {
            if (error) reject(error);
            else {
              persisted = order.map(id => persisted.find(item => item.id === id));
              resolve();
            }
          },
        });
      }),
    },
  };
  const filename = path.join(root, 'app/(dhikr)/list.tsx');
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${js}\n})`, { filename })(name => {
    if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`);
    return mocks[name];
  }, module, module.exports);
  const find = (node, predicate) => {
    if (!node || typeof node !== 'object') return undefined;
    if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
    return predicate(node) ? node : find(node.props?.children, predicate);
  };
  const list = () => find(tree, node => node.type === 'FlatList').props;
  const button = label => find(tree, node =>
    (node.type === 'Button' && node.props.label === label) ||
    (node.type === 'Pressable' && node.props.accessibilityLabel === label)
  ).props;
  return {
    render() {
      cursor = 0;
      tree = module.exports.default();
      if (focusedCallback !== focus) {
        cleanup?.();
        focusedCallback = focus;
        cleanup = focus();
      }
    },
    list, button,
    dialog: () => find(tree, node => node.type === 'ConfirmDialog').props,
    deleteFromMenu(id) {
      const item = list().data.find(value => value.id === id);
      const row = list().renderItem({ item, index: list().data.indexOf(item) });
      const menu = find(row.type(row.props), node => node.type === 'AnchoredMenu');
      assert.ok(menu, 'Each row must offer an actions menu');
      const deleteAction = menu.props.items.find(action => action.key === 'delete');
      assert.ok(deleteAction, 'The actions menu must offer delete');
      deleteAction.onPress();
    },
    order: () => list().data.map(item => item.id),
    move(id, direction) {
      const item = list().data.find(value => value.id === id);
      list().renderItem({ item, index: list().data.indexOf(item) }).props.onMove(id, direction);
    },
    refocus() { cleanup?.(); cleanup = focus(); },
    setRead(fn) { read = fn; },
    writes, errors,
  };
}

module.exports = async function verifyDhikrList(root) {
  const screen = fixture(root);
  screen.render(); await flush(); screen.render();
  assert.deepEqual(screen.order(), [1, 2, 3]);

  screen.button('dhikrArrange').onPress(); screen.render();
  screen.move(2, -1); screen.render();
  assert.deepEqual(screen.order(), [2, 1, 3]);
  assert.equal(screen.writes.length, 0, 'Preview moves must not write');
  screen.move(3, -1); screen.move(3, -1); screen.render();
  assert.deepEqual(screen.order(), [3, 2, 1], 'Rapid taps must use the latest draft order');
  screen.button('cancel').onPress(); screen.render();
  assert.deepEqual(screen.order(), [1, 2, 3], 'Cancel must restore the persisted order');
  assert.equal(screen.writes.length, 0);

  screen.button('dhikrArrange').onPress(); screen.render();
  screen.move(2, -1); screen.render();
  const done = screen.button('dhikrArrangeDone').onPress(); screen.render();
  assert.deepEqual(screen.writes.map(write => write.order), [[2, 1, 3]]);
  screen.move(2, 1);
  screen.button('cancel').onPress();
  screen.button('saving').onPress();
  assert.equal(screen.writes.length, 1, 'Saving must lock additional moves and duplicate writes');
  screen.writes[0].finish();
  await done; screen.render();
  assert.deepEqual(screen.order(), [2, 1, 3]);

  screen.button('dhikrArrange').onPress(); screen.render();
  screen.move(1, -1); screen.render();
  const failed = screen.button('dhikrArrangeDone').onPress(); screen.render();
  screen.writes[1].finish(new Error('SQLite write failed'));
  await failed; screen.render();
  assert.deepEqual(screen.order(), [1, 2, 3], 'A failed save keeps its draft visible');
  assert.deepEqual(screen.errors, ['errorReordering']);
  const retry = screen.button('dhikrArrangeDone').onPress();
  screen.writes[2].finish();
  await retry; screen.render();
  assert.deepEqual(screen.order(), [1, 2, 3]);
  screen.button('dhikrArrange').onPress(); screen.render();
  await screen.button('dhikrArrangeDone').onPress(); screen.render();
  assert.equal(screen.writes.length, 3, 'Done without changes must not write');

  let finishRead;
  screen.setRead(() => new Promise(resolve => { finishRead = resolve; }));
  screen.refocus(); await flush(); screen.render();
  finishRead(screen.list().data);
  await flush(); screen.render();
  assert.deepEqual(screen.order(), [1, 2, 3], 'Refocus reloads the persisted order');

  screen.deleteFromMenu(2); screen.render();
  assert.equal(screen.dialog().visible, true);
  assert.deepEqual(screen.order(), [1, 2, 3], 'Requesting deletion must not write');
  screen.dialog().onClose(); screen.render();
  assert.equal(screen.dialog().visible, false);
  assert.deepEqual(screen.order(), [1, 2, 3], 'Cancelling deletion preserves records');
  screen.deleteFromMenu(2); screen.render();
  await screen.dialog().onConfirm(); screen.render();
  assert.deepEqual(screen.order(), [1, 3], 'Confirmation removes only the selected record');
  assert.equal(screen.dialog().visible, false);
};

if (require.main === module) {
  module.exports(path.resolve(__dirname, '..'))
    .then(() => console.log('Dhikr Arrange mode passed'))
    .catch(error => { console.error(error); process.exitCode = 1; });
}
