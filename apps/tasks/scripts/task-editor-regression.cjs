// Execute the real editor callbacks to catch UI regressions that SQL tests cannot.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

module.exports = async function verifyEditor(root, load) {
  const dates = load(path.join(root, 'src/lib/taskDates.ts'));
  const reminders = load(path.join(root, 'src/lib/taskReminders.ts'));
  function editor(props, permission = async () => 'granted') {
    const slots = []; let cursor = 0, tree;
    const hooks = {
      useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
      useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
      useEffect() {},
    };
    const mocks = {
      react: hooks, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
      'react-native': Object.fromEntries(['Modal', 'Pressable', 'ScrollView', 'Switch', 'View'].map(key => [key, key])),
      'react-native-keyboard-controller': { KeyboardAvoidingView: 'KeyboardAvoidingView' },
      'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
      '../ui/Typography': { Text: 'Text', TextInput: 'TextInput' },
      '../../lib/i18n': { useI18n: () => ({ t: key => key }) },
      '../../lib/theme': { useThemeColors: () => ({}), useThemeVariables: () => ({}) },
      '../../lib/taskDates': dates,
      '../../lib/taskReminders': { taskReminderDate: reminders.taskReminderDate, requestTaskReminderPermission: permission },
      '../DatePicker': { DatePicker: 'DatePicker' },
      '../AppIcons': { X: 'X', ChevronDown: 'ChevronDown', CalendarDays: 'CalendarDays' },
      '../ui/Button': { Button: 'Button', IconButton: 'IconButton' },
      '../../lib/utils': { cn: (...values) => values.join(' ') },
      '../ConfirmDialog': { ConfirmDialog: 'ConfirmDialog' },
      '../ui/AnchoredMenu': { AnchoredMenu: 'AnchoredMenu', useAnchoredMenu: () => ({ triggerRef: {}, anchor: null, open() {}, close() {} }) },
      './ReminderSetup': { ReminderSetup: 'ReminderSetup' },
    };
    const module = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/components/tasks/TaskEditor.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, Date, require: key => { assert.ok(key in mocks, key); return mocks[key]; } });
    const nodes = (predicate) => {
      const found = [];
      function visit(node) { if (Array.isArray(node)) return node.forEach(visit); if (!node?.props) return; if (predicate(node)) found.push(node); visit(node.props.children); }
      visit(tree); return found;
    };
    const render = () => { cursor = 0; tree = module.exports.TaskEditor(props); };
    render();
    return {
      render, nodes,
      button: label => nodes(node => node.type === 'Button' && node.props.label === label)[0].props,
      input: label => nodes(node => node.type === 'TextInput' && node.props.accessibilityLabel === label)[0].props,
      close: () => tree.props.children[0].props.onClose(),
      confirm: () => nodes(node => node.type === 'ConfirmDialog')[0].props,
      error: () => nodes(node => node.props.accessibilityRole === 'alert').map(node => node.props.children),
    };
  }
  const task = { id: 7, title: 'Existing', notes: 'Keep notes', list_id: null, priority: 2, due_date: '2020-01-31', repeat: 'monthly', reminder_time: '08:30', completed_at: null };
  const saved = []; let closed = 0;
  const view = editor({ task, initialListId: 9, lists: [{ id: 9, name: 'Work' }], onSave: async (...args) => saved.push(args), onClose: () => closed++ });
  view.input('tasksTitle').onChangeText('Renamed'); view.render();
  view.button('save').onPress(); await new Promise(setImmediate); view.render();
  assert.equal(saved.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(saved[0])), [{ title: 'Renamed', notes: task.notes, list_id: null, priority: 2, due_date: task.due_date, repeat: 'monthly', reminder_time: '08:30' }, 7], 'Editing an elapsed reminder keeps Inbox, notes, priority and repeat');
  view.button('Work').onPress(); view.render(); view.close(); view.render();
  assert.equal(view.confirm().visible, true, 'Moving a task requires discard confirmation');
  assert.equal(closed, 0); view.confirm().onConfirm(); assert.equal(closed, 1);

  const fresh = editor({ initialDate: '2020-01-31', onSave: async input => saved.push(input), onClose() {} });
  fresh.input('tasksTitle').onChangeText('New'); fresh.render();
  await fresh.nodes(node => node.type === 'Switch')[0].props.onValueChange(true);
  await new Promise(setImmediate); fresh.render(); fresh.button('save').onPress(); fresh.render();
  assert.ok(fresh.error().includes('tasksReminderPast'), 'New reminders cannot silently save in the past');
  fresh.button('clear').onPress(); fresh.render(); fresh.button('save').onPress(); await new Promise(setImmediate);
  assert.equal(saved.at(-1).due_date, null); assert.equal(saved.at(-1).reminder_time, null); assert.equal(saved.at(-1).repeat, 'none');

  let resolveSave, saves = 0;
  const gate = new Promise(resolve => { resolveSave = resolve; });
  const locked = editor({ task, onSave: async () => { saves++; await gate; }, onClose: () => closed++ });
  locked.button('save').onPress(); locked.button('save').onPress(); locked.close(); locked.render();
  assert.equal(saves, 1); assert.equal(closed, 1); assert.equal(locked.button('cancel').disabled, true);
  resolveSave(); await new Promise(setImmediate);

  const denied = editor({ initialDate: '2099-01-01', onSave() {}, onClose() {} }, async () => 'denied');
  denied.nodes(node => node.type === 'Switch')[0].props.onValueChange(true); await new Promise(setImmediate); denied.render();
  assert.equal(denied.nodes(node => node.type === 'Switch')[0].props.value, false);
  assert.ok(denied.error().includes('tasksReminderDenied'));
  console.log('Passed Tasks editor: existing schedules, Inbox preservation, discard protection, past reminders, denied permissions, and double-save locking.');
};
