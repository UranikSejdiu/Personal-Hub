// Exercise actual editor callbacks; native editor/UI behavior is mocked.
const assert = require('node:assert/strict');
const { fixture } = require('./checklist-editor-regression.cjs');

async function ready(root, options) {
  const editor = fixture(root, options);
  editor.render();
  await Promise.resolve();
  await Promise.resolve();
  editor.render();
  return editor;
}

module.exports = async function verifyNotesEditors(root) {
  for (const screen of ['editor', 'checklist']) {
    for (const archived of [false, true]) {
      const editor = await ready(root, { screen, archived });
      editor.title().onChangeText('Edited title');
      editor.actions().onTogglePin();
      if (archived) {
        assert.equal(editor.title().editable, false);
        assert.equal(editor.save(), undefined, 'Archived notes have no save action');
        assert.equal(editor.control('notesAddItem'), undefined);
        assert.equal(editor.control('notesBold'), undefined);
        if (screen === 'editor') {
          assert.equal(editor.richEditor(), undefined, 'Archives use a read-only rich-text renderer');
          assert.equal(editor.richText().children, '<p>Loaded</p>');
          assert.equal(editor.richText().selectable, true);
        } else {
          const list = editor.list();
          const row = list.renderItem({ item: list.data[0], isActive: false, drag() {} }).props.children.props;
          assert.equal(row.readOnly, true);
          assert.equal(row.disabled, true);
          row.onToggle(row.item.key);
          row.onChangeText(row.item.key, 'Changed');
          row.onRemove(row.item.key);
          list.onDragBegin();
          list.onDragEnd({ data: [...list.data].reverse() });
        }
        editor.render();
        assert.equal(editor.title().value, 'Shopping');
        assert.equal(editor.actions().isPinned, false);
        if (screen === 'checklist') assert.deepEqual(editor.list().data.map(item => item.text), ['first', 'second']);
      }
      const finish = editor.deferSave();
      const move = editor.actions().onToggleArchive();
      await Promise.resolve();
      await Promise.resolve();
      if (editor.save()) await editor.save().onPress();
      if (archived) await editor.actions().onToggleArchive();
      editor.actions().onDelete();
      assert.equal(editor.confirm().visible, false, 'Delete cannot start during a move');
      let prevented = false;
      editor.remove({ preventDefault() { prevented = true; }, data: { action: { type: 'GO_BACK' } } });
      assert.equal(prevented, true);
      assert.equal(editor.backs, 0, 'Navigation waits for the archive write');
      editor.render();
      assert.equal(editor.actions().disabled, true);
      assert.equal(editor.title().editable, false);
      if (archived) {
        assert.deepEqual(editor.saved, [], 'Restoration never rewrites content or checklist items');
        assert.deepEqual(editor.restored, [1], 'Restore runs once');
      } else {
        assert.equal(editor.saved.length, 1);
        assert.equal(editor.saved[0].fields.is_archived, true);
        assert.equal(editor.saved[0].fields.title, 'Edited title');
        assert.equal(editor.saved[0].fields.is_pinned, true, 'Capture edits before React re-renders');
        if (screen === 'editor') assert.equal(editor.saved[0].fields.content, '<p>Current draft</p>');
        else assert.equal(editor.saved[0].items.length, 3);
      }
      finish();
      await move;
      assert.equal(editor.backs, 1);
      assert.deepEqual(editor.successes, [archived ? 'notesUnarchived' : 'notesArchived']);
      assert.deepEqual(editor.errors, []);
    }

    for (const archived of [false, true]) {
      const failed = await ready(root, { screen, archived });
      const fail = failed.deferSave();
      const move = failed.actions().onToggleArchive();
      await Promise.resolve();
      await Promise.resolve();
      fail(new Error('Injected move failure'));
      await move;
      failed.render();
      assert.equal(failed.backs, 0);
      assert.equal(failed.actions().disabled, false, 'Failed moves allow retry');
      assert.deepEqual(failed.errors, [archived ? 'notesRestoreFailed' : 'notesArchiveFailed']);
      assert.deepEqual(failed.successes, []);
      if (archived) {
        assert.equal(failed.title().editable, false);
        assert.deepEqual(failed.saved, []);
      }
    }

    const deleting = await ready(root, { screen });
    deleting.actions().onDelete();
    deleting.render();
    const finish = deleting.deferSave();
    const remove = deleting.confirm().onConfirm();
    const duplicate = deleting.confirm().onConfirm();
    await deleting.save().onPress();
    await deleting.actions().onToggleArchive();
    deleting.remove({ preventDefault() {}, data: { action: { type: 'GO_BACK' } } });
    assert.deepEqual(deleting.deleted, [1], 'Only one delete starts');
    assert.deepEqual(deleting.saved, [], 'Save/archive cannot overlap deletion');
    assert.equal(deleting.backs, 0);
    finish(new Error('Injected deletion failure'));
    await Promise.all([remove, duplicate]);
    deleting.render();
    assert.equal(deleting.backs, 0);
    assert.equal(deleting.actions().disabled, false);
    assert.deepEqual(deleting.errors, ['deleteFailed']);
  }

  const stale = fixture(root, { screen: 'editor', kind: 'checklist' });
  stale.render();
  await Promise.resolve();
  assert.equal(stale.redirects[0].pathname, '/(notes)/checklist');
  assert.deepEqual(stale.saved, []);

  const checkingBack = await ready(root, { screen: 'editor' });
  checkingBack.richEditor().onChangeHtml({ nativeEvent: { value: '<p>Loaded</p>' } });
  const finishHtml = checkingBack.deferHtml();
  checkingBack.remove({ preventDefault() {}, data: { action: { type: 'GO_BACK' } } });
  const finishSave = checkingBack.deferSave();
  const save = checkingBack.save().onPress();
  finishHtml();
  await Promise.resolve();
  await Promise.resolve();
  checkingBack.render();
  assert.equal(checkingBack.backs, 0, 'A pending unsaved-change check cannot bypass an in-flight save');
  assert.equal(checkingBack.confirm().visible, false, 'Do not offer discard during persistence');
  finishSave();
  await save;
  assert.equal(checkingBack.backs, 1);
};
