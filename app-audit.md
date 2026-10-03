# Personal Hub — app bug audit

Audited on 2026-10-03 against `main` at `1b4a9a7` (version 1.23.7). This is a code and configuration review, not a device certification. TypeScript, lint, and public Expo configuration passed. Android/iOS device behavior remains unverified.

## High-priority app issues — addressed in the working tree

1. **Demo cleanup:** unchanged sample notes, checklist items, expenses, months, and plan snapshots are compared before deletion. Edited data and user auto deposits are kept. Legacy records use the same conservative comparison; if the bundled sample has changed, the row is kept.
2. **Expense save delay:** category and amount writes enter the serial write queue immediately, removing the 400 ms timer. A write still needs time to complete; immediate process termination during the write remains a device-level risk to verify.
3. **First rich-text edit:** focusing the editor before its native HTML baseline is captured marks the note as potentially dirty, so leaving prompts rather than silently discarding an early edit.
4. **Installer failures:** a failed installer launch shows a general failure state with retry and re-download. Install settings are an optional action, not opened automatically for every error.
5. **Backup cache:** exports are capped at three recent JSON files; imported picker copies are deleted after reading. The safety backup remains in document storage.

## Further checks before release — addressed in code

- Backup import now writes a cleared demo marker before replacing the database. An intentionally empty restored backup stays empty on next launch; the onboarding preview should still be checked on device for clear demo labeling.
- The Dhikr counter updates its tap reference synchronously with each optimistic increment and rolls it back on rejection. Rapid taps at the limit still need device confirmation.

## Optimization notes

These are profiling or architecture follow-ups rather than confirmed release bugs. No streaming or list refactor was made without large-data measurements.

- `src/lib/notes.ts:150-179` backfills legacy note search text one row at a time on the list path. Move large migrations to a bounded startup/background job or batch the writes, with progress and retry behavior.
- `src/lib/backup.ts:401-452` builds and stringifies the whole database backup in JS memory before writing it. Measure peak memory on a large dataset; stream or chunk if backups approach the 50 MB import cap.
- `src/lib/UpdateContext.tsx:56-92` checks GitHub at every app start. Defer update checks until the app is interactive and cache the result for a reasonable interval.
- `app/(notes)/(tabs)/index.tsx:229-259` rebuilds the complete pinned/unpinned grid from each loaded page. Measure list render time and memory with thousands of notes; optimize only if profiling shows a bottleneck.

## Fixes applied during this audit

- `app/(notes)/editor.tsx`: a synchronous save guard prevents two rapid presses from creating duplicate notes. Title/pin edits are compared with the original loaded fields even when the native HTML snapshot is late; an HTML read error now asks before discarding.
- `src/lib/notes.ts`: a failed search-text backfill releases its cached promise so a later list read can retry within the same app session.
- `app/(budget)/savings.tsx`: pasted amounts such as `12abc` or `Infinity` are rejected instead of silently becoming 12 or being stored as zero; a synchronous guard prevents rapid duplicate saves.

## Device acceptance checklist (for the app owner)

Use a signed release-like build on Android 16 and one older supported Android version. Check cold start, tutorial/module selection, dark/light mode, airplane mode, rapid Dhikr taps, note save/back/discard, budget edit then immediate force-stop, backup export/import/recovery, and upgrade from the current GitHub APK without losing SQLite data. No device tests were run in this audit.
