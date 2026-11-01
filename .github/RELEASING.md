# Android builds and updates

Hub is retired. Only MoneyPlan, My Notes, Tasks, and Dhikr are maintained. Existing
Hub JSON backups remain supported. Old source and release tags remain in Git history.

| App | Source | Workflow | Tag | APK | Android package |
| --- | --- | --- | --- | --- | --- |
| MoneyPlan | `apps/budget` | Android apps | `budget-v<version>` | `Budget-<version>.apk` | `com.uranik.budget` |
| My Notes | `apps/notes` | Android apps | `notes-v<version>` | `Notes-<version>.apk` | `com.uranik.notes` |
| Tasks | `apps/tasks` | Android apps | `tasks-v<version>` | `Tasks-<version>.apk` | `com.uranik.tasks` |
| Dhikr | `apps/dhikr` | Android apps | `dhikr-v<version>` | `Dhikr-<version>.apk` | `com.dhiker.counter` |

## Build and publish

### App and download names

Workflow jobs, summaries, and release titles use the app display names from
`app.json`: **MoneyPlan** and **My Notes**. Downloadable artifacts are named
`MoneyPlan-APK.zip` and `My-Notes-APK.zip` (with `-arm64-test` for that profile).
Existing runs retain their original names.

The APKs inside keep `Budget-<version>.apk` and `Notes-<version>.apk` because
installed updaters require those exact filenames. Android package IDs, tags,
signing keys, and data remain compatible.

### Run a build

Only **Actions → Android apps → Run workflow** starts builds. There is one
workflow for all four apps. Pushes, pull requests, and tags do not trigger it.
Choose `changed` (the default) to build only apps with changes since their latest
release tags. Each app is compared to its own tag, not another app's release.
Choose `all` to run the four app jobs in parallel, or select one app explicitly.
App documentation and test-script changes alone do not require an app release.
With no app changes, the workflow finishes without building or publishing.

Leave **publish** off to download signed APKs from the run's Artifacts section.
Choose `universal` for both supported ARM architectures, or `arm64-test` for a
faster APK for a modern ARM64 phone such as the S26 Ultra. ARM64 test files are
named `<App>-<version>-arm64-test.apk` and cannot be published as app updates.

Gradle and compiler caches are separate for each app. CMake compiler launchers
cover native dependency projects as well as the app, without caching signing
credentials or relaxing compiler-cache header checks. Each run saves updated
compiler entries on main, including repeat builds of the same commit. Native
release lint, app validation, and production bundles remain required.

1. Prepare versions using the commands below. Never reuse a published versionCode.
2. Commit and push the new versions to main. No release is created by a push.
3. Open **Android apps**, choose main, select changed, all or one app, choose `universal`,
   and enable **publish**. Run the workflow when ready.
4. Preflight rejects already released versions, non-increasing Android
   versionCodes, and conflicting existing tags before the expensive builds.
   All selected app builds must succeed before any publish job starts. Each
   publish job creates that app's matching version tag and attaches its signed
   APK to a separate GitHub Release. Existing release files are not overwritten.

## QA before publishing

Run `npm run qa:emulator` from the repository root with a booted x86_64 Android
emulator. It builds offline previews for all four apps, retaining existing data,
then saves screenshots, UI trees, runtime-error logs, and smoke-check results in
`work/qa/`. The existing release workflow also requires each selected app's
validation suite, dependency audit, production bundles, Android API 36 emulator
smoke checks, and native release lint. Each selected app gets its own emulator
job within the build matrix; screenshots and logs are uploaded as
`<App>-emulator-QA` artifacts even if a check fails. A failed check blocks the
signed build and publication of all selected updates. The workflow uses
[Android Emulator Runner](https://github.com/ReactiveCircus/android-emulator-runner)
with the same build and smoke scripts used locally.

Use disposable records for these additional checks on the release candidate:

- MoneyPlan: mark several expenses and loan/card payments paid and unpaid.
  Rows must stay in place in All; only the selected record may change. Check
  paid/unpaid filters, totals, month switching, and force-stop/relaunch.
- My Notes: create and reopen text and checklist notes; edit, search, pin,
  archive/unarchive, reorder checklist items, and verify attachments survive.
- Tasks: create and edit tasks, test completion/undo and repeats,
  switch calendar dates, and verify reminder delivery with the phone locked.
- Dhikr: select two different counters, tap rapidly, switch between them, and
  verify counts, daily limits, reset isolation, and restart persistence.
- Each app: export and restore a disposable backup, cancel file pickers,
  switch light/dark appearance, and install the signed candidate over the
  previous signed version without uninstalling. Verify data and settings.

Treat failures as release blockers. Record the tested APK/version and device;
emulator smoke checks do not certify notification delivery, external file
providers, or a production signing-key upgrade on a physical phone.

## Prepare release versions

```sh
# Preview which apps need the next patch release; no version files are written.
npm run version:bump -- changed --dry-run

# Increase only apps with pending app changes.
npm run version:bump -- changed

# Explicitly prepare one app, a group, or all four.
npm run version:bump -- tasks
npm run version:bump -- budget,notes
npm run version:bump -- all

# Choose a larger version increase when appropriate.
npm run version:bump -- tasks --bump minor
```

The script synchronizes package.json, both version fields in package-lock.json,
app.json's version, and Android versionCode. It fetches origin tags first;
`--offline` explicitly uses only locally available tags. Changes include committed,
staged, unstaged, and untracked app code; ignored private files are excluded.
It compares each app with its latest stable `<app>-v<version>` tag. Those tags
must be reserved for actual app releases. Shared repository tooling does not
force new app versions; use `all` deliberately when all apps need an update.

Repeated preparation retains an already increased version and build number.
A minor/major request can raise that pending version further. A first release
without a previous app tag retains its current version. Invalid or inconsistent
version files stop the operation before writes; failed replacements roll back.
The script never commits, pushes, creates tags, builds, or publishes. Review its
output, commit/push when ready, then use the manual workflow. If selecting
`changed` for publishing, every changed app must have a prepared newer version;
choose one app explicitly to release only that app while other work is pending.

Release tags are derived from the built-in version. Each updater
sees a release only after its exact APK is attached. Standalone releases use
`make_latest: false`; a repository-wide latest release cannot represent all
four independent apps. Each updater reads its own tag prefix instead.
Historical Personal Hub release records and APK assets have been removed;
their Git tags and source history remain. No new Hub releases are built.
Never move or overwrite published tags.

## Signing

MoneyPlan, My Notes, and Tasks use the existing Hub signing key, with separate Android
package IDs. Their workflows use the existing repository secrets:
`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, and `KEY_PASSWORD`.
No new secrets are required. Preserve this key for every future update.

For local signed APKs, restore the key into each app's ignored
`credentials/release-keystore.jks` and `credentials/keystore.properties`.
The properties file uses `STORE_PASSWORD`, `KEY_ALIAS`, and `KEY_PASSWORD`.
Run `npm run build:apk` there. The new apps refuse releases without credentials
to avoid distributing a debug-signed first version.

Dhikr retains `DHIKR_KEYSTORE_BASE64`, `DHIKR_KEYSTORE_PASSWORD`,
`DHIKR_KEY_ALIAS`, and `DHIKR_KEY_PASSWORD`, matching its distributed APK.

## Update isolation

Each app accepts only its own stable tag prefix and exact APK filename, uses
a package-specific cache, and verifies the installed package before launching
an installer. Checks run once at startup and on demand in Settings. Drafts,
prereleases, missing assets, and other apps' tags are ignored. Failed checks
remain failures, with previously detected updates labeled cached. Downloaded
APKs remain available for installer retry.

This public repository supports unauthenticated in-app GitHub downloads.
Making it private requires an authenticated update service or a public release
repository. Tokens are never bundled in an APK.

## Migration and device checks

Save a full JSON backup from the existing Hub before uninstalling it. Import
the same file separately into MoneyPlan, My Notes, and Tasks. Each app reads only
its own tables. Check the records and a fresh per-app export, then uninstall
Hub; it is not required after transfer.

Imports validate before writing, save recovery copies, preserve IDs/timestamps/
links, and replace records in one transaction. Configure notifications and
exact alarms again for Tasks: Android grants do not transfer between packages.
Uninstalling Hub removes its old alarms; no permanent Hub pause feature is needed.

Test folder/share exports, import/recovery, installation, locked-phone reminders,
and system backup on release builds on an actual phone. Android system backup
includes each app's own databases, portable preferences, and recovery copy;
provider availability varies. Never uninstall the only copy of personal data
before validating the backups.

## Saved for the next update test

Keep the current app versions installed. When ready, publish higher versions
through the manual workflow, then use each app's Settings update check to
download and install its own APK. Verify that records and reminders survive
the update. Do not publish an extra version just to test the build workflow.
