const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { fixture } = require('./update-ui-regression.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));

function selection(root, storage) {
  const file = path.join(root, 'src/lib/dhikrSelection.ts');
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, console: { warn() {} },
    require: () => ({ __esModule: true, default: storage }) }, { filename: file });
  return module.exports;
}

module.exports = async function verifyRelease(root) {
  let finishRead, reads = 0;
  const writes = [];
  const state = new Map();
  const api = selection(root, {
    getItem: () => { reads++; return new Promise(resolve => { finishRead = resolve; }); },
    setItem: (key, value) => new Promise(resolve => { writes.push({ value, finish() { state.set(key, value); resolve(); } }); }),
    removeItem: async key => { state.delete(key); },
  });
  const reading = api.getSelectedDhikrId();
  const first = api.setSelectedDhikrId(2);
  const second = api.setSelectedDhikrId(3);
  await flush();
  assert.equal(writes.length, 1, 'Selection writes must run in order');
  finishRead('1');
  assert.equal(await reading, 3, 'A stale disk read cannot override a newer selection');
  writes[0].finish(); await first; await flush();
  writes[1].finish(); await second;
  assert.equal(state.get('dhikr_selected_id'), '3');
  assert.equal(await api.getSelectedDhikrId(), 3);
  assert.equal(reads, 1, 'Focus changes reuse the in-memory selection');
  const bad = selection(root, { getItem: async () => '12garbage' });
  assert.equal(await bad.getSelectedDhikrId(), null);
  await assert.rejects(api.setSelectedDhikrId(-1));
  const unavailable = selection(root, { setItem: async () => { throw new Error('Storage unavailable'); } });
  await unavailable.setSelectedDhikrId(4);
  assert.equal(await unavailable.getSelectedDhikrId(), 4, 'Storage failure must not make the counter open the wrong record');

  let failed = true, imports = 0, restores = 0;
  const errors = [];
  const mockedBackup = {
    hasSafetyBackup: () => true,
    readBackupFile: async () => 'selected-backup', parseBackup: () => [{ id: 1 }],
    importBackup: async () => { imports++; if (failed) throw new Error('Write failed'); },
    restoreSafetyBackup: async () => { restores++; if (failed) throw new Error('Write failed'); },
  };
  const screen = fixture(root, 'app/(dhikr)/settings.tsx', 'default', {
    'react-native': new Proxy({ Platform: { OS: 'android' }, BackHandler: { addEventListener: () => ({ remove() {} }) } }, { get: (obj, key) => key in obj ? obj[key] : key }),
    'expo-document-picker': { getDocumentAsync: async () => ({ canceled: false, assets: [{ uri: 'cache/backup.json' }] }) },
    'expo-application': {}, 'sonner-native': { toast: { error: message => errors.push(message), success() {} } },
    '../../src/components/ui/Typography': { Text: 'Text' }, '../../src/components/ui/Button': { Button: 'Button' },
    '../../src/components/ui/AnchoredMenu': { AnchoredMenu: 'AnchoredMenu', useAnchoredMenu: () => ({ triggerRef: { current: null }, anchor: null, open() {}, close() {} }) },
    '../../src/components/AppIcons': new Proxy({}, { get: (_, key) => key }),
    '../../src/components/ConfirmDialog': { ConfirmDialog: 'ConfirmDialog' }, '../../src/components/UpdateCard': { UpdateCard: 'UpdateCard' },
    '../../src/lib/i18n': { useI18n: () => ({ t: key => key }) },
    '../../src/lib/theme': { useTheme: () => ({ theme: 'light', setTheme() {} }), useThemeColors: () => ({}) },
    '../../src/lib/utils': { withAlpha: color => color },
    '../../src/hooks/useHaptics': { getHapticsEnabled: async () => true },
    '../../src/lib/backup': mockedBackup,
  }, { now: Date.now() });
  const settle = async () => { await flush(); screen.render(); };
  const node = (type, key, value) => screen.nodes(n => (n.type === type || n.type?.name === type) && n.props[key] === value)[0];
  screen.render(); await settle();
  node('SettingsRow', 'label', 'settingsBackupRestore').props.onPress(); screen.render();
  node('Button', 'label', 'importData').props.onPress(); await settle();
  const dialog = title => node('ConfirmDialog', 'title', title);
  assert.equal(dialog('importData').props.visible, true);
  await dialog('importData').props.onConfirm(); screen.render();
  assert.equal(dialog('importData').props.visible, true, 'Failed imports retain the chosen file for retry');
  failed = false;
  await dialog('importData').props.onConfirm(); screen.render();
  assert.equal(dialog('importData').props.visible, false);
  assert.equal(imports, 2);
  node('Button', 'label', 'restoreSafetyBackup').props.onPress(); screen.render();
  failed = true;
  await dialog('restoreSafetyBackup').props.onConfirm(); screen.render();
  assert.equal(dialog('restoreSafetyBackup').props.visible, true);
  failed = false;
  await dialog('restoreSafetyBackup').props.onConfirm(); screen.render();
  assert.equal(dialog('restoreSafetyBackup').props.visible, false);
  assert.equal(restores, 2);
  assert.equal(errors.length, 2);
  screen.dispose();
  console.log('Passed: selection write ordering, stale reads, one shared read, unavailable storage, malformed IDs, and backup failure retry.');
};
