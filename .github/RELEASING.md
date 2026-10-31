# Android builds and updates

Hub is retired. Only Budget, Notes, Tasks, and Dhikr are maintained. Existing
Hub JSON backups remain supported. Old source and release tags remain in Git history.

| App | Source | Workflow | Tag | APK | Android package |
| --- | --- | --- | --- | --- | --- |
| Budget | `apps/budget` | Build Budget APK | `budget-v<version>` | `Budget-<version>.apk` | `com.uranik.budget` |
| Notes | `apps/notes` | Build Notes APK | `notes-v<version>` | `Notes-<version>.apk` | `com.uranik.notes` |
| Tasks | `apps/tasks` | Build Tasks APK | `tasks-v<version>` | `Tasks-<version>.apk` | `com.uranik.tasks` |
| Dhikr | `apps/dhikr` | Build Dhikr APK | `dhikr-v<version>` | `Dhikr-<version>.apk` | `com.dhiker.counter` |

## Build and publish

Main-branch app changes and manual dispatch run each app's independent checks
and signed build, uploading APK artifacts without publishing. Documentation-only
changes do not build native apps. Gradle and compiler caches are separated by
app. Publication requires both validation and APK build success. Native release
lint runs before assembly.

1. Update that app's package.json and package-lock.json version, app.json version,
   and Android versionCode together. Never reuse a published versionCode.
2. Run `npm run validate` and `npm run bundle:check` in its directory.
3. Commit and push. Wait for the main build to pass and warm caches.
4. Push its matching tag: `budget-v1.0.0`, `notes-v1.0.0`, or `tasks-v1.0.0`
   for the new apps' first releases.

The workflow rejects tags that differ from the built-in version. Each updater
sees a release only after its exact APK is attached. Standalone releases use
`make_latest: false`, preserving the historical Hub latest-release route for
old installations without offering them an APK from another package. No new
Hub releases are built. Never move or overwrite published tags.

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
