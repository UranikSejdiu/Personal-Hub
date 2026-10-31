const assert = require('node:assert/strict');

// Uses the audit harness's disposable SQLite database and real notes functions.
module.exports = async function checkNotesFilters(notes, db) {
  const checklistIds = [];
  for (let index = 0; index < 45; index++) {
    await notes.createNote({ title: `Filterproof text ${index}`, content: 'Searchable thought', is_pinned: index === 0 });
    const note = await notes.createChecklistNote({ title: `Filterproof checklist ${index}`, is_pinned: index === 1 }, [{ text: 'Remember milk', checked: false }]);
    checklistIds.push(note.id);
  }
  await notes.updateNote(checklistIds[0], { is_archived: true });

  async function collect(query, kind, archived = false) {
    const result = [];
    let offset = 0;
    for (let pageNumber = 0; pageNumber < 30; pageNumber++) {
      const page = await notes.loadNotesPage(query, 'title', offset, 7, archived, kind);
      assert.equal(page.nextOffset, offset + page.notes.length);
      assert.ok(page.notes.every(note => (!kind || note.kind === kind) && note.is_archived === archived));
      assert.ok(page.notes.every(note => note.kind !== 'checklist' || note.checklistPreview.total === 1));
      result.push(...page.notes);
      if (!page.hasMore) {
        assert.equal(new Set(result.map(note => note.id)).size, result.length, 'Paging must not duplicate notes');
        return result;
      }
      assert.equal(page.notes.length, 7, 'Filtering must happen before the page is sliced');
      offset = page.nextOffset;
    }
    throw new Error('Pagination failed to finish');
  }

  const all = await notes.loadNotes('title');
  for (const kind of ['text', 'checklist']) {
    const filtered = await collect('', kind);
    assert.deepEqual(filtered.map(note => note.id), all.filter(note => note.kind === kind).map(note => note.id));
    const searched = await collect('Filterproof', kind);
    assert.equal(searched.length, kind === 'text' ? 45 : 44);
    assert.equal(searched[0].is_pinned, true, 'Pinned notes remain first in each filtered result');
  }
  assert.equal((await collect('Filterproof', undefined)).length, 89, 'All notes includes both types');
  assert.deepEqual((await collect('Filterproof', 'checklist', true)).map(note => note.id), [checklistIds[0]]);
  assert.equal((await collect('no-such-search-token', 'text')).length, 0);

  const isFtsEnabled = db.isNotesFtsEnabled;
  try {
    db.isNotesFtsEnabled = () => false;
    assert.equal((await collect('Filterproof', 'checklist')).length, 44, 'LIKE fallback applies the same type filter');
    assert.equal((await collect('Filterproof', 'text')).length, 45);
  } finally {
    db.isNotesFtsEnabled = isFtsEnabled;
  }
  await assert.rejects(notes.loadNotesPage('', 'updated', -1));
  console.log('Passed Notes filters: all pages, text/checklists, pin order, archive isolation, FTS and LIKE search.');
};
