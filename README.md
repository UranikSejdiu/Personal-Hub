# Uranik apps

Four independent Android apps using React Native, Expo, TypeScript, and local
SQLite. Personal Hub is retired: its runtime and build workflow have been removed.
MoneyPlan (formerly Budget), My Notes, and Tasks replace it completely. Dhikr remains independent.

| App | Source | Android package | Tag | APK |
| --- | --- | --- | --- | --- |
| MoneyPlan | [apps/budget](apps/budget/) | `com.uranik.budget` | `budget-v<version>` | `Budget-<version>.apk` |
| My Notes | [apps/notes](apps/notes/) | `com.uranik.notes` | `notes-v<version>` | `Notes-<version>.apk` |
| Tasks | [apps/tasks](apps/tasks/) | `com.uranik.tasks` | `tasks-v<version>` | `Tasks-<version>.apk` |
| Dhikr | [apps/dhikr](apps/dhikr/) | `com.dhiker.counter` | `dhikr-v<version>` | `Dhikr-<version>.apk` |

MoneyPlan includes savings, loans, cards, and financial history. My Notes includes
rich text, checklists, archives, search, and sorting. Tasks includes repeating
tasks and native Android reminders. Each app has separate settings, storage,
backups, build checks, signing configuration, and an APK update channel.

## Move from Personal Hub

1. Before uninstalling Hub, use its Settings → Backup & restore → Export →
   Save to folder. Save the JSON outside app-private storage.
2. Install MoneyPlan, My Notes, and Tasks from their matching [GitHub releases](https://github.com/UranikSejdiu/Personal-Hub/releases).
   In each app's Settings, choose **Import Hub or app backup**, select the
   same Hub JSON file, review the record counts, and confirm.
3. Check financial history, rich notes, checklist ordering and archives, and
   task dates, repeats, and reminder times. Each importer reads only its own
   tables and preserves IDs, timestamps, ordering, and relationships.
4. Use **Save to folder** in each app to export a fresh backup. These exports
   use separate formats and restore into the matching app. Imports save recovery
   copies before replacement; database failures roll back all record changes.
5. Once all three imports and new backups are verified, uninstall Hub. It is
   not needed afterward. Uninstalling removes its old scheduled reminders.
   Enable notifications and **Alarms & reminders** in the new Tasks app and
   test a reminder while the phone is locked.

Android does not automatically move private databases between packages.
Transfer is a snapshot, not ongoing sync. Imports replace destination records
rather than merging later edits. Never uninstall the only copy of your data
before saving a backup and verifying all three imports.

Applicable Hub backup versions 1–7 are supported. Tasks requires both task
tables (normally version 5+); files without Tasks are rejected rather than
emptying the destination. Older exports may omit appearance preferences;
missing preferences leave current settings unchanged. New standalone exports
include portable theme and relevant Notes display preferences. Tap vibration
is available only in Dhikr; legacy vibration preferences in Hub backups are
accepted without enabling tap feedback in Budget, Notes, or Tasks.

Tests use disposable SQLite fixtures to verify mixed Hub imports, exact field
round trips, folder/share exports, legacy formats, rollback, recovery, and
update isolation. Actual personal records and device-provider behavior still
need checking on the phone before uninstalling Hub.

## Development

Use Node 24 and an Android SDK/JDK for native builds. Each app can be copied
to another repository and built without root runtime dependencies.

```sh
cd apps/budget
npm ci
npm run validate
npm run bundle:check
npm start
```

At the root, `npm ci` installs only repository tooling. `npm run install:apps`
installs each app's dependencies; `npm run validate` checks release configuration
and all four apps. Use `npm run budget`, `npm run notes`, `npm run tasks`, or
`npm run dhikr` to start an app.

## QA before updates

MoneyPlan's regression suite checks that expense and loan/card payment rows
keep their positions when marked paid or unpaid, update only the selected ID,
and retain the correct order under explicit paid/unpaid filters. These checks
run in `npm run validate` and the existing Android release workflow.
The workflow runs validation, dependency audits, production bundle checks, and
signed APK builds. Publication waits for every selected app to pass.

Before publishing, also complete the device checks in
[the release guide](.github/RELEASING.md#qa-before-publishing). Automated checks
do not cover every device, permission provider, or user flow.

The new apps target Android 17 (API 37), with Android 7.0 (API 24) as the minimum.
Native compilation and mocked tests do not certify every Android phone. Tasks
provides notification, exact-alarm, and manufacturer battery setup guidance.

## Releases

Run `npm run version:bump -- changed --dry-run` to preview release versions,
then `npm run version:bump -- changed` when ready. Use `tasks`, `budget,notes`,
or `all` instead to choose apps explicitly. Already prepared versions are reused.
The script does not commit, push, or publish.

Use **Actions → Android apps → Run workflow**. Choose changed apps, all, or one.
The default builds signed APK artifacts without publishing. `arm64-test` builds
only for modern ARM64 phones; `universal` retains both supported ARM architectures.
Enable **publish** only when ready for new GitHub Releases; all selected builds
must pass before publishing. Pushes and tags do not start builds automatically.
Updaters accept only their own tags and exact APK names.
See [Android releases](.github/RELEASING.md). Budget, Notes, and Tasks use the
existing Hub signing secrets. Dhikr keeps its existing signing key and secrets.
Never change a distributed app's package ID or signing key.

## License

Original work follows [PolyForm Noncommercial 1.0.0](LICENSE.md). See
[usage](USAGE.md), [copyright](NOTICE.md), and [third-party notices](THIRD_PARTY_NOTICES.md).
Existing third-party licenses and previously valid grants retain their terms.
