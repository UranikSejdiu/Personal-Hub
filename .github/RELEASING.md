# Android builds and updates

Hub is retired. Only Budget, Notes, Tasks, and Dhikr are maintained. Existing
Hub JSON backups remain supported. Old source and release tags remain in Git history.

| App | Source | Workflow | Tag | APK | Android package |
| --- | --- | --- | --- | --- | --- |
| Budget | `apps/budget` | Android apps | `budget-v<version>` | `Budget-<version>.apk` | `com.uranik.budget` |
| Notes | `apps/notes` | Android apps | `notes-v<version>` | `Notes-<version>.apk` | `com.uranik.notes` |
| Tasks | `apps/tasks` | Android apps | `tasks-v<version>` | `Tasks-<version>.apk` | `com.uranik.tasks` |
| Dhikr | `apps/dhikr` | Android apps | `dhikr-v<version>` | `Dhikr-<version>.apk` | `com.dhiker.counter` |

## Build and publish

Only **Actions → Android apps → Run workflow** starts builds. There is one
workflow for all four apps. Pushes, pull requests, and tags do not trigger it.
Choose `all` to run the four app jobs in parallel, or select one app.

Leave **publish** off to download signed APKs from the run's Artifacts section.
Choose `universal` for both supported ARM architectures, or `arm64-test` for a
faster APK for a modern ARM64 phone such as the S26 Ultra. ARM64 test files are
named `<App>-<version>-arm64-test.apk` and cannot be published as app updates.

Gradle and compiler caches are separate for each app. CMake compiler launchers
cover native dependency projects as well as the app, without caching signing
credentials or relaxing compiler-cache header checks. Each run saves updated
compiler entries on main, including repeat builds of the same commit. Native
release lint, app validation, and production bundles remain required.

1. Update that app's package.json and package-lock.json version, app.json version,
   and Android versionCode together. Never reuse a published versionCode.
2. Commit and push the new versions to main. No release is created by a push.
3. Open **Android apps**, choose main, select all or one app, choose `universal`,
   and enable **publish**. Run the workflow when ready.
4. Preflight rejects already released versions, non-increasing Android
   versionCodes, and conflicting existing tags before the expensive builds.
   All selected app builds must succeed before any publish job starts. Each
   publish job creates that app's matching version tag and attaches its signed
   APK to a separate GitHub Release. Existing release files are not overwritten.

Release tags are derived from the built-in version. Each updater
sees a release only after its exact APK is attached. Standalone releases use
`make_latest: false`; a repository-wide latest release cannot represent all
four independent apps. Each updater reads its own tag prefix instead.
Historical Personal Hub release records and APK assets have been removed;
their Git tags and source history remain. No new Hub releases are built.
Never move or overwrite published tags.

## Signing

Budget, Notes, and Tasks use the existing Hub signing key, with separate Android
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
the same file separately into Budget, Notes, and Tasks. Each app reads only
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
