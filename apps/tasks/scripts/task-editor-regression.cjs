// Execute the real editor callbacks to catch UI regressions that SQL tests cannot.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

module.exports = async function verifyEditor(root, load) {
  let settingsOpened = 0;
  let settingsFailure = false;
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
      'react-native': { ...Object.fromEntries(['Modal', 'Pressable', 'ScrollView', 'Switch', 'View'].map(key => [key, key])),
        Linking: { openSettings: async () => { settingsOpened++; if (settingsFailure) throw Error('Settings unavailable'); } } },
      'react-native-keyboard-controller': { KeyboardAvoidingView: 'KeyboardAvoidingView' },
      'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
      '../ui/Typography': { Text: 'Text', TextInput: 'TextInput' },

      '../../lib/theme': { useThemeColors: () => ({}), useThemeVariables: () => ({}) },
      '../../lib/taskDates': dates,
      '../../lib/taskReminders': { taskReminderDate: reminders.taskReminderDate, requestTaskReminderPermission: permission },
      '../DatePicker': { DatePicker: 'DatePicker' },
      '../AppIcons': { X: 'X', ChevronDown: 'ChevronDown', CalendarDays: 'CalendarDays', List: 'List', Repeat: 'Repeat', Bell: 'Bell' },
      '../ui/Button': { Button: 'Button', IconButton: 'IconButton' },
      '../../lib/utils': { cn: (...values) => values.join(' ') },
      '../ConfirmDialog': { ConfirmDialog: 'ConfirmDialog' },
      '../ui/ActionDialog': { ActionDialog: 'ActionDialog' },
      './ReminderSetup': { ReminderSetup: 'ReminderSetup' },
      '../AppAlerts': { AppAlerts: 'AppAlerts' },
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
      picker: () => nodes(node => node.type === 'ActionDialog')[0].props,
      field: label => nodes(node => node.type === 'Pressable' && node.props.accessibilityLabel === label)[0].props,
      close: () => tree.props.children[0].props.onClose(),
      confirm: () => nodes(node => node.type === 'ConfirmDialog')[0].props,
      error: () => nodes(node => node.props.accessibilityRole === 'alert').map(node => node.props.children),
    };
  }
  const task = { id: 7, title: 'Existing', notes: 'Keep notes', list_id: 9, priority: 2, due_date: '2020-01-31', repeat: 'monthly', reminder_time: '08:30', completed_at: null };
  const saved = []; let closed = 0;
  const view = editor({ task, onSave: async (...args) => saved.push(args), onClose: () => closed++ });
  view.input('Task name').onChangeText('Renamed'); view.render();
  view.button('Save').onPress(); await new Promise(setImmediate); view.render();
  assert.equal(saved.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(saved[0])), [{ title: 'Renamed', notes: task.notes, due_date: task.due_date, repeat: 'monthly', reminder_time: '08:30' }, 7], 'Editing a legacy task keeps notes and repeat without exposing lists or priority');
  assert.equal(view.nodes(node => /priority/i.test(node.props.accessibilityLabel ?? '')).length, 0, 'Priority controls are removed from legacy task editing');
  assert.equal(view.nodes(node => node.props.accessibilityLabel === 'List').length, 0, 'Legacy task editing has no list chooser');
  view.close(); view.render();
  assert.equal(view.confirm().visible, true, 'Editing a task requires discard confirmation');
  assert.equal(closed, 0); view.confirm().onConfirm(); assert.equal(closed, 1);

  const fresh = editor({ initialDate: '2020-01-31', onSave: async input => saved.push(input), onClose() {} });
  fresh.input('Task name').onChangeText('New'); fresh.render();
  await fresh.nodes(node => node.type === 'Switch')[0].props.onValueChange(true);
  await new Promise(setImmediate); fresh.render(); fresh.button('Save').onPress(); fresh.render();
  assert.ok(fresh.error().includes('Choose a future date and time for the reminder.'), 'New reminders cannot silently save in the past');
  fresh.button('No date').onPress(); fresh.render(); fresh.button('Save').onPress(); await new Promise(setImmediate);
  assert.equal(saved.at(-1).due_date, null); assert.equal(saved.at(-1).reminder_time, null); assert.equal(saved.at(-1).repeat, 'none');

  // Date/repeat controls must save without list or priority inputs.
  const inputs=[];
  const managed=editor({initialDate:'2099-05-04',onSave:async input=>inputs.push(input),onClose(){}});
  managed.input('Task name').onChangeText('Managed task');managed.input('Notes (optional)').onChangeText('Keep these notes');managed.render();
  managed.field('Repeat').onPress();managed.render();managed.picker().actions.find(action=>action.key==='weekly').onPress();managed.render();
  managed.nodes(node=>node.type==='Switch')[0].props.onValueChange(true);await new Promise(setImmediate);managed.render();
  managed.input('Time (24-hour)').onChangeText('14:35');managed.render();managed.button('Save').onPress();await new Promise(setImmediate);managed.render();
  assert.deepEqual(JSON.parse(JSON.stringify(inputs.at(-1))),{title:'Managed task',notes:'Keep these notes',due_date:'2099-05-04',repeat:'weekly',reminder_time:'14:35'});
  managed.button('No date').onPress();managed.render();
  assert.equal(managed.nodes(node => node.props.accessibilityLabel === 'Repeat' || node.props.accessibilityLabel === 'Reminder').length, 0,
    'Undated tasks hide scheduling controls that need a date');
  managed.button('Save').onPress();await new Promise(setImmediate);managed.render();
  assert.equal(inputs.at(-1).repeat,'none');assert.equal(inputs.at(-1).reminder_time,null);assert.equal(Object.hasOwn(inputs.at(-1),'list_id'),false);assert.equal(Object.hasOwn(inputs.at(-1),'priority'),false);
  managed.button('Tomorrow').onPress();managed.render();
  assert.equal(managed.button('Tomorrow').accessibilityState.selected,true);assert.equal(managed.field('Repeat').disabled,false);
  assert.equal(managed.nodes(node => node.type === 'Switch')[0].props.value, false, 'Setting a new date does not restore a removed reminder');
  managed.button('Today').onPress();managed.render();managed.button('Save').onPress();await new Promise(setImmediate);
  assert.equal(inputs.at(-1).due_date,dates.taskDateKey(),'Today uses a local calendar date');

  let resolveSave, saves = 0;
  const gate = new Promise(resolve => { resolveSave = resolve; });
  const locked = editor({ task, onSave: async () => { saves++; await gate; }, onClose: () => closed++ });
  locked.button('Save').onPress(); locked.button('Save').onPress(); locked.close(); locked.render();
  assert.equal(saves, 1); assert.equal(closed, 1); assert.equal(locked.button('Cancel').disabled, true);
  resolveSave(); await new Promise(setImmediate);

  const denied = editor({ initialDate: '2099-01-01', onSave() {}, onClose() {} }, async () => 'denied');
  denied.nodes(node => node.type === 'Switch')[0].props.onValueChange(true); await new Promise(setImmediate); denied.render();
  assert.equal(denied.nodes(node => node.type === 'Switch')[0].props.value, false);
  assert.ok(denied.error().includes('Notifications are disabled. Enable them in your device settings to use reminders.'));
  denied.button('Open app settings').onPress(); await new Promise(setImmediate);
  assert.equal(settingsOpened, 1, 'Denied reminders provide a route to app settings');
  settingsFailure = true;
  denied.button('Open app settings').onPress(); await new Promise(setImmediate); denied.render();
  assert.ok(denied.error().includes('Couldn’t update reminder settings.'), 'Failure to open settings remains visible');
  assert.equal(denied.button('Open app settings').disabled, false, 'Settings can be retried after a failure');
  assert.equal(denied.nodes(node => node.type === 'Switch')[0].props.value, false, 'Opening settings never assumes permission was granted');
  console.log('Passed Tasks editor: list/priority removal, date shortcuts, repeat/reminder resets, notes and existing schedules, discard protection, denied permissions, and double-save locking.');
};
