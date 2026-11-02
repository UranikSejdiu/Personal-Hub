# MoneyPlan

Previously Budget. The display name is MoneyPlan; the existing package, database, backup format, deep links, release tags, signing key, and APK updater filename remain compatible.

Brand assets and editable SVGs live in `assets/branding/`; regenerate with `node scripts/export-branding.cjs`. Both savings deposits and withdrawals, full history, recurring expenses, monthly plans, repayment management, imports, exports, and year closing remain available.

Alerts use the shared `AppAlerts` host at the top of the app and inside each native modal window. Standard alerts last one second; expense Undo stays available for ten. Validation and detailed errors remain inline, and cancellations stay silent. `npm run check:alerts` exercises real action handlers with mocked native IO, including failed writes, without starting a server or touching installed app data; it is also part of `npm run validate`. These checks do not replace a visual device pass.

Independent Expo app. Android package: `com.uranik.budget`.
Database: `budget_data`. Deep link scheme: `uranikbudget`.
No Hub runtime imports or workspace dependencies. Use Node 24.

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

New folder/share exports are password-protected using AES-256-GCM with a fresh
native-random salt/nonce and PBKDF2-HMAC-SHA256 (600,000 iterations). The password
is never saved. Keep it separately: a lost password cannot be recovered. Older
unencrypted MoneyPlan/Hub backups can still be imported after confirmation.
Existing exported files are not retroactively encrypted. The internal recovery
snapshot remains in the app's private storage.

The decrypted payload uses `uranik-budget.backup` version 1 and contains only
this app's records. Other standalone apps' backups are rejected. Applicable Hub backup
versions 1–7 are accepted. Standalone exports include the theme preference.
Legacy Notes display and vibration fields are accepted but ignored.
Older backups leave missing preferences unchanged. Preference write failures
are reported separately from a committed record import. Permission grants
must be configured separately for the new package.

## Build and release

Restore the existing Hub signing key into ignored `credentials/` files:
`release-keystore.jks` and `keystore.properties` with `STORE_PASSWORD`,
`KEY_ALIAS`, and `KEY_PASSWORD`. Run `npm run build:apk` to produce
`build/Budget-<version>.apk`. Release builds require these credentials.
Never change the signing key after distributing the first release.

Workflow: **Android apps** (manual). Select all apps or budget. Leave publish off
for APK artifacts; enable it with the universal profile for new Releases after
all selected builds pass. Pushes and tags do not build automatically.
Tags: `budget-v<version>`. CI uses the existing Hub `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`,
`KEY_ALIAS`, and `KEY_PASSWORD` secrets; no new secrets are needed.

Increment package.json, package-lock.json, app.json version, and versionCode
together. The updater checks only this app's tags and exact APK filename in
`UranikSejdiu/Personal-Hub`, at startup and on demand from Settings.

Android 7+ is supported; compile/target SDK is Android 17 (37). Automated tests
exercise migration, export round trips, recovery, disk/SQL failures, release
identity, and updater isolation. Actual installation, permissions, and transfer
must also be tested on a phone before removing Hub.

Original source follows the included PolyForm Noncommercial license.

## Security maintenance

MoneyPlan uses Expo SDK 58, React 19.3 and React Native 0.88.1 with matching
native modules. This removes the old Zod 3 tooling dependency and the vulnerable
query-string/URL-decoder chain. Their compatibility adapter is no longer needed.
The critical `shell-quote` dependency is also updated.

`npm run check:security` covers encrypted backups, authentication failures,
tampering, fixed KDF bounds, Node crypto interoperability, and dependency guards.
`npm run check:dependency-audit` queries npm's registry and fails on any high or
critical advisory. The complete November 1, 2026 audit reports zero high/critical
and 25 moderate findings; it includes development and framework tooling.

Native projects are generated from app.json. The Windows CMake plugin keeps
generated object paths below the Windows limit and runs on each prebuild.
