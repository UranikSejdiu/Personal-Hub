# Android builds and updates

Both apps build independently in [Personal-Hub](https://github.com/UranikSejdiu/Personal-Hub).
The repository is public. Signing keys and passwords live in GitHub Actions
Secrets and are never included in the source or APK.

| App | Source | Workflow | Release tag | APK | Android package |
| --- | --- | --- | --- | --- | --- |
| Personal Hub | Repository root | Build Release APK | `v<version>` | `app-release.apk` | `com.uranik.offlinehub` |
| Dhikr | `apps/dhikr` | Build Dhikr APK | `dhikr-v<version>` | `Dhikr-<version>.apk` | `com.dhiker.counter` |

Each updater checks only its own stable tags and exact APK filename in this
repository. Dhikr releases do not replace the default latest Hub release, so
older Hub installations can still update. No GitHub token is bundled in either
app. Making this repository private requires an authenticated update service
or moving downloadable releases to a public repository first.

## Build without publishing

Pushing app changes to `main` builds that app's signed APK and checks it in
parallel. Hub-only changes do not rebuild Dhikr, and Dhikr-only changes do not
rebuild Hub. Changes to the shared compiler cache action rebuild both apps.
Documentation-only changes do not start native builds. These runs upload APK
artifacts but never create releases.

Open [Actions](https://github.com/UranikSejdiu/Personal-Hub/actions), select the
app's workflow, and choose **Run workflow** on `main`. A successful run uploads
the signed APK as an artifact. Manual runs do not publish an app update.

## Build caches and timing

Native builds on `main` save Gradle dependencies, transforms, and task outputs,
plus a separate C++ compiler cache for each app. Tag builds restore these caches
from the default branch. A tag's cache cannot be reused by unrelated tags, which
is why the shared caches are warmed on `main` instead. Gradle task caching is
enabled in both apps' Expo plugins so it survives native project regeneration.

The first build after a cache miss still performs a full native compilation.
For later builds, inspect the job summary for compiler cache hits and the
`hub-gradle-profile` or `dhikr-gradle-profile` artifact for task timings. APK
uploads skip ZIP recompression and are retained for 14 days. New branch builds
cancel older builds on the same branch; release tag builds are not canceled.
Publishing is a separate job that requires both checks and the APK build to
succeed. Dhikr generates its native project once per build.
Release lint runs before APK assembly. Successfully compiled C++ objects are
cached on `main` even if a later lint or packaging task fails, so retries can
reuse that work.

## Publish an update

1. Update that app's `package.json` and `package-lock.json` version, its
   `app.json` version, and increment `app.json` Android `versionCode`.
   For Hub, also keep the tracked `android/app/build.gradle` version in sync.
2. Run `npm run validate` in the app's directory, commit, and push the source.
   Wait for its `main` build to succeed so the release can reuse the warmed caches.
3. Create and push the matching tag. For example, for the next versions:

   ```sh
   git tag v1.25.5
   git push origin v1.25.5
   git tag dhikr-v1.0.2
   git push origin dhikr-v1.0.2
   ```

Each workflow validates the tag against its app version before building. It
publishes a GitHub release only after validation and a signed APK build succeed.
The release appears in the app's updater once its APK is attached. Never reuse
an existing published tag or change an app's signing key.

## App performance and update checks

Both apps check for updates once at startup, and when the user chooses
**Check for updates**. Resuming does not poll or retry. A background launch waits
for its first foreground activation. Startup checks use fresh release metadata;
cached known updates are retained only for reporting a failed check.

Hub Notes waits for saved preferences before its initial page query. Tasks
pause their midnight refresh timer and page loading in the background, retain
native reminder scheduling, and use a smaller virtualized render window.
Reminder-sync bursts share a pass; changes during a pass receive one follow-up
using current records. Tutorial animations pause in the background while their
preview state is retained. Haptic preference reads are shared and rapid pulses
are bounded. The validation suite exercises these behaviors; battery savings
and frame timing require release-build measurements on a device.

## Signing

Hub uses `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, and `KEY_PASSWORD`.
Dhikr uses `DHIKR_KEYSTORE_BASE64`, `DHIKR_KEYSTORE_PASSWORD`, `DHIKR_KEY_ALIAS`,
and `DHIKR_KEY_PASSWORD`. Both sets are configured as repository Actions secrets.
Dhikr uses the same key as the locally built Dhikr APK.

## Android system backup and device transfer

Both apps allow Android backup. Each app's rules include its own SQLite records,
portable preferences, AsyncStorage database, and final recovery copy for Android
11 and lower, Android 12+ cloud backup, and Android 12+ device transfer. Cached
APKs, temporary exports, and device-bound SecureStore data are excluded. The
first launch migrates existing theme/vibration preferences; Hub also migrates
its tutorial and sample-data ownership state so those follow its restored data.

Users enable system backup in their phone settings. Backup scheduling, the
25 MB Google Auto Backup quota, installation availability, and manufacturer
support determine whether and when restoration occurs. Samsung Cloud and
Smart Switch support varies by device and transfer method; Android eligibility
does not guarantee every Samsung service restores third-party app data. Manual
JSON export/import remains available. Do not change package IDs or signing keys
between releases, because restored data must match the installed app.

Run `npm run audit:backup` in either app to test backup rules and preference
migration. A physical-device backup/restore test is still needed to confirm
behavior for a specific Samsung model/provider.

References: [Android Auto Backup](https://developer.android.com/identity/data/autobackup),
[Samsung backup options](https://www.samsung.com/us/support/answer/ANS10002780/).

## Moving existing Dhikr counts

Before updating an older Hub installation to the version with Dhikr removed,
export its backup. Import that backup into the standalone Dhikr app. Dhikr reads
only counts from legacy Hub backup versions 1–5. New Hub backups contain only
Budget, Notes, and Tasks; new Dhikr backups contain only counts.
