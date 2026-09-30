"""Manual Windows host reproduction of Expo's FTS connection-close sweep.

Run: python scripts/sqlite-fts-close-repro.py
Uses only in-memory SQLite; native crashes are contained in child processes.
This exercises the cleanup algorithm, not Android/iOS module integration.
"""

import ctypes
import pathlib
import sqlite3
import subprocess
import sys

if len(sys.argv) == 1:
    print('Host SQLite:', sqlite3.sqlite_version)
    results = {}
    for mode in ('sweep', 'safe'):
        result = subprocess.run([sys.executable, __file__, mode], capture_output=True, text=True)
        results[mode] = result.returncode
        print(mode, 'exit:', result.returncode)
        print(result.stdout)
        print(result.stderr)
    sys.exit(0 if results['sweep'] != 0 and results['safe'] == 0 else 1)

sqlite = ctypes.CDLL(str(pathlib.Path(sys.base_prefix) / 'DLLs' / 'sqlite3.dll'))
pointer = ctypes.c_void_p
sqlite.sqlite3_open.argtypes = [ctypes.c_char_p, ctypes.POINTER(pointer)]
sqlite.sqlite3_exec.argtypes = [pointer, ctypes.c_char_p, pointer, pointer, ctypes.POINTER(pointer)]
sqlite.sqlite3_next_stmt.argtypes = [pointer, pointer]
sqlite.sqlite3_next_stmt.restype = pointer
sqlite.sqlite3_finalize.argtypes = [pointer]
sqlite.sqlite3_close.argtypes = [pointer]
db = pointer()
assert sqlite.sqlite3_open(b':memory:', ctypes.byref(db)) == 0
sql = b'''
CREATE TABLE notes(id INTEGER PRIMARY KEY, title TEXT, plain_text TEXT);
CREATE VIRTUAL TABLE notes_fts USING fts5(title, plain_text, content='notes', content_rowid='id');
CREATE TRIGGER notes_fts_ai AFTER INSERT ON notes BEGIN
INSERT INTO notes_fts(rowid, title, plain_text) VALUES(new.id, new.title, new.plain_text); END;
CREATE TRIGGER notes_fts_au AFTER UPDATE ON notes BEGIN
INSERT INTO notes_fts(notes_fts, rowid, title, plain_text) VALUES('delete', old.id, old.title, old.plain_text);
INSERT INTO notes_fts(rowid, title, plain_text) VALUES(new.id, new.title, new.plain_text); END;
INSERT INTO notes VALUES(1, 'Checklist', 'first second');
BEGIN;
UPDATE notes SET plain_text='second first' WHERE id=1;
COMMIT;
'''
assert sqlite.sqlite3_exec(db, sql, None, None, None) == 0
print('Checklist update and COMMIT succeeded', flush=True)
if sys.argv[1] == 'sweep':
    statement = sqlite.sqlite3_next_stmt(db, None)
    count = 0
    while statement:
        next_statement = sqlite.sqlite3_next_stmt(db, statement)
        sqlite.sqlite3_finalize(statement)
        statement = next_statement
        count += 1
    print('Finalized', count, 'FTS internal statements using Expo close algorithm', flush=True)
print('Closing connection', flush=True)
assert sqlite.sqlite3_close(db) == 0
print('Closed successfully', flush=True)
