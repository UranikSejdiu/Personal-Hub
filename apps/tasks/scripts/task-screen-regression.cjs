// Exercise screen lifecycle and async races with the real component, without a phone.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const flush = () => new Promise(setImmediate);

module.exports = async function verifyScreen(root, load) {
  const slots = [], timers = new Map(), requests = [];
  let cursor = 0, effects, tree, params = {}, appListener, changeListener, mode = 'calendar';
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useMemo(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) { const old = slots[i]; slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  const router = { setParams: values => { params = { ...params, ...values }; }, navigate() {} };
  let activeRouter = router;
  const t = key => key;
  const app = { currentState: 'active', addEventListener: (_name, callback) => { appListener = callback; return { remove: () => { appListener = null; } }; } };
  const task = id => ({ id, title: `Task ${id}`, notes: '', list_id: null, due_date: '2026-10-31', repeat: 'none', reminder_time: null, completed_at: null, priority: 0 });
  const counts = { today: 2, upcoming: 0, overdue: 0, completed: 0, open: 2 };
  const mocks = {
    react: hooks, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { ActivityIndicator: 'ActivityIndicator', AppState: app, FlatList: 'FlatList', Pressable: 'Pressable', View: 'View' },
    'expo-router': { useFocusEffect: fn => hooks.useEffect(fn, [fn]), useLocalSearchParams: () => params, useRouter: () => activeRouter },
    'sonner-native': { toast: { success() {}, error() {} } },
    '../ui/Typography': { Text: 'Text', TextInput: 'TextInput' }, '../ui/Button': { Button: 'Button', IconButton: 'IconButton' },
    '../ui/FormDialog': { FormDialog: 'FormDialog' }, '../ui/ActionDialog': { ActionDialog: 'ActionDialog' }, '../ConfirmDialog': { ConfirmDialog: 'ConfirmDialog' },
    '../AppIcons': { List: 'List', Search: 'Search', X: 'X' }, '../../lib/i18n': { useI18n: () => ({ t }) },
    '../../lib/taskCalendar': load(path.join(root, 'src/lib/taskCalendar.ts')), '../../lib/taskDates': load(path.join(root, 'src/lib/taskDates.ts')),
    '../../lib/taskEvents': { subscribeTaskChanges: callback => { changeListener = callback; return () => { changeListener = null; }; } },
    '../../lib/tasks': {
      loadTasksPage: options => new Promise(resolve => requests.push({ options, resolve })), loadTaskOverview: async () => counts,
      loadTaskDayCounts: async () => ({}), loadTask: async id => task(id),
      completeTask() {}, deleteTask() {}, reopenTask() {}, saveTask() {}, TaskUndoError: class extends Error {},
    },
    './TaskCard': { TaskCard: 'TaskCard' }, './TaskEditor': { TaskEditor: 'TaskEditor' }, './design': { useTaskDesign: () => ({}) },
    './TaskDashboard': Object.fromEntries(['AgendaHeading', 'TaskAddButton', 'TaskCalendar', 'TaskHeading', 'TaskSummaryTiles'].map(key => [key, key])),
  };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/components/tasks/TasksScreen.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  let timerId = 0;
  vm.runInNewContext(code, { module, exports: module.exports, Date, setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id), require: key => { assert.ok(key in mocks, key); return mocks[key]; } });
  const render = () => { cursor = 0; effects = []; tree = module.exports.TasksScreen({ mode }); effects.forEach(fn => fn()); };
  const nodes = type => {
    const found = [];
    function visit(node) { if (Array.isArray(node)) return node.forEach(visit); if (!node?.props) return; if (node.type === type) found.push(node); for (const key of ['children', 'ListHeaderComponent', 'ListFooterComponent', 'ListEmptyComponent']) visit(node.props[key]); }
    visit(tree); return found;
  };
  render(); await flush(); render();
  assert.equal(requests.length, 1);
  nodes('TaskCalendar')[0].props.onSelect('2026-11-05'); render(); await flush();
  assert.equal(requests.length, 2); assert.equal(requests[1].options.date, '2026-11-05');
  requests[1].resolve({ tasks: [task(2)], nextOffset: 1, hasMore: true }); await flush(); render();
  requests[0].resolve({ tasks: [task(1)], nextOffset: 1, hasMore: true }); await flush(); render();
  assert.equal(nodes('FlatList')[0].props.data[0].id, 2, 'An old calendar response cannot overwrite the selected day');
  nodes('AgendaHeading')[0].props.onAdd(); render();
  assert.equal(nodes('TaskEditor')[0].props.initialDate, '2026-11-05', 'Calendar add uses the selected date');
  nodes('TaskEditor')[0].props.onClose(); render();
  app.currentState = 'background'; appListener('background');
  nodes('FlatList')[0].props.onEndReached(); changeListener(); await flush();
  assert.equal(requests.length, 2, 'Background screens do not query or page');
  app.currentState = 'active'; appListener('active'); await flush();
  assert.equal(requests.length, 3, 'Resuming refreshes from persisted data');
  requests[2].resolve({ tasks: [task(3)], nextOffset: 1, hasMore: false }); await flush(); render();
  params = { taskId: '99' }; render(); await flush(); render();
  assert.equal(nodes('TaskCard')[0].props.task.id, 99, 'A reminder opens its exact task outside the current date');
  assert.equal(params.taskId, undefined);
  mode = 'overview'; params = { listId: '81', filter: 'active' }; render(); await flush();
  assert.equal(Object.hasOwn(requests.at(-1).options, 'listId'), false, 'Legacy list links cannot hide tasks in the combined view');
  requests.at(-1).resolve({ tasks: [task(4), { ...task(5), list_id: 81 }], nextOffset: 2, hasMore: false }); await flush(); render();
  assert.equal(nodes('FlatList')[0].props.data.length, 2, 'Former list tasks and unassigned tasks display together');
  assert.equal(nodes('TaskListChips').length, 0); assert.equal(nodes('TaskListTile').length, 0);
  nodes('TaskAddButton')[0].props.onPress(); render();
  assert.equal(nodes('TaskEditor')[0].props.initialDate, load(path.join(root, 'src/lib/taskDates.ts')).taskDateKey(), 'The in-screen Add button creates a task for today');
  nodes('TaskEditor')[0].props.onClose(); render();
  params = { compose: 'navigation-test' }; render(); render();
  assert.equal(nodes('TaskEditor').length, 1);
  activeRouter = { ...router }; render(); render();
  assert.equal(nodes('TaskEditor').length, 1, 'A router update after navigation cannot close the new-task form');
  nodes('TaskEditor')[0].props.onClose(); render();
  params = { compose: 'navigation-test' }; render(); render();
  assert.equal(nodes('TaskEditor').length, 0, 'Revisiting an old route cannot reopen a consumed Add command');
  params = { compose: 'next-command' }; render(); render();
  assert.equal(nodes('TaskEditor').length, 1, 'A new Add command still opens the task form');
  nodes('TaskEditor')[0].props.onClose(); render();
  slots.forEach(slot => slot?.cleanup?.());
  assert.equal(appListener, null); assert.equal(changeListener, null); assert.equal(timers.size, 0);
  console.log('Passed Tasks screens: stale query protection, selected-date compose, background suspension, resume refresh, reminder deep links, combined task view, legacy list links, and cleanup.');
};
