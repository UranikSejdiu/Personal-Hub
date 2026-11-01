const assert = require('node:assert/strict');

module.exports = async function checkAttachments(notes, db, backup) {
  const media = [
    { id: 'test-image', name: 'Photo.png', kind: 'image', mimeType: 'image/png', base64: 'aGVsbG8=' },
    { id: 'test-audio', name: 'Voice.m4a', kind: 'audio', mimeType: 'audio/mp4', base64: 'd29ybGQ=' },
    { id: 'test-file', name: 'Document.pdf', kind: 'file', mimeType: 'application/pdf', base64: 'cGRm' },
  ];
  const plain = value => JSON.parse(JSON.stringify(value));
  const text = await notes.createNote({ title: 'Media test', content: '', is_pinned: false, attachments: media });
  const checklist = await notes.createChecklistNote({ title: 'Media list', is_pinned: false, attachments: media }, [{ text: 'One', checked: false }]);
  for (const id of [text.id, checklist.id]) assert.deepEqual(plain((await notes.getNote(id)).attachments), media);
  const page = await notes.loadNotesPage('Media', 'updated', 0, 40);
  assert.ok(page.notes.filter(note => [text.id, checklist.id].includes(note.id)).every(note => note.attachmentCount === 3));
  assert.ok(page.notes.every(note => note.attachments.length === 0), 'List cards do not hydrate media payloads');
  const snapshot = JSON.stringify(await backup.buildBackupEnvelope());
  await notes.updateNote(text.id, { content: 'Text-only change' });
  assert.deepEqual(plain((await notes.getNote(text.id)).attachments), media, 'Text-only saves preserve media');
  assert.equal((await notes.getNote(text.id)).attachmentCount, 3);
  await assert.rejects(notes.saveChecklistNote(checklist.id, { title: 'Must roll back', is_pinned: true, attachments: [{ ...media[0], base64: 'bad!' }] }, []));
  assert.equal((await notes.getNote(checklist.id)).title, 'Media list', 'An invalid attachment rolls back the entire checklist save');
  assert.equal((await notes.getChecklistItems(checklist.id)).length, 1);
  await notes.updateNote(text.id, { attachments: [] });
  await notes.saveChecklistNote(checklist.id, { title: 'Media list', is_pinned: false, attachments: [] }, []);
  await backup.importBackup(snapshot);
  for (const id of [text.id, checklist.id]) assert.deepEqual(plain((await notes.getNote(id)).attachments), media, 'Backup restores exact media bytes');
  const tamperedCount = JSON.parse(snapshot);
  tamperedCount.tables.notes.find(note => note.id === text.id).attachment_count = 999;
  await backup.importBackup(JSON.stringify(tamperedCount));
  assert.equal((await notes.getNote(text.id)).attachmentCount, 3, 'Imported count fields are derived from actual media');
  await notes.updateNote(text.id, { is_archived: true });
  await assert.rejects(notes.updateNote(text.id, { attachments: [] }));
  assert.deepEqual(plain((await notes.getNote(text.id)).attachments), media, 'Archive freezes attachments');
  await notes.restoreNote(text.id);
  const malformed = JSON.parse(snapshot);
  malformed.tables.notes.find(note => note.id === text.id).attachments = JSON.stringify([{ ...media[0], base64: 'bad!' }]);
  await assert.rejects(backup.importBackup(JSON.stringify(malformed)));
  for (const attachments of [[...media, media[0]], [{ ...media[0], id: '../escape' }], [{ ...media[0], base64: 'a'.repeat(8 * 1024 * 1024) }]]) {
    await assert.rejects(notes.createNote({ title: 'Bad media', content: '', is_pinned: false, attachments }));
  }
  const overByOne = Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64');
  await assert.rejects(notes.createNote({ title: 'Bad media', content: '', is_pinned: false, attachments: [{ ...media[0], base64: overByOne }] }), 'The byte limit is exact, including padded base64');
  assert.equal((await db.query("SELECT id FROM notes WHERE title = 'Bad media'")).length, 0, 'Invalid media cannot create a partial note');
  await notes.deleteNote(text.id);
  assert.equal(await notes.getNote(text.id), undefined);
  console.log('Passed attachments: text/checklist saves, bounded list previews, exact binary backup/restore, archived protection, malformed/duplicate/oversize rejection and deletion.');
};
