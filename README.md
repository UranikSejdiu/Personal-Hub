# Personal Hub

An offline-first mobile toolkit for everyday budgeting, notes, and tasks.
This repository also contains **Dhikr**, an independent counter app with its own
Android identity, data, settings, build, and release stream.

Built with React Native, Expo, TypeScript, and local SQLite storage.

## Apps

| App | Source | Android package | Release tags |
| --- | --- | --- | --- |
| Personal Hub | Repository root | `com.uranik.offlinehub` | `v<version>` |
| Dhikr | [`apps/dhikr/`](apps/dhikr/) | `com.dhiker.counter` | `dhikr-v<version>` |

Both apps can be installed together. They keep separate databases and backups.
The Laravel/Vue web counter is a separate project in
[UranikSejdiu/Dhiker](https://github.com/UranikSejdiu/Dhiker).

## Personal Hub features

- **Budget:** monthly income and savings targets, expenses, paid status, recurring
  expenses, month history, and summaries. Month targets carry forward until changed.
- **Savings:** deposits, purchases, activity by year, and year-end carry-forward.
- **Loans & cards:** independent repayment plans and monthly payment tracking.
- **Notes:** rich text, checklists, search, sorting, pinned notes, and archives.
- **Tasks:** due dates, repeating tasks, completion, and optional reminders.
- **Settings:** light/dark themes, vibration controls, and module visibility.
- **Backups:** JSON export to an Android folder or share sheet, import, recovery
  copies, and Android system backup/device-transfer support.
- **Updates:** each app checks its own GitHub releases once at startup, with a
  manual check available in Settings.

## Get the Android apps

Open [Releases](https://github.com/UranikSejdiu/Personal-Hub/releases) and choose
the release for the app you want:

- **Hub:** a `v...` release with `app-release.apk`.
- **Dhikr:** a `dhikr-v...` release with `Dhikr-<version>.apk`.

Android may ask you to allow installation from the app used to open the APK.
Each app's updater uses its own tags and APK names so the release streams stay
separate.

## Develop locally

Use Node.js 24 as specified in [`.nvmrc`](.nvmrc).

```sh
git clone https://github.com/UranikSejdiu/Personal-Hub.git
cd Personal-Hub
npm ci
npm start
```

For native development, install the Android SDK and a compatible JDK, then run
`npm run android`. Dhikr installs and runs independently from `apps/dhikr`:

```sh
cd apps/dhikr
npm ci
npm start
```

See the [Dhikr README](apps/dhikr/README.md) for its full setup and local APK build
instructions.

## Checks and release builds

Run these from the app directory you are working on:

```sh
npm run validate
npm run bundle:check
npm run check:fonts
```

Validation checks types, lint, data regressions, backup behavior, and theme
contrast. Native appearance, device backup/restore, notifications, and installation
still require testing on a compatible phone.

The apps have separate GitHub Actions builds and release tags. Read
[Android builds and updates](.github/RELEASING.md) for signing-secret names,
versioning, cached builds, and publishing. Signing keys and credentials belong
in local ignored files or GitHub Actions Secrets, never in public source.

## Data and backups

Core app data is stored locally. Export a backup before changing phones or making
large changes. Folder export, sharing, import, and recovery are available through
**Settings → Backup & restore**. Android cloud backup and phone transfer depend
on the device and its backup provider; manual JSON export remains available.

## License and usage

The author's original work is available under the
[PolyForm Noncommercial License 1.0.0](LICENSE.md). It permits use, modification,
and sharing for permitted noncommercial purposes and expressly permits use by
specified charitable, educational, research, public-service, and government
organizations. Uses outside the license's permitted purposes require separate
permission; commercial resale and monetized products or services are not
generally covered by the noncommercial grant.

See the [usage guide](USAGE.md), [copyright notice](NOTICE.md), and
[third-party notices](THIRD_PARTY_NOTICES.md). The official license governs;
these summaries add no restrictions. Third-party materials and previously valid
license grants retain their existing permissions.


## Author and support

[Uranik Sejdiu](https://github.com/UranikSejdiu). Use
[GitHub Issues](https://github.com/UranikSejdiu/Personal-Hub/issues) for bug reports,
questions, and permission requests. Include the app name, version, Android
version, and steps to reproduce when reporting an issue.
