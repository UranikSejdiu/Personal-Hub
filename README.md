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

Both apps compile and target Android 17 (API 37), with Android 7.0 (API 24)
as the minimum supported version. Targeting the latest SDK does not certify
every manufacturer's phone; verify release builds on actual devices too.

### Task reminder delivery on Android

Open **Tasks → Reminder delivery** in a new native build of Personal Hub.
Enable notifications and **Alarms & reminders**. The app detects disabled
notification channels as well as denied app notification permission. Exact
alarm access lets Android schedule reminders during device sleep; denied access
keeps an inexact fallback that can arrive late. Granting alarm access restores
persisted schedules through a native receiver without needing to reopen Tasks.
Expo also restores schedules after reboot and an APK update. Android schedules
all future task reminders, rather than requiring a later launch to refill 50 slots.

If Samsung still delays reminders, follow the panel's battery instructions:
allow background usage / Unrestricted battery and remove Personal Hub from
Sleeping apps and Deep sleeping apps. Android force-stop pauses reminders until
the app is opened again. Repeating tasks create their next occurrence when the
current task is completed, as described in the task editor.

Before release, test on an S26 Ultra and an Android 17 device: schedule a reminder,
leave the app, lock the phone, and wait without reopening it. Repeat after a
reboot, APK update, and granting/revoking alarm access. Check notification denial,
blocked channels, edited/deleted/completed tasks, and more than 50 future reminders.
Verify both apps' navigation, keyboard, system bars, font scaling, backup import/
export, and APK installation on Android 7, 12, 13, 16, and 17. These device checks
are manual; passing source regressions and native compilation alone does not
verify delivery on a physical phone.

See Android's [alarm scheduling guidance](https://developer.android.com/develop/background-work/services/alarms)
and [Android 17 SDK setup](https://developer.android.com/about/versions/17/setup-sdk),
and Samsung's [background app management](https://developer.samsung.com/mobile/app-management.html).

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
