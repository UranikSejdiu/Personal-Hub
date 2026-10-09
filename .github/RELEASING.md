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

Open [Actions](https://github.com/UranikSejdiu/Personal-Hub/actions), select the
app's workflow, and choose **Run workflow** on `main`. A successful run uploads
the signed APK as an artifact. Manual runs do not publish an app update.

## Publish an update

1. Update that app's `package.json` and `package-lock.json` version, its
   `app.json` version, and increment `app.json` Android `versionCode`.
   For Hub, also keep the tracked `android/app/build.gradle` version in sync.
2. Run `npm run validate` in the app's directory, commit, and push the source.
3. Create and push the matching tag. For example, for the next versions:

   ```sh
   git tag v1.25.4
   git push origin v1.25.4
   git tag dhikr-v1.0.1
   git push origin dhikr-v1.0.1
   ```

Each workflow validates the tag against its app version before building. It
publishes a GitHub release only after validation and a signed APK build succeed.
The release appears in the app's updater once its APK is attached. Never reuse
an existing published tag or change an app's signing key.

## Signing

Hub uses `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, and `KEY_PASSWORD`.
Dhikr uses `DHIKR_KEYSTORE_BASE64`, `DHIKR_KEYSTORE_PASSWORD`, `DHIKR_KEY_ALIAS`,
and `DHIKR_KEY_PASSWORD`. Both sets are configured as repository Actions secrets.
Dhikr uses the same key as the locally built Dhikr APK.

## Moving existing Dhikr counts

Before updating an older Hub installation to the version with Dhikr removed,
export its backup. Import that backup into the standalone Dhikr app. Dhikr reads
only counts from legacy Hub backup versions 1–5. New Hub backups contain only
Budget, Notes, and Tasks; new Dhikr backups contain only counts.
