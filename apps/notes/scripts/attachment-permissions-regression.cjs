// Exercise the real attachment handlers with disposable permission and picker APIs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

module.exports = async function checkAttachmentPermissions(root) {
  const file = path.join(root, 'src/components/NoteAttachments.tsx');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  function harness(current, requested = current, { failRequest = false, failSettings = false, disabled = false, readOnly = false, pickedUri = null } = {}) {
    const slots = []; let cursor = 0, tree;
    const calls = { checked: 0, requested: 0, camera: 0, recording: 0, settings: 0, library: 0, file: 0 };
    const errors = [];
    const deletions = [];
    const state = { attachments: [], valueRef: { current: [] }, actionRef: { current: null }, busyRef: { current: false },
      setBusy(value) { this.busyRef.current = value; }, onChange() { throw Error('No fixture should attach media'); } };
    // The component destructures setBusy, so use a stable closure like the real hook.
    state.setBusy = value => { state.busyRef.current = value; };
    const check = async () => { calls.checked++; return current; };
    const request = async () => { calls.requested++; if (failRequest) throw Error('Permission request failed'); return requested; };
    const hooks = {
      useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; }]; },
      useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
      useEffect() {}, useCallback: fn => fn, useImperativeHandle: (ref, make) => { ref.current = make(); },
    };
    const jsx = (type, props) => ({ type, props });
    const mocks = {
      'expo-file-system': { Paths: { cache: { uri: 'file:///cache/' } }, File: class {
        constructor(uri) { this.uri = uri; }
        delete() { deletions.push(this.uri); }
      } },
      '../lib/attachmentFiles': { async readAttachment() { throw Error('Attachment read failed'); } },
      react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx },
      'react-native': { View: 'View', Pressable: 'Pressable', Image: 'Image', Keyboard: { dismiss() {} },
        Linking: { openSettings: async () => { calls.settings++; if (failSettings) throw Error('Settings unavailable'); } } },
      'expo-audio': { RecordingPresets: { HIGH_QUALITY: {} }, getRecordingPermissionsAsync: check,
        requestRecordingPermissionsAsync: request, setAudioModeAsync: async () => {},
        useAudioRecorder: () => ({ uri: 'file:///cache/voice.m4a', stop: async () => {}, prepareToRecordAsync: async () => {}, record() { calls.recording++; } }) },
      'expo-image-picker': { getCameraPermissionsAsync: check, requestCameraPermissionsAsync: request,
        launchCameraAsync: async () => { calls.camera++; return { canceled: true }; },
        launchImageLibraryAsync: async () => { calls.library++; return { canceled: true }; } },
      'expo-document-picker': { getDocumentAsync: async () => { calls.file++; return pickedUri ? { canceled: false, assets: [{ name: 'example.pdf', uri: pickedUri }] } : { canceled: true }; } },
      'sonner-native': { toast: { error: message => errors.push(message) } },
      '../lib/theme': { useThemeColors: () => ({}) },
      './ui/FormDialog': { FormDialog: 'FormDialog' }, './ConfirmDialog': { ConfirmDialog: 'ConfirmDialog' },
    };
    const fallback = new Proxy({}, { get: (_target, key) => key });
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, Error, require: id => mocks[id] ?? fallback });
    const render = () => { cursor = 0; tree = module.exports.NoteAttachments({ state, disabled, readOnly }); };
    const dialog = () => tree.props.children.find(node => node?.type === 'ConfirmDialog').props;
    const errorText = () => tree.props.children.find(node => node?.props?.accessibilityRole === 'alert')?.props.children;
    render();
    const stopRecording = () => {
      const form = tree.props.children.find(node => node?.props?.title === 'Recording voice');
      form.props.children.find(node => node?.props?.label === 'Stop & attach').props.onPress();
    };
    return { state, calls, errors, deletions, stopRecording, render, dialog, errorText, add: kind => state.actionRef.current.add(kind) };
  }
  const granted = { granted: true, canAskAgain: true };
  const denied = { granted: false, canAskAgain: true };
  const blocked = { granted: false, canAskAgain: false };
  for (const kind of ['camera', 'audio']) {
    for (const current of [granted, denied]) {
      const h = harness(current, granted);
      assert.equal(h.calls.checked, 0, 'Rendering a note never requests or checks permissions');
      await h.add(kind);
      assert.equal(h.calls.checked, 1, 'Recheck current device permission on each use');
      assert.equal(h.calls.requested, current.granted ? 0 : 1, 'Only request missing, requestable access');
      assert.equal(h.calls[kind === 'camera' ? 'camera' : 'recording'], 1);
    }
    for (const result of [denied, blocked]) {
      const h = harness(denied, result);
      await h.add(kind); h.render();
      assert.equal(h.calls.camera + h.calls.recording, 0, 'Denied permission never starts capture');
      assert.equal(h.state.busyRef.current, false, 'Denial never locks the editor');
      assert.equal(h.calls.settings, 0, 'Denial never redirects automatically');
      assert.equal(h.dialog().visible, !result.canAskAgain, 'Blocked permissions offer app settings');
      if (result.canAskAgain) assert.equal(h.errors.length, 1, 'A requestable denial has a useful retry message');
    }
    const h = harness(blocked);
    await h.add(kind); h.render();
    assert.equal(h.calls.requested, 0, 'Do not repeat a permanently blocked native prompt');
    h.dialog().onClose(); h.render();
    assert.equal(h.dialog().visible, false); assert.equal(h.calls.settings, 0, 'Not now leaves access unchanged');
    await h.add(kind); h.render(); await h.dialog().onConfirm(); h.render();
    assert.equal(h.calls.settings, 1); assert.equal(h.dialog().visible, false);
    assert.equal(h.calls.camera + h.calls.recording, 0, 'Opening settings never assumes access was granted');
    const failed = harness(blocked, blocked, { failSettings: true });
    await failed.add(kind); failed.render(); await failed.dialog().onConfirm(); failed.render();
    assert.equal(failed.dialog().visible, true); assert.equal(failed.errors.length, 1, 'Settings failure leaves a retry available');
    const broken = harness(denied, denied, { failRequest: true });
    await broken.add(kind); broken.render();
    assert.equal(broken.state.busyRef.current, false); assert.equal(broken.errors.length, 1);
    assert.equal(broken.errorText(), 'Permission request failed', 'Details remain in the note after the toast dismisses');
    for (const guard of [{ disabled: true }, { readOnly: true }]) {
      const locked = harness(denied, granted, guard);
      await locked.add(kind); assert.equal(locked.calls.checked, 0, 'Read-only and disabled notes never prompt');
    }
  }
  for (const kind of ['image', 'file']) {
    const h = harness(blocked);
    await h.add(kind);
    assert.equal(h.calls.checked + h.calls.requested, 0, 'System file/photo pickers need no camera or microphone prompt');
    assert.equal(h.calls[kind === 'image' ? 'library' : 'file'], 1);
    assert.equal(h.state.busyRef.current, false);
  }
  for (const uri of ['file:///cache/example.pdf', 'file:///cache-other/example.pdf', 'content://provider/example']) {
    const h = harness(granted, granted, { pickedUri: uri });
    await h.add('file'); h.render();
    assert.equal(h.errorText(), 'Attachment read failed');
    assert.deepEqual(h.deletions, uri.startsWith('file:///cache/') ? [uri] : []);
  }
  const voice = harness(granted);
  await voice.add('audio'); voice.render(); voice.stopRecording();
  await new Promise(setImmediate); voice.render();
  assert.equal(voice.errorText(), 'Attachment read failed');
  assert.deepEqual(voice.deletions, ['file:///cache/voice.m4a']);
  console.log('Passed attachment permissions: contextual grants, denials, blocked prompts, settings recovery, cancellation, errors, and editor locks.');
};
