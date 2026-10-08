// Execute screen callbacks with mocked hooks/native UI; no device tests.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');

function fixture(root, file, exportName, props, dependencies = {}, params = {}) {
  const ts = createRequire(path.join(root, 'package.json'))('typescript');
  const slots = [];
  let cursor = 0;
  let effects = [];
  let tree;
  const timers = new Map();
  let timerId = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
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
        const previous = slots[index];
        slots[index] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = fn(); });
      }
    },
  };
  const t = key => key;
  const haptics = { light: async () => {}, warning: async () => {}, success: async () => {} };
  const colors = { primary: '#fff', mutedForeground: '#aaa', destructive: '#f00' };
  const toastErrors = [];
  const router = { setParams(next) { Object.assign(params, next); }, push() {} };
  const mocked = {
    react: hooks,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' },
    'react-native': new Proxy({ AppState: { addEventListener: () => ({ remove() {} }) }, StyleSheet: { create: value => value } }, {
      get(target, key) { return key in target ? target[key] : key; },
    }),
    'expo-router': { useFocusEffect: fn => hooks.useEffect(fn, [fn]), useRouter: () => router,
      useLocalSearchParams: () => params },
    'react-native-keyboard-controller': { KeyboardAvoidingView: 'KeyboardAvoidingView', KeyboardAwareScrollView: 'KeyboardAwareScrollView' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    'sonner-native': { toast: { error: message => toastErrors.push(message), success() {} } },
    ...dependencies,
  };
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  const requireMock = name => {
    if (name in mocked) return mocked[name];
    if (/\/i18n$/.test(name)) return { useI18n: () => ({ t, lang: 'en' }), monthLabelShort: (_, value) => value };
    if (/\/theme$/.test(name)) return { useThemeColors: () => colors, useThemeVariables: () => ({}) };
    if (/\/useHaptics$/.test(name)) return { useHaptics: () => haptics };
    if (/\/utils$/.test(name)) return { cn: (...values) => values.filter(Boolean).join(' '), formatCurrency: value => `€${value}`, withAlpha: color => color };
    if (/\/taskDates$/.test(name)) return { taskDateKey: () => '2030-01-01', formatTaskDate: value => value, isTaskInput: value => Boolean(value.title.trim()) };
    if (/\/taskEvents$/.test(name)) return { notifyTaskChanges() {}, subscribeTaskChanges: () => () => {} };
    if (/\/taskReminders$/.test(name)) return { taskReminderDate: () => null, requestTaskReminderPermission: async () => 'granted' };
    if (/\/AppIcons$/.test(name)) return new Proxy({}, { get: (_, key) => key });
    if (/\/ui\/Button$/.test(name)) return { Button: 'Button', IconButton: 'IconButton' };
    const component = name.split('/').at(-1);
    return { [component]: component, ...(component === 'CustomExpensesSection' ? { CustomExpenseRow: 'CustomExpenseRow', CustomExpensesHeader: 'CustomExpensesHeader' } : {}) };
  };
  const context = { require: requireMock, module, exports: module.exports,
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; }, clearTimeout(id) { timers.delete(id); } };
  vm.runInNewContext(compiled, context, { filename: file });
  function render() {
    cursor = 0; effects = [];
    tree = module.exports[exportName](props);
    for (const effect of effects) effect();
    return tree;
  }
  function findAll(predicate) {
    const found = [];
    const visit = value => {
      if (Array.isArray(value)) { value.forEach(visit); return; }
      if (!value || typeof value !== 'object' || !value.props) return;
      if (predicate(value)) found.push(value);
      visit(value.props.children);
      for (const key of ['ListHeaderComponent', 'ListEmptyComponent', 'ListFooterComponent']) visit(value.props[key]);
    };
    visit(tree);
    return found;
  }
  return {
    render, errors: toastErrors,
    all: type => findAll(node => node.type === type || node.type?.name === type),
    async settle() { for (let i = 0; i < 12; i++) { render(); await Promise.resolve(); } },
    timers() { for (const [id, timer] of timers) if (timer.delay <= 1000) { timers.delete(id); timer.fn(); } },
    dispose() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

module.exports = async function verifyHubImprovements(root, parseNumberInput) {
  const results = [];
  const verify = async (name, fn) => { await fn(); results.push({ name, passed: true }); };
  await verify('Number fields accept grouped amounts and retain the last valid value after invalid input', async () => {
    const changes = [];
    const props = { value: 10, decimals: 2, onChange: value => { changes.push(value); props.value = value; } };
    const input = fixture(root, 'src/components/NumberInput.tsx', 'NumberInput', props, { '../lib/numberInput': { parseNumberInput } });
    input.render();
    input.all('TextInput')[0].props.onFocus(); input.render();
    input.all('TextInput')[0].props.onChangeText('1,200.50'); input.render();
    input.all('TextInput')[0].props.onBlur(); input.render();
    assert.equal(props.value, 1200.5);
    const count = changes.length;
    input.all('TextInput')[0].props.onChangeText('12.3.4'); input.render();
    input.all('TextInput')[0].props.onBlur(); input.render();
    assert.equal(changes.length, count);
    assert.equal(input.all('TextInput')[0].props.value, '12.3.4');
    assert.ok(input.all('Text').some(node => node.props.accessibilityRole === 'alert'));
    input.dispose();
  });
  await verify('Task drafts survive canceled discard, unchanged dialogs close, and save failures preserve edits', async () => {
    let closed = 0;
    const editor = fixture(root, 'src/components/tasks/TaskEditor.tsx', 'TaskEditor', {
      initialDate: null, onClose: () => { closed++; }, onSave: async () => { throw new Error('write failed'); },
    });
    editor.render();
    editor.all('TaskFormDialog')[0].props.onClose();
    assert.equal(closed, 1);
    const dirty = fixture(root, 'src/components/tasks/TaskEditor.tsx', 'TaskEditor', {
      initialDate: null, onClose: () => { closed++; }, onSave: async () => { throw new Error('write failed'); },
    });
    dirty.render();
    dirty.all('TextInput')[0].props.onChangeText('Keep this draft'); dirty.render();
    dirty.all('TaskFormDialog')[0].props.onClose(); dirty.render();
    assert.equal(closed, 1);
    assert.equal(dirty.all('ConfirmDialog')[0].props.visible, true);
    dirty.all('ConfirmDialog')[0].props.onClose(); dirty.render();
    assert.equal(dirty.all('TextInput')[0].props.value, 'Keep this draft');
    dirty.all('Button').find(node => node.props.label === 'save').props.onPress();
    await dirty.settle();
    assert.equal(closed, 1);
    assert.ok(dirty.all('Text').some(node => node.props.children === 'errorSavingData'));
    dirty.all('TaskFormDialog')[0].props.onClose(); dirty.render();
    dirty.all('ConfirmDialog')[0].props.onConfirm();
    assert.equal(closed, 2);
    editor.dispose(); dirty.dispose();
  });
  await verify('Savings hides balances on read failure and Retry restores loaded data', async () => {
    let fail = true;
    const savings = fixture(root, 'app/(budget)/savings.tsx', 'default', {}, {
      '../../src/lib/budget': { loadSavingsGoal: async () => ({ goal_amount: 100 }) },
      '../../src/lib/savings': { listAutoDeposits: async () => [], listTransactions: async () => [],
        getSavingsSummary: async () => { if (fail) throw new Error('read failed'); return { balance: 25, totalSaved: 25, totalSpent: 0 }; } },
    });
    savings.render();
    assert.equal(savings.all('FlatList').length, 0);
    await savings.settle();
    assert.equal(savings.all('SavingsGoalCard').length, 0);
    assert.equal(savings.all('FlatList').length, 0);
    fail = false;
    savings.all('Button').find(node => node.props.label === 'retry').props.onPress();
    await savings.settle();
    assert.equal(savings.all('SavingsGoalCard')[0].props.balance, 25);
    savings.dispose();
  });
  await verify('Expense deletion requires confirmation and failed deletion retains the expense for retry', async () => {
    let deleted = 0;
    let fail = true;
    const expense = { id: 1, category: 'Rent', amount: 300, paid: false, is_recurring: false };
    const budget = fixture(root, 'app/(budget)/budget.tsx', 'default', {}, {
      '../../src/lib/budget': { currentMonth: () => '2030-01', addMonths: () => '2029-12', loadLoans: async () => ({}),
        loadBudget: async () => ({ id: 1, month: '2030-01', income: 1000 }), loadSavingsGoal: async () => ({ goal_amount: 100, salary: 1000 }),
        listExpenses: async () => [expense], removeExpense: async () => { deleted++; if (fail) throw new Error('write failed'); } },
      '../../src/lib/repaymentPlans': { listRepaymentPlans: async () => [], paidRepaymentIds: async () => new Set() },
    });
    await budget.settle();
    const row = budget.all('FlatList')[0].props.renderItem({ item: expense, index: 0 }).props.children;
    row.props.onRemove(1); budget.render();
    assert.equal(deleted, 0);
    assert.equal(budget.all('ConfirmDialog')[0].props.visible, true);
    budget.all('ConfirmDialog')[0].props.onClose(); budget.render();
    assert.equal(deleted, 0);
    row.props.onRemove(1); budget.render();
    await budget.all('ConfirmDialog')[0].props.onConfirm(); budget.render();
    assert.equal(budget.all('FlatList')[0].props.data.length, 1);
    assert.equal(budget.all('ConfirmDialog')[0].props.visible, true);
    fail = false;
    await budget.all('ConfirmDialog')[0].props.onConfirm(); budget.render();
    assert.equal(budget.all('FlatList')[0].props.data.length, 0);
    assert.equal(budget.all('ConfirmDialog')[0].props.visible, false);
    budget.dispose();
  });
  await verify('Task lists page results, retry failed paging, confirm completion, and reveal reminder targets outside the page', async () => {
    let pageFails = true;
    let completed = 0;
    const tasks = Array.from({ length: 45 }, (_, i) => ({ id: i + 1, title: `Task ${i}`, notes: '', completed_at: null, repeat: 'none' }));
    const target = { ...tasks[0], id: 999, title: 'Reminder outside the page' };
    const calls = [];
    let heldRead;
    const params = {};
    const screen = fixture(root, 'src/components/tasks/TasksScreen.tsx', 'TasksScreen', { view: 'all' }, {
      '../../lib/tasks': {
        async loadTasksPage(options) {
          calls.push(options);
          if (options.search === 'hold') return new Promise(resolve => { heldRead = resolve; });
          if (options.offset && pageFails) throw new Error('page failed');
          const rows = tasks.slice(options.offset ?? 0, (options.offset ?? 0) + 40);
          return { tasks: rows, hasMore: !options.offset, nextOffset: (options.offset ?? 0) + rows.length };
        },
        loadTask: async id => id === target.id ? target : undefined,
        completeTask: async () => { completed++; }, reopenTask: async () => {}, TaskUndoError: class extends Error {},
      },
    }, params);
    await screen.settle();
    const list = () => screen.all('FlatList').find(node => node.props.renderItem && !node.props.horizontal);
    assert.equal(list().props.data.length, 40);
    list().props.onEndReached(); await screen.settle();
    assert.equal(list().props.data.length, 40);
    assert.ok(screen.all('Button').some(node => node.props.label === 'retry'));
    pageFails = false;
    screen.all('Button').find(node => node.props.label === 'retry').props.onPress(); await screen.settle();
    assert.equal(list().props.data.length, 45);
    list().props.renderItem({ item: tasks[0] }).props.onToggle(tasks[0]); screen.render();
    assert.equal(completed, 0);
    const completion = () => screen.all('ConfirmDialog').find(node => node.props.title === 'tasksCompleteTitle');
    completion().props.onClose(); screen.render(); assert.equal(completed, 0);
    list().props.renderItem({ item: tasks[0] }).props.onToggle(tasks[0]); screen.render();
    await completion().props.onConfirm(); await screen.settle(); assert.equal(completed, 1);
    screen.all('TextInput')[0].props.onChangeText('hold'); screen.render(); screen.timers(); await screen.settle();
    assert.ok(heldRead);
    params.taskId = '999'; await screen.settle();
    assert.ok(screen.all('TaskCard').some(node => node.props.task.id === target.id));
    heldRead({ tasks: [], hasMore: false, nextOffset: 0 }); await screen.settle();
    assert.ok(screen.all('TaskCard').some(node => node.props.task.id === target.id), 'A concurrent page read cannot hide the reminder target');
    screen.all('IconButton').find(node => node.props.accessibilityLabel === 'tasksDismissReminder').props.onPress(); screen.render();
    assert.equal(screen.all('TaskCard').length, 0);
    assert.ok(calls.some(call => call.offset === 40));
    screen.dispose();
  });
  return results;
};
