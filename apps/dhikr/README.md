# Dhikr

Independent Expo app, extracted from Personal Hub. This directory can be copied
to a separate repository and installed/built without the hub. It has its own
package-lock, fonts, components, configuration and database. No hub imports or
workspace dependencies are required.

Android identity: `com.dhiker.counter`. Deep link scheme: `dhikercounter`.
Local database: `dhikr_data`. Personal Hub can stay installed alongside Dhikr.

## Develop and verify

Use Node 24, then run these commands in this directory:

```sh
npm ci
npm start
npm run validate
npx expo config --type public
npm run bundle:check
```

## Build an APK

Install the Android SDK and JDK 17 or 21, configure `ANDROID_HOME` and `JAVA_HOME`,
then run:

```sh
npm run build:apk
```

The script generates the native project with `--no-clean`, runs `assembleRelease`,
and copies the APK to `build/Dhikr-<version>.apk`. Generated native files and APKs
are ignored by Git. The build uses only this app's dependencies.

The local project has its own release key in `credentials/release-keystore.jks`
and its passwords/alias in `credentials/keystore.properties`. These files are
ignored by Git and kept outside generated native folders. Back them up securely;
future updates must use the same key. Never commit or publish them.

On a fresh checkout, restore those credentials before building updates. For a
brand-new app that has never been distributed, `npm run signing:create` creates
a new key and refuses to overwrite existing credentials. Local builds without
credentials fall back to Android's debug key; CI requires release signing.

The repository's **Build Dhikr APK** workflow runs independently on manual
dispatch or a `dhikr-v<version>` tag. Set these repository secrets for Dhikr:
`DHIKR_KEYSTORE_BASE64`, `DHIKR_KEYSTORE_PASSWORD`, `DHIKR_KEY_ALIAS`,
`DHIKR_KEY_PASSWORD`. It uploads its own APK and attaches it to its own tagged
release. Hub tags (`v*`) continue to build the hub.

Version name comes from this app's `package.json`; increment
`app.json` → `expo.android.versionCode` for each new Android release. Prebuild
syncs both into Android. EAS preview and production profiles also produce APKs;
EAS requires linking this app to your own Expo project first.

## Save backups on Android

Settings → Backup & restore → Export backup offers **Save to folder** and
**Share backup** together. Save to folder opens Android's folder picker and
saves the JSON backup directly in the folder you select. Share backup sends a
copy to another app. Cancelling the picker does not save a file.

## Android system backup and phone transfer

The Android app participates in system backup and phone-to-phone transfer.
Its rules include the Dhikr database, saved preferences, and the last recovery
copy on Android 11 and older, and both cloud backup and device transfer on
Android 12 and newer. Temporary exports and device-bound SecureStore data are
excluded. Existing theme and vibration preferences migrate to portable storage
when the updated app is opened.

Enable backup in the phone's Android/Google or supported manufacturer backup
settings. Scheduling and restore availability are controlled by the phone's
backup provider. Samsung Cloud, Smart Switch, and Temporary Cloud Backup have
different support depending on model, software, and transfer method; declaring
Android backup support cannot guarantee that every Samsung service restores
third-party app data. Export backup remains available for a manual transfer.

Restoring requires the same Android package and signing key, with a compatible
app version installed on the destination. Google Auto Backup has a 25 MB limit
per app; device transfer and manufacturer services can have different limits.

References: [Android Auto Backup](https://developer.android.com/identity/data/autobackup),
[Samsung backup options](https://www.samsung.com/us/support/answer/ANS10002780/).

## App updates

The updater reads releases from `UranikSejdiu/Personal-Hub` on GitHub.
Build and publishing instructions are in
[RELEASING.md](https://github.com/UranikSejdiu/Personal-Hub/blob/main/.github/RELEASING.md).

Settings → About & updates checks only stable `dhikr-v<version>` releases with an
attached `Dhikr-<version>.apk`. Hub `v<version>` releases are ignored. Checks
run once at app startup. Returning from the background does not check again,
even after several hours or a failed startup check. A background launch waits
until the app first enters the foreground. **Check for updates** requests a
fresh check on demand.
Failed checks are shown as failures; a recent previously detected update is
labelled as cached. Installation uses Android's normal installer and keeps a
downloaded APK available for retry.

Dhikr publishing leaves the repository's default latest release available to
older hub builds. Its own checker reads the separate Dhikr releases directly.

The tagged release workflow verifies that its tag matches the version built
into the APK. Update `package.json`, `app.json` version, and Android
`versionCode` together before publishing a new tagged release.

## Performance and battery use

Counter taps update one in-memory record and persist immediately through the
ordered write queue. They do not copy the full catalog or delay saving counts.
Refreshing same-day records does not issue a rollover UPDATE. The first tap
after midnight and returning to the app both refresh daily-count behavior.

Counter animations and warning timers stop when leaving the screen or putting
the app in the background. Fireworks use one shared animation timeline and
respect the system's reduced-motion preference. Haptic preference reads are
shared; extreme tap bursts and repeated warnings have bounded vibration rates.
Goal completion uses one success effect. Vibration can still be disabled in
Settings. List rows and the counter title are memoized, and the list keeps a
smaller render window for long catalogs.

The regression suite checks rapid counts, 3,000-record catalogs, rollback,
resets, midnight, background transitions, haptic calls, animation cleanup, and
startup-only and manual update checks. These are work-count and correctness checks;
frame time and battery savings must be measured on a release build on a phone.

## Move existing counts

1. Use a JSON backup exported from Personal Hub before the backup separation
   (backup versions 1–5), or export one from the older hub app before updating.
2. Install Dhikr and open Settings → Backup & restore → Import counts.
3. Choose the hub backup and confirm the Dhikr record count.

Dhikr reads only the `dhikrs` table from supported hub backups (versions 1–5).
Import replaces Dhikr's existing counts in one transaction and first saves a
recovery copy. Settings → Restore previous data restores that copy. Malformed
or unsupported backups are rejected before writes. Exported Dhikr backups can
be imported into Dhikr on another device.

New hub backups (version 6) contain only Budget, Notes, and Tasks data. The hub
also ignores Dhikr data when importing older mixed backups. Dhikr exports and
recovery copies contain only its own names, counts, goals, and ordering.

The hub leaves archived counts in its old private database untouched. It no
longer exposes Dhikr screens or includes the Dhikr counter code.
This new package cannot directly access another Android app's private storage.

Icons use Flaticon Uicons: https://www.flaticon.com/uicons.
