# Tasks

Independent Expo app. Android package: `com.uranik.tasks`.
Database: `tasks_data`. Deep link scheme: `uraniktasks`.
No Hub runtime imports or workspace dependencies. Use Node 24.

## Develop and verify

```sh
npm ci
npm run validate
npm run bundle:check
npm start
```

## Task screens

Today shows overdue and due tasks, summary filters, list chips, and search.
Calendar offers month/week selection and the selected day's agenda. Lists
supports creating, renaming, and deleting lists; deleting a list moves its
tasks to Inbox, keeping their reminders. The center add button uses the
selected calendar date or today. Completing a task offers Undo, with safe
handling for recurring occurrences that have already been edited.

Task rows are virtualized and loaded in pages. Calendar dots and overview
counts use SQLite aggregates instead of loading the full task history.
Settings contains reminder delivery checks, appearance, backup import/export,
recovery, and APK updates. This UI uses the existing backup format and reminder
scheduler; switching screens does not change stored task data.

## Transfer existing records

Keep Personal Hub installed. Save its JSON backup to a folder. In this app,
choose Settings → Import Hub or app backup, select that file, review counts,
and confirm. The same Hub file can be used for all three standalone apps.
Only this app's tables are copied, preserving IDs, timestamps, ordering, and
relationships. Import replaces current records after saving a recovery copy;
it does not merge later edits or sync with Hub.

Check all records and use Save to folder to export a new backup before
uninstalling Hub. Hub is retired and is not needed after transfer. Android does not automatically move private data between
packages. Restore previous data returns to the pre-import snapshot.

Exports use `uranik-tasks.backup` version 1 and contain only this app's
records. Other standalone apps' backups are rejected. Applicable Hub backup
versions 1–7 are accepted. Tasks requires task tables, normally version 5+.
Standalone exports include theme, vibration, and applicable Notes display preferences.
Older backups leave missing preferences unchanged. Preference write failures
are reported separately from a committed record import. Permission grants
must be configured separately for the new package. The standalone Tasks app
retains native exact-alarm support; test reminders on a sleeping phone.

## Build and release

Restore the existing Hub signing key into ignored `credentials/` files:
`release-keystore.jks` and `keystore.properties` with `STORE_PASSWORD`,
`KEY_ALIAS`, and `KEY_PASSWORD`. Run `npm run build:apk` to produce
`build/Tasks-<version>.apk`. Release builds require these credentials.
Never change the signing key after distributing the first release.

Workflow: **Build Tasks APK**. Tags: `tasks-v<version>`. Main and manual
builds upload artifacts. Version tags publish only after checks and the signed
build pass. CI uses the existing Hub `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`,
`KEY_ALIAS`, and `KEY_PASSWORD` secrets; no new secrets are needed.

Increment package.json, package-lock.json, app.json version, and versionCode
together. The updater checks only this app's tags and exact APK filename in
`UranikSejdiu/Personal-Hub`, at startup and on demand from Settings.

Android 7+ is supported; compile/target SDK is Android 17 (37). Automated tests
exercise migration, export round trips, recovery, disk/SQL failures, release
identity, and updater isolation. Actual installation, permissions, and transfer
must also be tested on a phone before removing Hub.

Original source follows the included PolyForm Noncommercial license.
