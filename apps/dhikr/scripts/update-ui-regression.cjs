// Execute provider lifecycle and update-card callbacks without native services.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};

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

  const base = {
    react: hooks,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'expo-router': { useFocusEffect: fn => hooks.useEffect(fn, [fn]) },


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
    module, exports: module.exports, Date: TestDate, Error,
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
  const toast = Object.assign(() => {}, { success: message => successes.push(message), error: message => errors.push(message), info() {} });
  const gates = [];
  const requests = [];
  let downloadGate = deferred();
  let progress;
  let downloadCalls = 0;
  let installCalls = 0;
  let installError;
  let installedApk;
  let listener;
  let removed = false;
  const native = { Platform: { OS: 'android' }, AppState: {
    currentState: 'active', addEventListener: (_event, callback) => { listener = callback; return { remove: () => { removed = true; } }; },
  } };
  const provider = fixture(root, 'src/lib/UpdateContext.tsx', 'UpdateProvider', {
    'react-native': native, 'sonner-native': { toast }, './updater': {
      checkForUpdate: (...args) => { requests.push(args); const gate = deferred(); gates.push(gate); return gate.promise; },
      getCurrentVersion: async () => '1.0.0',
      downloadApk: (_release, options) => { downloadCalls++; progress = options.onProgress; return downloadGate.promise; },
      installApk: async apk => { installCalls++; installedApk = apk; if (installError) throw installError; },
    },
  }, clock);
  provider.render();
  let value = provider.render().props.value;
  assert.equal(value.checking, true);
  const repeated = value.refresh();
  assert.equal(gates.length, 1);
  assert.equal(requests[0].length, 0, 'Startup requests a fresh update check');
  const latest = { versionName: '1.1.0', versionCode: 1001000, downloadUrl: 'https://example.test/app.apk', body: 'Legacy release notes' };
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

  const renderCard = () => fixture(root, 'src/components/UpdateCard.tsx', 'UpdateCard', {
    'react-native': { Platform: { OS: 'android' }, View: 'View', Pressable: 'Pressable' },
    'sonner-native': { toast }, '../lib/UpdateContext': { useUpdate: () => provider.render().props.value },
    '../lib/updater': { openInstallSettings: async () => {} },
    './ui/Button': { Button: 'Button' },
  }, clock);
  let card = renderCard();
  card.render();
  const button = label => card.nodes(node => node.props.accessibilityLabel === label || node.props.label === label)[0];
  assert.ok(button('Check for updates'), 'A known update must not hide Check for updates');
  assert.equal(card.nodes(node => node.props.children === latest.body).length, 0, 'Cached release notes stay hidden');
  assert.ok(card.nodes(node => node.props.children === 'Could not check now. Showing the update found during the last successful check.').length);
  button('Check for updates').props.onPress();
  gates[3].resolve(cached);
  await flush();
  assert.equal(errors.at(-1), 'Failed to check for updates');

  const download = button('Download update');
  download.props.onPress(); download.props.onPress();
  assert.equal(downloadCalls, 1, 'Rapid presses start one download');
  card.render();
  assert.equal(button('Check for updates').props.disabled, true);
  card.dispose();
  progress(42);
  card = renderCard();
  card.render();
  assert.ok(card.nodes(node => node.props.children === 'Downloading… 42%').length, 'A remounted card sees ongoing progress');
  card.dispose();
  const apk = { exists: true };
  downloadGate.resolve(apk);
  await flush();
  assert.equal(installCalls, 0, 'Finishing off-screen must not open the Android installer');
  card = renderCard();
  card.render();
  assert.ok(button('Install update'), 'Returning after completion sees the downloaded update');

  installError = Error('Installer blocked');
  const install = button('Install update');
  install.props.onPress(); install.props.onPress();
  await flush();
  card.render();
  assert.equal(installCalls, 1);
  assert.equal(installedApk, apk);
  assert.ok(button('Open install settings'));
  installError = undefined;
  button('Install update').props.onPress();
  await flush();
  card.render();
  assert.equal(installCalls, 2, 'Installing can be retried without downloading again');
  assert.equal(downloadCalls, 1);
  assert.ok(button('Install update'), 'Keep the APK available after the Android installer closes');

  const newer = { ...fresh, latest: { ...latest, versionName: '1.2.0' } };
  const refreshed = provider.render().props.value.refresh();
  gates[4].resolve(newer);
  await refreshed;
  card.render();
  assert.equal(button('Install update'), undefined, 'A newer release must not install the old APK');

  downloadGate = deferred();
  button('Download update').props.onPress();
  const detail = 'Download failed after the connection closed. '.repeat(8).trim();
  card.dispose();
  downloadGate.reject(Error(detail));
  await flush();
  card = renderCard();
  card.render();
  const alert = card.nodes(node => node.props.accessibilityRole === 'alert' && node.props.children === detail)[0];
  assert.ok(alert, 'The full download error stays visible after remounting');
  assert.equal(alert.props.numberOfLines, undefined);
  assert.equal(errors.at(-1), 'Download failed. Try again.');
  assert.ok(button('Download update'), 'Failed downloads can be retried');
  assert.equal(installCalls, 2);
  card.dispose();
  provider.dispose();
  return [{ name: 'Update checks, download across navigation, manual installer retry, stale APK protection, and download errors', passed: true }];
};
module.exports.fixture = fixture;
