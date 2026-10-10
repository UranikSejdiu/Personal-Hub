// Execute provider lifecycle and update-card callbacks without native services.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function fixture(root, file, name, mocks, clock) {
  const ts = createRequire(path.join(root, 'package.json'))('typescript');
  const slots = [];
  let cursor = 0;
  let effects = [];
  let tree;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const hooks = {
    createContext: () => ({ Provider: 'Provider' }),
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
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
        const old = slots[index];
        slots[index] = { deps };
        effects.push(() => { old?.cleanup?.(); slots[index].cleanup = fn(); });
      }
    },
  };
  const t = key => key;
  const base = {
    react: hooks,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'expo-router': { useFocusEffect: fn => hooks.useEffect(fn, [fn]) },
    './i18n': { useI18n: () => ({ t }) },
    '../lib/i18n': { useI18n: () => ({ t }) },
    '../lib/theme': { useThemeColors: () => ({ primary: '#fff', primaryForeground: '#000', foreground: '#fff' }) },
    './ui/Typography': { Text: 'Text' },
    './AppIcons': new Proxy({}, { get: (_, key) => key }),
    ...mocks,
  };
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  class TestDate extends Date { static now() { return clock.now; } }
  vm.runInNewContext(js, {
    module, exports: module.exports, Date: TestDate,
    require: key => { assert.ok(key in base, `Unexpected UI dependency: ${key}`); return base[key]; },
  }, { filename: file });
  return {
    render() {
      cursor = 0; effects = [];
      tree = module.exports[name]({ children: null });
      effects.forEach(effect => effect());
      return tree;
    },
    nodes(predicate) {
      const found = [];
      const visit = node => {
        if (Array.isArray(node)) { node.forEach(visit); return; }
        if (!node || typeof node !== 'object' || !node.props) return;
        if (predicate(node)) found.push(node);
        visit(node.props.children);
      };
      visit(tree);
      return found;
    },
    dispose() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

module.exports = async function verifyUpdateUi(root) {
  const clock = { now: Date.now() };
  const successes = [];
  const errors = [];
  const toast = Object.assign(() => {}, { success: message => successes.push(message), error: message => errors.push(message) });
  const gates = [];
  const requests = [];
  let listener;
  let removed = false;
  const native = { Platform: { OS: 'android' }, AppState: {
    currentState: 'active', addEventListener: (_event, callback) => { listener = callback; return { remove: () => { removed = true; } }; },
  } };
  const provider = fixture(root, 'src/lib/UpdateContext.tsx', 'UpdateProvider', {
    'react-native': native, 'sonner-native': { toast }, './updater': {
      checkForUpdate: (...args) => { requests.push(args); const gate = deferred(); gates.push(gate); return gate.promise; },
      getCurrentVersion: async () => '1.0.0',
    },
  }, clock);
  provider.render();
  let value = provider.render().props.value;
  assert.equal(value.checking, true);
  const repeated = value.refresh();
  assert.equal(gates.length, 1);
  assert.equal(requests[0].length, 0, 'Startup requests a fresh update check');
  const latest = { versionName: '1.1.0', versionCode: 1001000, downloadUrl: 'https://example.test/app.apk', body: '' };
  const fresh = { status: 'update', currentVersion: '1.0.0', latest, checkedAt: clock.now };
  gates[0].resolve(fresh);
  await repeated;
  value = provider.render().props.value;
  assert.equal(value.hasUpdate, true);
  assert.equal(value.checking, false);
  assert.equal(successes.length, 1);
  const manual = value.refresh();
  assert.equal(requests[1].length, 0, 'Manual refresh requests a fresh check');
  gates[1].resolve(fresh);
  await manual;
  provider.render();
  assert.equal(successes.length, 1, 'Do not repeat the same update notification');
  listener?.('background'); listener?.('active');
  assert.equal(gates.length, 2, 'Do not poll on every brief app switch');
  clock.now += 16 * 60 * 1000;
  listener?.('background'); listener?.('active');
  assert.equal(gates.length, 2, 'Successful checks do not repeat on resume');
  clock.now += 6 * 60 * 60 * 1000;
  listener?.('background'); listener?.('active');
  assert.equal(gates.length, 2, 'Several hours in the background do not start another check');
  const failedManual = value.refresh();
  const cached = { status: 'error', currentVersion: '1.0.0', cachedLatest: latest, checkedAt: fresh.checkedAt };
  gates[2].resolve(cached);
  await failedManual;
  value = provider.render().props.value;
  assert.equal(value.result.status, 'error');
  assert.equal(value.hasUpdate, true);
  assert.equal(successes.length, 1);
  clock.now += 16 * 60 * 1000;
  listener?.('background'); listener?.('active');
  assert.equal(gates.length, 3, 'A failed check does not retry automatically on resume');
  provider.dispose();
  assert.equal(listener, undefined, 'An active startup does not register a resume listener');

  const backgroundGates = [];
  native.AppState.currentState = 'background';
  const backgroundProvider = fixture(root, 'src/lib/UpdateContext.tsx', 'UpdateProvider', {
    'react-native': native, 'sonner-native': { toast }, './updater': {
      checkForUpdate: () => { const pending = deferred(); backgroundGates.push(pending); return pending.promise; },
      getCurrentVersion: async () => '1.0.0',
    },
  }, clock);
  backgroundProvider.render();
  assert.equal(backgroundGates.length, 0, 'A background launch does not start network work');
  listener('active');
  assert.equal(backgroundGates.length, 1);
  assert.equal(removed, true, 'The startup listener removes itself after first activation');
  backgroundGates[0].resolve(cached);
  await flush();
  clock.now += 24 * 60 * 60 * 1000;
  listener('background'); listener('active');
  backgroundProvider.render();
  assert.equal(backgroundGates.length, 1, 'Failed startup checks do not repeat on later resumes');
  backgroundProvider.dispose();

  let context = { ...value, checking: false, refresh: async () => cached };
  let downloadGate = deferred();
  let downloadCalls = 0;
  let installCalls = 0;
  const card = fixture(root, 'src/components/UpdateCard.tsx', 'UpdateCard', {
    'react-native': { Platform: { OS: 'android' }, View: 'View', Pressable: 'Pressable' },
    'sonner-native': { toast }, '../lib/UpdateContext': { useUpdate: () => context },
    '../lib/updater': {
      downloadApk: () => { downloadCalls++; return downloadGate.promise; },
      installApk: async () => { installCalls++; }, openInstallSettings: async () => {},
    },
  }, clock);
  card.render();
  const button = label => card.nodes(node => node.props.accessibilityLabel === label)[0];
  assert.ok(button('checkForUpdates'), 'A known update must not hide Check for updates');
  assert.ok(card.nodes(node => node.props.children === 'updateCachedWarning').length);
  button('checkForUpdates').props.onPress();
  await flush();
  assert.equal(errors.at(-1), 'updateCheckFailed');
  const install = button('downloadAndInstall');
  install.props.onPress(); install.props.onPress();
  assert.equal(downloadCalls, 1);
  card.render();
  assert.equal(button('checkForUpdates').props.disabled, true);
  downloadGate.resolve({ exists: true });
  await flush();
  card.render();
  assert.equal(installCalls, 1);
  assert.ok(button('installNow'));
  context = { ...context, latest: { ...latest, versionName: '1.2.0' } };
  card.render(); card.render();
  assert.equal(button('installNow'), undefined, 'A newly detected version must not install the old pending APK');
  downloadGate = deferred();
  button('downloadAndInstall').props.onPress();
  card.dispose();
  downloadGate.resolve({ exists: true });
  await flush();
  assert.equal(installCalls, 1, 'Leaving the screen during download must not open the installer later');
  return [{ name: 'Update provider checks at startup, deduplicates notifications, exposes cached failures; update card keeps checks visible and avoids stale/background installers', passed: true }];
};
module.exports.fixture = fixture;
