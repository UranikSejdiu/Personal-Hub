# My Notes

Display name: My Notes. Editable vector branding and launcher, adaptive, themed,
and splash PNGs live in `assets/branding`. Regenerate with `npm run branding:export`.
The existing `com.uranik.notes` package, database, backup format, deep links,
`notes-v` release tags and `Notes-<version>.apk` updater filenames stay compatible.

Independent Expo app. Android package: `com.uranik.notes`.
Database: `notes_data`. Deep link scheme: `uraniknotes`.
No Hub runtime imports or workspace dependencies. Use Node 24.

## Notes interface

The phone library uses rounded cards, a search field, All notes / Notes /
Checklists filters, and a floating create button. Notes and Archive remain in
the bottom navigation. The view button beside the gear controls grid/list
layout and sorting. Settings includes theme, backup import/export, recovery,
updates, and the developer's GitHub link.
Settings returns to the originating library view with the back arrow.

Text notes and checklists open in full-screen editors. Save remains explicit;
leaving with unsaved changes still prompts before discarding. Archived notes
remain read-only until restored. The light and dark themes use neutral colors.
The bottom attachment menu supports images, camera photos, voice recordings,
and files. Formatting tools show their selected state and provide light haptic
feedback where supported.

## Develop and verify

```sh
npm ci
npm run validate
npm run bundle:check
npm start
```

## Transfer existing records

Keep Personal Hub installed. Save its JSON backup to a folder. In this app,
choose Settings → Import backup, select that file, review counts,
and confirm. The same Hub file can be used for all three standalone apps.
Only this app's tables are copied, preserving IDs, timestamps, ordering, and
relationships. Import replaces current records after saving a recovery copy;
it does not merge later edits or sync with Hub.

Check all records and use Save to folder to export a new backup before
uninstalling Hub. Hub is retired and is not needed after transfer. Android does not automatically move private data between
packages. Restore previous data returns to the pre-import snapshot.

Exports use `uranik-notes.backup` version 2 and include this app's records and
attachments. Standalone backup versions 1 and 2 are accepted. Other standalone
apps' backups are rejected. Applicable Hub backup
versions 1–7 are accepted. Tasks requires task tables, normally version 5+.
Standalone exports include theme and applicable Notes display preferences.
Legacy vibration preferences are ignored; editor tools provide their own light
feedback.
Older backups leave missing preferences unchanged. Preference write failures
are reported separately from a committed record import. Permission grants
must be configured separately for the new package. The standalone Tasks app
retains native exact-alarm support; test reminders on a sleeping phone.

## Build and release

Restore the existing Hub signing key into ignored `credentials/` files:
`release-keystore.jks` and `keystore.properties` with `STORE_PASSWORD`,
`KEY_ALIAS`, and `KEY_PASSWORD`. Run `npm run build:apk` to produce
`build/Notes-<version>.apk`. Release builds require these credentials.
Never change the signing key after distributing the first release.

Workflow: **Android apps** (manual). Select all apps or notes. Leave publish off
for APK artifacts; enable it with the universal profile for new Releases after
all selected builds pass. Pushes and tags do not build automatically.
Tags: `notes-v<version>`. CI uses the existing Hub `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`,
`KEY_ALIAS`, and `KEY_PASSWORD` secrets; no new secrets are needed.

Increment package.json, package-lock.json, app.json version, and versionCode
together. The updater checks only this app's tags and exact APK filename in
`UranikSejdiu/Personal-Hub`, at startup and on demand from Settings.

Android 7+ is supported; compile/target SDK is Android 17 (37). Automated tests
exercise migration, export round trips, recovery, disk/SQL failures, release
identity, and updater isolation. Actual installation, permissions, and transfer
must also be tested on a phone before removing Hub.

Original source follows the included PolyForm Noncommercial license.


