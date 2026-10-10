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
    memo: component => component,
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
    if (/\/ui\/Typography$/.test(name)) return { Text: 'Text', TextInput: 'TextInput' };
    if (/\/i18n$/.test(name)) return { useI18n: () => ({ t, lang: 'en' }), monthLabelShort: (_, value) => value, monthLabelFull: (_, value) => value };
    if (/\/theme$/.test(name)) return { useThemeColors: () => colors, useThemeVariables: () => ({}) };
    if (/\/useHaptics$/.test(name)) return { useHaptics: () => haptics };
    if (/\/utils$/.test(name)) return { cn: (...values) => values.filter(Boolean).join(' '), formatCurrency: value => `€${value}`, withAlpha: color => color };
    if (/\/taskDates$/.test(name)) return { taskDateKey: () => '2030-01-01', formatTaskDate: value => value, isTaskInput: value => Boolean(value.title.trim()) };
    if (/\/taskEvents$/.test(name)) return { notifyTaskChanges() {}, subscribeTaskChanges: () => () => {} };
    if (/\/taskReminders$/.test(name)) return { taskReminderDate: () => null, requestTaskReminderPermission: async () => 'granted' };
    if (/\/AppIcons$/.test(name)) return new Proxy({}, { get: (_, key) => key });
    if (/\/ui\/AnchoredMenu$/.test(name)) return { AnchoredMenu: 'AnchoredMenu', useAnchoredMenu: () => { const [anchor, setAnchor] = hooks.useState(null); return { triggerRef: hooks.useRef(null), anchor, open: () => setAnchor({ x: 0, y: 0, width: 100, height: 44 }), close: () => setAnchor(null) }; } };
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
    timerCount: () => timers.size,
    all: type => findAll(node => node.type === type || node.type?.name === type),
    async settle() { for (let i = 0; i < 12; i++) { render(); await Promise.resolve(); } },
    timers() { for (const [id, timer] of timers) if (timer.delay <= 1000) { timers.delete(id); timer.fn(); } },
    dispose() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

module.exports = async function verifyHubImprovements(root, parseNumberInput) {
  const results = [];
  const verify = async (name, fn) => { await fn(); results.push({ name, passed: true }); };
  await verify('Expense dialogs retain failed drafts, confirm discard and block overlapping saves', async () => {
    let closed = 0, saves = 0, rejectSave;
    const editor = fixture(root, 'src/components/ExpenseEditor.tsx', 'ExpenseEditor', {
      onClose: () => { closed++; }, onSave: () => { saves++; return new Promise((resolve, reject) => { rejectSave = reject; }); },
    }, { '../lib/numberInput': { parseNumberInput } });
    editor.render();
    assert.equal(editor.all('Button').find(node => node.props.label === 'save').props.disabled, true);
    editor.all('TextInput')[0].props.onChangeText('Rent');
    editor.all('TextInput')[1].props.onChangeText('1,200.50'); editor.render();
    editor.all('Checkbox')[0].props.onPress(); editor.render();
    editor.all('Button').find(node => node.props.label === 'save').props.onPress();
    editor.render();
    editor.all('Button').find(node => node.props.label === 'save').props.onPress();
    editor.all('FormDialog')[0].props.onClose(); editor.render();
    assert.equal(saves, 1); assert.equal(closed, 0);
    rejectSave(new Error('storage failure')); await editor.settle();
    assert.equal(editor.all('TextInput')[1].props.value, '1,200.50');
    assert.ok(editor.all('Text').some(node => node.props.accessibilityRole === 'alert'));
    editor.all('FormDialog')[0].props.onClose(); editor.render();
    assert.equal(editor.all('ConfirmDialog')[0].props.visible, true);
    editor.all('ConfirmDialog')[0].props.onClose(); editor.render(); assert.equal(closed, 0);
    editor.all('FormDialog')[0].props.onClose(); editor.render();
    editor.all('ConfirmDialog')[0].props.onConfirm(); assert.equal(closed, 1); editor.dispose();
  });
  await verify('Centered action dialogs close before acting and ignore disabled actions', async () => {
    const events = [];
    const dialog = fixture(root, 'src/components/ui/ActionDialog.tsx', 'ActionDialog', {
      visible: true, title: 'Options', onClose: () => events.push('close'),
      actions: [{ key: 'edit', label: 'Edit', onPress: () => events.push('edit') },
        { key: 'disabled', label: 'Blocked', disabled: true, onPress: () => events.push('blocked') }],
    });
    dialog.render(); dialog.all('Button')[1].props.onPress(); assert.equal(events.length, 0);
    dialog.all('Button')[0].props.onPress(); assert.equal(events.join(','), 'close,edit'); dialog.dispose();
  });
  await verify('Long year/select menus stay scrollable within compact-screen safe areas', async () => {
    const menu = fixture(root, 'src/components/ui/AnchoredMenu.tsx', 'AnchoredMenu', {
      anchor: { x: 10, y: 240, width: 200, height: 44 }, onClose() {},
      items: Array.from({ length: 20 }, (_, i) => ({ key: String(i), label: String(i), onPress() {} })),
    }, {
      'react-native': { Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View', useWindowDimensions: () => ({ width: 360, height: 300 }) },
      'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 16 }) },
    });
    menu.render();
    assert.equal(menu.all('ScrollView').length, 1);
    assert.ok(menu.all('ScrollView')[0].props.style.maxHeight <= 244);
    const position = menu.all('View').find(node => node.props.accessibilityViewIsModal).props.style;
    assert.ok(position.top >= 32); assert.ok(position.top + position.maxHeight <= 284);
    menu.dispose();
  });
  await verify('Archived notes keep pinned and unpinned entries together', async () => {
    const notes = fixture(root, 'src/components/NotesListScreen.tsx', 'default', { archived: true }, {
      '../lib/notes': { loadNotesPage: async () => ({ notes: [{ id: 1, is_pinned: true }, { id: 2, is_pinned: false }], nextOffset: 2, hasMore: false }) },
      '../lib/notesPreferences': { getNotesPreferences: async () => ({ viewMode: 'grid', sort: 'updated' }), setNotesPreferences: async () => {} },
    });
    await notes.settle();
    const sections = notes.all('FlatList')[0].props.data.filter(row => row.type === 'section');
    assert.equal(sections.length, 1); assert.equal(sections[0].labelKey, 'notesArchivedList'); notes.dispose();
  });
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
  await verify('Month dialogs remember defaults, validate drafts, confirm discard, and retain failed saves', async () => {
    let closed = 0, saves = 0;
    const editor = fixture(root, 'src/components/BudgetMonthEditor.tsx', 'BudgetMonthEditor', {
      initialMonth: '2030-02', onClose: () => { closed++; },
      onSave: async (month, income, goal) => { saves++; assert.equal(month, '2030-02'); assert.equal(income, 1200.5); assert.equal(goal, 200); throw new Error('failed'); },
    }, {
      '../lib/budget': { loadSavingsGoal: async () => ({ salary: 1000, goal_amount: 200 }), loadBudget: async () => null },
      '../lib/numberInput': { parseNumberInput },
      'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    });
    await editor.settle();
    assert.equal(editor.all('TextInput')[0].props.value, '1000');
    assert.equal(editor.all('TextInput')[1].props.value, '200');
    editor.all('TextInput')[0].props.onChangeText('12.3.4'); editor.render();
    assert.equal(editor.all('Button').find(node => node.props.label === 'save').props.disabled, true);
    editor.all('TextInput')[0].props.onChangeText('1,200.50'); editor.render();
    editor.all('IconButton')[0].props.onPress(); editor.render();
    assert.equal(editor.all('ConfirmDialog')[0].props.visible, true);
    editor.all('ConfirmDialog')[0].props.onClose(); editor.render();
    assert.equal(closed, 0);
    editor.all('Button').find(node => node.props.label === 'save').props.onPress();
    await editor.settle();
    assert.equal(saves, 1);
    assert.equal(editor.all('TextInput')[0].props.value, '1,200.50');
    assert.ok(editor.all('Text').some(node => node.props.children === 'saveFailed'));
    editor.all('IconButton')[0].props.onPress(); editor.render();
    editor.all('ConfirmDialog')[0].props.onConfirm();
    assert.equal(closed, 1);
    editor.dispose();
  });
  await verify('Month dialogs retry failed reads, prevent overwrites and block duplicate saves while busy', async () => {
    let fail = true, exists = true, saves = 0, closes = 0, release;
    const editor = fixture(root, 'src/components/BudgetMonthEditor.tsx', 'BudgetMonthEditor', {
      initialMonth: '2030-02', onClose: () => { closes++; }, onSave: async () => { saves++; await new Promise(resolve => { release = resolve; }); },
    }, {
      '../lib/budget': { loadSavingsGoal: async () => { if (fail) throw new Error('read failure'); return { salary: 1000, goal_amount: 200 }; }, loadBudget: async () => exists ? { id: 1 } : null },
      '../lib/numberInput': { parseNumberInput },
      'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    });
    await editor.settle();
    assert.equal(editor.all('Button').find(node => node.props.label === 'save').props.disabled, true);
    fail = false;
    editor.all('Button').find(node => node.props.label === 'retry').props.onPress(); await editor.settle();
    editor.all('Button').find(node => node.props.label === 'save').props.onPress(); await editor.settle();
    assert.equal(saves, 0);
    assert.ok(editor.all('Text').some(node => node.props.children === 'monthAlreadyExists'));
    exists = false;
    const save = editor.all('Button').find(node => node.props.label === 'save').props.onPress;
    save(); save(); await editor.settle();
    assert.equal(saves, 1);
    assert.equal(editor.all('Button').find(node => node.props.label === 'save').props.busy, true);
    editor.all('IconButton')[0].props.onPress();
    assert.equal(closes, 0);
    release(); await editor.settle();
    assert.equal(editor.all('Button').find(node => node.props.label === 'save').props.busy, false);
    editor.dispose();
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
  await verify('Task editor repeat selection and date clearing preserve drafts and save a consistent schedule', async () => {
    const saved = [];
    const editor = fixture(root, 'src/components/tasks/TaskEditor.tsx', 'TaskEditor', {
      onClose() {}, onSave: async input => saved.push(input),
    });
    editor.render();
    editor.all('TextInput').find(node => node.props.accessibilityLabel === 'tasksTitle').props.onChangeText('Keep my schedule');
    editor.all('TextInput').find(node => node.props.accessibilityLabel === 'tasksNotes').props.onChangeText('Keep my notes');
    editor.all('Button').find(node => node.props.label === 'tasksToday').props.onPress(); editor.render();
    editor.all('Pressable').find(node => node.props.accessibilityLabel === 'tasksRepeat').props.onPress(); editor.render();
    const menu = editor.all('AnchoredMenu')[0].props;
    assert.ok(menu.anchor);
    menu.items.find(item => item.key === 'weekly').onPress(); menu.onClose(); editor.render();
    assert.ok(editor.all('Text').some(node => node.props.children === 'tasksRepeatWeekly'));
    await editor.all('Switch')[0].props.onValueChange(true); await editor.settle();
    assert.equal(editor.all('Switch')[0].props.value, true);
    editor.all('Button').find(node => node.props.label === 'clear').props.onPress(); editor.render();
    assert.equal(editor.all('Switch')[0].props.value, false);
    assert.equal(editor.all('Switch')[0].props.disabled, true);
    editor.all('Button').find(node => node.props.label === 'save').props.onPress(); await editor.settle();
    assert.equal(saved.length, 1);
    assert.equal(saved[0].title, 'Keep my schedule'); assert.equal(saved[0].notes, 'Keep my notes');
    assert.equal(saved[0].due_date, null); assert.equal(saved[0].repeat, 'none'); assert.equal(saved[0].reminder_time, null);
    editor.dispose();
  });
  await verify('Notes editor navigation preserves Archive context and avoids a second navigation bar on list screens', async () => {
    const destinations = [];
    let segments = ['(notes)', 'checklist'];
    const Stack = Object.assign(() => {}, { Screen: 'StackScreen' });
    const layout = fixture(root, 'app/(notes)/_layout.tsx', 'default', {}, {
      'expo-router': { Stack, useSegments: () => segments, useGlobalSearchParams: () => ({ returnTab: 'archive' }), useRouter: () => ({ replace: path => destinations.push(path) }) },
      '../../src/hooks/useAppSwitching': { useAppSwitching: () => ({ handleAppSelect() {} }) },
      '../../src/hub/tabs': { NOTES_TABS: [{ id: 'index', labelKey: 'navNotes' }, { id: 'archive', labelKey: 'notesArchiveTitle' }, { id: 'settings', labelKey: 'navSettings' }] },
    });
    layout.render();
    const nav = layout.all('PillNav')[0].props;
    assert.equal(nav.activeTabId, 'archive');
    nav.onTabPress('settings');
    assert.equal(destinations[0], '/(notes)/settings');
    segments = ['(notes)', '(tabs)', 'index']; layout.render();
    assert.equal(layout.all('PillNav').length, 0);
    layout.dispose();
  });
  await verify('Savings hides balances on read failure and Retry restores loaded data', async () => {
    let fail = true;
    const savings = fixture(root, 'app/(budget)/savings.tsx', 'default', {}, {
      '../../src/lib/budget': { loadSavingsGoal: async () => ({ goal_amount: 100 }), loadBudget: async () => null, currentMonth: () => '2030-01' },
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
    let copied = 0;
    let fail = true;
    const expense = { id: 1, category: 'Rent', amount: 300, paid: false, is_recurring: false };
    const budget = fixture(root, 'app/(budget)/budget.tsx', 'default', {}, {
      '../../src/lib/budget': { currentMonth: () => '2030-01', addMonths: () => '2029-12', loadLoans: async () => ({}), computeMonthSummary: () => ({ remaining: 600, actualRemaining: 700 }),
        loadBudget: async () => ({ id: 1, month: '2030-01', income: 1000 }), loadSavingsGoal: async () => ({ goal_amount: 100, salary: 1000 }),
        copyBudgetFromMonth: async () => { copied++; return { budget: { id: 1, month: '2030-01', income: 1000, savings_goal: 100 }, expenses: [expense] }; },
        listExpenses: async () => [expense], removeExpense: async () => { deleted++; if (fail) throw new Error('write failed'); } },
      '../../src/lib/repaymentPlans': { listRepaymentPlans: async () => [], paidRepaymentIds: async () => new Set() },
    });
    await budget.settle();
    const copyButton = () => budget.all('Button').find(button => button.props.label === 'copyFromPreviousMonth');
    const copyDialog = () => budget.all('ConfirmDialog').find(dialog => dialog.props.title === 'copyFromPreviousMonth');
    copyButton().props.onPress(); budget.render();
    assert.equal(copied, 0); assert.equal(copyDialog().props.visible, true);
    copyDialog().props.onClose(); budget.render();
    assert.equal(copied, 0); assert.equal(copyDialog().props.visible, false);
    copyButton().props.onPress(); budget.render();
    await copyDialog().props.onConfirm(); budget.render();
    assert.equal(copied, 1); assert.equal(copyDialog().props.visible, false);
    const row = budget.all('FlatList')[0].props.renderItem({ item: expense, index: 0 }).props.children;
    row.props.onRemove(1); budget.render();
    assert.equal(deleted, 0);
    assert.equal(budget.all('ConfirmDialog').find(dialog => dialog.props.title === 'expenseDeleteTitle').props.visible, true);
    budget.all('ConfirmDialog').find(dialog => dialog.props.title === 'expenseDeleteTitle').props.onClose(); budget.render();
    assert.equal(deleted, 0);
    row.props.onRemove(1); budget.render();
    await budget.all('ConfirmDialog').find(dialog => dialog.props.title === 'expenseDeleteTitle').props.onConfirm(); budget.render();
    assert.equal(budget.all('FlatList')[0].props.data.length, 1);
    assert.equal(budget.all('ConfirmDialog').find(dialog => dialog.props.title === 'expenseDeleteTitle').props.visible, true);
    fail = false;
    await budget.all('ConfirmDialog').find(dialog => dialog.props.title === 'expenseDeleteTitle').props.onConfirm(); budget.render();
    assert.equal(budget.all('FlatList')[0].props.data.length, 0);
    assert.equal(budget.all('ConfirmDialog').find(dialog => dialog.props.title === 'expenseDeleteTitle').props.visible, false);
    budget.dispose();
  });
  await verify('Task lists page results, retry failed paging, confirm completion, and reveal reminder targets outside the page', async () => {
    let pageFails = true;
    let completed = 0;
    let deleted = 0;
    const tasks = Array.from({ length: 45 }, (_, i) => ({ id: i + 1, title: `Task ${i}`, notes: '', completed_at: null, repeat: 'none' }));
    const target = { ...tasks[0], id: 999, title: 'Reminder outside the page' };
    const calls = [];
    let heldRead;
    let holdNext = false;
    const params = {};
    let appStateListener;
    const appState = { currentState: 'active', addEventListener: (_event, listener) => {
      appStateListener = listener; return { remove() {} };
    } };
    const screen = fixture(root, 'src/components/tasks/TasksScreen.tsx', 'TasksScreen', {}, {
      'react-native': { AppState: appState, View: 'View', FlatList: 'FlatList', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator' },
      '../../lib/tasks': {
        loadTaskCounts: async () => ({ open: 45, total: 46 }),
        async loadTasksPage(options) {
          calls.push(options);
          if (holdNext) { holdNext = false; return new Promise(resolve => { heldRead = resolve; }); }
          if (options.offset && pageFails) throw new Error('page failed');
          const rows = tasks.slice(options.offset ?? 0, (options.offset ?? 0) + 40);
          return { tasks: rows, hasMore: !options.offset, nextOffset: (options.offset ?? 0) + rows.length };
        },
        loadTask: async id => id === target.id ? target : undefined,
        completeTask: async () => { completed++; }, reopenTask: async () => {}, deleteTask: async () => { deleted++; }, TaskUndoError: class extends Error {},
      },
    }, params);
    await screen.settle();
    const list = () => screen.all('FlatList').find(node => node.props.renderItem && !node.props.horizontal);
    assert.equal(list().props.data.length, 40);
    assert.equal(screen.all('FlatList').length, 1, 'Tasks has a single list and no status or priority strips');
    assert.equal(screen.all('TextInput').length, 0);
    assert.equal(calls[0].filter, 'active');
    assert.equal(screen.timerCount(), 1);
    appState.currentState = 'background'; appStateListener('background'); screen.render();
    assert.equal(screen.timerCount(), 0, 'The midnight timer stops in the background');
    const beforeBackground = calls.length;
    list().props.onEndReached(); await screen.settle();
    assert.equal(calls.length, beforeBackground, 'Hidden lists do not fetch more pages');
    appState.currentState = 'active'; appStateListener('active'); await screen.settle();
    assert.equal(calls.length, beforeBackground + 1, 'Returning to Tasks refreshes once');
    assert.equal(screen.timerCount(), 1);
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
    holdNext = true;
    const completing = completion().props.onConfirm(); await screen.settle(); assert.equal(completed, 1);
    assert.ok(heldRead);
    params.taskId = '999'; await screen.settle();
    assert.ok(screen.all('TaskCard').some(node => node.props.task.id === target.id));
    heldRead({ tasks: [], hasMore: false, nextOffset: 0 }); await completing; await screen.settle();
    assert.ok(screen.all('TaskCard').some(node => node.props.task.id === target.id), 'A concurrent page read cannot hide the reminder target');
    screen.all('IconButton').find(node => node.props.accessibilityLabel === 'tasksDismissReminder').props.onPress(); screen.render();
    assert.equal(screen.all('TaskCard').length, 0);
    assert.ok(calls.some(call => call.offset === 40));
    screen.all('Pressable').find(node => node.props.accessibilityLabel === 'tasksShowAll').props.onPress();
    await screen.settle();
    assert.equal(calls.at(-1).filter, 'all', 'Completed tasks remain available through All tasks');
    screen.all('Pressable').find(node => node.props.accessibilityLabel === 'tasksShowOpen').props.onPress();
    await screen.settle();
    assert.equal(calls.at(-1).filter, 'active');
    list().props.renderItem({ item: tasks[0], index: 0 }).props.onEdit(tasks[0]); screen.render();
    screen.all('TaskEditor')[0].props.onDelete(); screen.render();
    const deletionDialog = () => screen.all('ConfirmDialog').find(dialog => dialog.props.title === 'tasksDeleteTitle');
    assert.equal(deleted, 0); assert.equal(deletionDialog().props.visible, true);
    deletionDialog().props.onClose(); screen.render();
    assert.equal(screen.all('TaskEditor')[0].props.task.id, tasks[0].id);
    screen.all('TaskEditor')[0].props.onDelete(); screen.render();
    await deletionDialog().props.onConfirm(); await screen.settle();
    assert.equal(deleted, 1); assert.equal(screen.all('TaskEditor').length, 0);
    screen.dispose();
  });
  await verify('Notes waits for saved preferences and loads its first page only once', async () => {
    const calls = [];
    const screen = fixture(root, 'src/components/NotesListScreen.tsx', 'default', {}, {
      '../lib/notesPreferences': {
        getNotesPreferences: async () => ({ viewMode: 'list', sort: 'title' }),
        setNotesPreferences: async () => {},
      },
      '../lib/notes': { loadNotesPage: async (...args) => { calls.push(args); return { notes: [], hasMore: false, nextOffset: 0 }; } },
      './ui/AnchoredMenu': { AnchoredMenu: 'AnchoredMenu', useAnchoredMenu: () => ({ triggerRef: { current: null }, anchor: null, open() {}, close() {} }) },
    });
    await screen.settle();
    assert.equal(calls.length, 1, 'Do not query with default sort before loading saved preferences');
    assert.equal(calls[0][1], 'title');
    screen.all('TextInput')[0].props.onChangeText('search'); screen.render();
    assert.equal(screen.timerCount(), 1);
    screen.all('AnchoredMenu')[0].props.items.find(item => item.key === 'created').onPress();
    await screen.settle();
    const afterSort = calls.length;
    screen.timers(); await screen.settle();
    assert.equal(calls.length, afterSort, 'Changing sort cancels the pending search instead of fetching twice');
    screen.dispose();
  });
  await verify('Grouped backup export routes folder/share actions correctly and blocks overlapping exports', async () => {
    let folders = 0, shares = 0, finish;
    const screen = fixture(root, 'src/components/SettingsScreen.tsx', 'default', { activeAppId: 'budget', section: 'backup' }, {
      'react-native': new Proxy({ Platform: { OS: 'android' }, BackHandler: { addEventListener: () => ({ remove() {} }) } }, { get: (obj, key) => key in obj ? obj[key] : key }),
      '../lib/theme': { useTheme: () => ({ theme: 'light', setTheme() {} }), useThemeColors: () => ({}) },
      '../hooks/useHaptics': { useHaptics: () => ({ light: async () => {} }), isHapticsEnabled: () => true, getHapticsEnabled: async () => true },
      '../hub/ModulePreferences': { useModulePreferences: () => ({ enabledIds: ['budget'], saveEnabledIds: async () => {} }) },
      '../lib/backup': { hasSafetyBackup: async () => false, exportBackupToDirectory: () => { folders++; return new Promise(resolve => { finish = resolve; }); }, exportAndShareBackup: async () => { shares++; return 'shared'; } },
      '../lib/sampleData': { hasSampleData: async () => false },
    });
    await screen.settle();
    screen.all('Button').find(node => node.props.label === 'exportData').props.onPress(); screen.render();
    const menu = screen.all('ActionDialog')[0]; assert.equal(menu.props.visible, true);
    menu.props.actions.find(action => action.key === 'folder').onPress(); screen.render();
    menu.props.actions.find(action => action.key === 'share').onPress();
    assert.equal(folders, 1); assert.equal(shares, 0);
    assert.equal(screen.all('FormDialog')[0].props.busy, true);
    finish(null); await screen.settle();
    screen.all('ActionDialog')[0].props.actions.find(action => action.key === 'share').onPress(); await screen.settle();
    assert.equal(shares, 1); assert.equal(screen.all('FormDialog')[0].props.busy, false);
    assert.equal(screen.errors.length, 0); screen.dispose();
  });
  await verify('Vibration preview failure does not undo a saved Hub preference', async () => {
    let enabled = false;
    const screen = fixture(root, 'src/components/SettingsScreen.tsx', 'default', { activeAppId: 'budget' }, {
      'react-native': new Proxy({ Platform: { OS: 'android' }, BackHandler: { addEventListener: () => ({ remove() {} }) } }, { get: (obj, key) => key in obj ? obj[key] : key }),
      '../lib/theme': { useTheme: () => ({ theme: 'light', setTheme() {} }), useThemeColors: () => ({}) },
      '../hooks/useHaptics': { useHaptics: () => ({ light: async () => {} }),
        isHapticsEnabled: () => enabled, getHapticsEnabled: async () => enabled,
        setHapticsEnabled: async value => { enabled = value; } },
      'expo-haptics': { ImpactFeedbackStyle: { Light: 'Light' }, impactAsync: async () => { throw new Error('No motor'); } },
      '../hub/ModulePreferences': { useModulePreferences: () => ({ enabledIds: ['budget'], saveEnabledIds: async () => {} }) },
      '../lib/backup': { hasSafetyBackup: async () => false },
      '../lib/sampleData': { hasSampleData: async () => false },
      '../constants/config': { getAppVersion: () => '1.0.0' },
    });
    await screen.settle();
    await screen.all('SettingsMenu')[0].props.onHapticsChange(true); await screen.settle();
    assert.equal(enabled, true);
    assert.equal(screen.all('SettingsMenu')[0].props.hapticsOn, true);
    assert.deepEqual(screen.errors, []);
    screen.dispose();
  });
  await verify('Tutorial preview animations pause in the background without restarting on ordinary renders', async () => {
    for (const [name, expectedTimings, expectedCancels] of [['WelcomePreview', 3, 3], ['NavigationPreview', 2, 1]]) {
      const values = [];
      let valueCursor = 0, timings = 0, cancels = 0;
      const props = { active: true };
      const preview = fixture(root, `src/components/tutorial/${name}.tsx`, name, props, {
        'react-native-reanimated': {
          __esModule: true, default: { View: 'AnimatedView', Text: 'AnimatedText' },
          useSharedValue(initial) { const index = valueCursor++; return values[index] ??= { value: initial }; },
          useAnimatedStyle: fn => fn(), useReducedMotion: () => false,
          withTiming(value) { timings++; return value; }, withDelay: (_delay, value) => value,
          withRepeat: value => value, withSequence: (...items) => items.at(-1),
          cancelAnimation() { cancels++; }, Easing: { inOut: fn => fn, ease: value => value },
        },
        '../../hub/registry': { HUB_APPS: [{ id: 'budget' }, { id: 'notes' }] },
        '../../hub/tabs': { hubTabs: () => [{ id: 'home', labelKey: 'home' }] },
      });
      preview.render();
      assert.equal(timings, expectedTimings);
      valueCursor = 0; preview.render();
      assert.equal(timings, expectedTimings, 'Ordinary renders do not restart animation loops');
      props.active = false;
      valueCursor = 0; preview.render();
      assert.equal(cancels, expectedCancels);
      assert.equal(timings, expectedTimings, 'No new animation is scheduled while backgrounded');
      props.active = true;
      valueCursor = 0; preview.render();
      assert.equal(timings, expectedTimings * 2);
      preview.dispose();
    }
  });
  return results;
};
