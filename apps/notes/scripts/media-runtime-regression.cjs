const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

module.exports = async function checkMediaRuntime(root) {
  const disk = new Map(); let writes = 0;
  class File {
    constructor(...parts) { this.uri = parts.map(p => p.uri ?? p).join('/'); }
    get name() { return this.uri.split('/').at(-1); }
    get exists() { return disk.has(this.uri); }
    get size() { return disk.get(this.uri)?.length ?? 0; }
    write(data, options) { assert.equal(options.encoding, 'base64'); disk.set(this.uri, Buffer.from(data, 'base64')); writes++; }
    delete() { disk.delete(this.uri); }
    async base64() { return disk.get(this.uri).toString('base64'); }
  }
  const cache = { uri: 'cache', list: () => [...disk.keys()].filter(key => key.startsWith('cache/')).map(key => new File(key)) };
  const refs = []; const react = { useRef: value => { const ref = { current: value }; refs.push(ref); return ref; }, useState: value => [value, () => {}], useCallback: fn => fn };
  let failPreferences = false; let rawPreferences = null;
  const asyncStorage = { getItem: async () => rawPreferences, setItem: async (_key, value) => { if (failPreferences) throw Error('disk full'); rawPreferences = value; } };
  const loaded = new Map();
  function load(relative) {
    if (loaded.has(relative)) return loaded.get(relative);
    const exports = {}, module = { exports };
    const source = fs.readFileSync(path.join(root, 'src/lib', relative + '.ts'), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const requireMock = name => {
      if (name === 'react') return react;
      if (name === 'expo-file-system') return { File, Paths: { cache } };
      if (name === '@react-native-async-storage/async-storage') return { __esModule: true, default: asyncStorage };
      if (name.startsWith('./')) return load(name.slice(2));
      throw Error('Unexpected import: ' + name);
    };
    vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: relative })(requireMock, module, exports);
    loaded.set(relative, module.exports); return module.exports;
  }
  const files = load('attachmentFiles');
  const one = { id: 'same-id', name: 'Voice.m4a', mimeType: 'audio/mp4', kind: 'audio', base64: 'aGVsbG8=' };
  const two = { ...one, base64: 'd29ybGQ=' };
  const first = files.materializeAttachment(one);
  assert.equal(files.materializeAttachment(one), first);
  assert.equal(writes, 1, 'Playing/sharing an unchanged attachment does not rewrite it');
  const second = files.materializeAttachment(two);
  assert.notEqual(first.uri, second.uri, 'Matching IDs across imported notes cannot overwrite each other');
  assert.equal(disk.get(first.uri).toString(), 'hello');
  assert.equal(disk.get(second.uri).toString(), 'world');
  disk.set('cache/keep.jpg', Buffer.from('keep'));
  files.clearAttachmentCache();
  assert.ok(disk.has('cache/keep.jpg'));
  assert.ok(!first.exists && !second.exists);
  files.materializeAttachment(one);
  assert.equal(writes, 3, 'An evicted cache entry can be rehydrated');
  disk.set('input.pdf', Buffer.from('pdf'));
  const picked = await files.readAttachment('input.pdf', '../document.pdf', 'application/pdf');
  assert.equal(picked.base64, 'cGRm');
  const state = load('useNoteAttachments').useNoteAttachments();
  state.initialize([one, two]); assert.equal(state.hasChanges(), false);
  state.onChange([one]); assert.equal(state.hasChanges(), true);
  state.onChange([one, two]); assert.equal(state.hasChanges(), false, 'Undoing removal restores the baseline');
  state.onChange([two, one]); assert.equal(state.hasChanges(), true);
  state.initialize([one]); state.setBusy(true); assert.equal(state.hasChanges(), true);
  state.setBusy(false); assert.equal(state.hasChanges(), false);
  // Detect accidental serialization: a large media snapshot must remain opaque.
  const opaque = { ...one, toJSON() { throw Error('Media must not be serialized for a dirty check'); } };
  state.initialize([opaque]); assert.equal(state.hasChanges(), false);
  const preferences = load('notesPreferences');
  await preferences.setNotesPreferences({ viewMode: 'list', sort: 'title' });
  assert.deepEqual(await preferences.getNotesPreferences(), { viewMode: 'list', sort: 'title' });
  failPreferences = true;
  await assert.rejects(preferences.setNotesPreferences({ viewMode: 'grid', sort: 'updated' }));
  console.log('Passed media runtime: cache reuse/isolation/eviction, exact file reads, allocation-free dirty checks, undo and preference-write failures.');
};
