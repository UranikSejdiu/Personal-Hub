# Personal Hub audit — 30 September 2026

Reviewed Personal Hub version 1.19.6. The findings below describe the original audit state; the remediation table records subsequent source changes. This is a source and fixture audit, not a penetration test or certification that every issue has been found.

**Result:** 12 actionable findings, including one Android privacy issue and nine bugs reproduced against the actual domain source with disposable SQLite fixtures. Native APIs were mocked in these fixtures; the current app build was not launched on a device. Three additional areas need lifecycle/device verification.

Priorities: **P1** = fix first because user data/privacy/accounting is affected; **P2** = fix in the next maintenance pass. Priority describes practical impact, not a CVSS score.

## Remediation status

The following changes are in the working tree. The findings below remain as the original problem descriptions and their line references may have shifted.

| Finding | Current status |
| --- | --- |
| 1. Android backup privacy | Android source and checked-in rules now exclude `files/SQLite/` and both recovery JSON files in cloud and transfer rules. XML and Expo config checks pass; an OS backup/restore test and the iOS policy remain open. |
| 2. Budget deletion | Future deletions explicitly remove expenses in the same transaction. Existing orphaned expenses, if any, still need a data-preserving recovery policy. |
| 3. Checklist creation | New notes and items are created in one transaction; an injected item-write failure rolls back both. |
| 4–5. Savings carry-forward | Closings now use all underlying activity before the marker. Historical edits refresh markers transactionally; schema migration v6 rebuilds existing markers. Native upgrade testing remains open. |
| 6. Demo cleanup after import | Import and safety restore invalidate stale SecureStore demo ownership before replacing database rows. If replacement fails afterward, demo cleanup may no longer be offered, but imported real data cannot be removed as demo data. |
| 7. Loan counter toggle | New toggles record whether they incremented the counter, so undo reverses only that increment; repeated loan and card toggles are idempotent. Legacy paid months have ambiguous provenance and use a conservative count check. |
| 8. Recurring expenses | Existing recurring rows are deduplicated using the selected columns, with checks and inserts in one transaction. |
| 9. Backup references | Duplicate budget/note IDs, unsafe integer IDs, and disagreeing expense budget references are rejected before import. |
| 10. Loan bounds | Term, rate, principal, and payment limits are shared across input, import, persistence, and calculations; PMT uses a stable formula. |
| 11. Manual loan payment | The card uses the shared payment helper, and no-schedule balances now account for the manual payment. |
| 12. Tutorial completion | Persistence failures show an existing translated toast and allow retry; concurrent taps are guarded. Device UI testing remains open. |
| Additional: pending settings writes | Normal import, safety restore, and demo cleanup now use the same cancel-and-drain step for debounced goal saves. A controlled UI race test remains open. |
| Additional: demo seeding race | The seeder rechecks database emptiness after entering the write transaction, so a user write that wins the race is preserved. |
| Additional: checklist save/drop lifecycle | Screen-callback reproduction confirmed Save could persist the old order before the drag library finished its drop animation. Save/back now wait for `onDragEnd`, use the final order before React commits, and reject duplicate saves. Edits are disabled during writes; failed writes keep the editor open for retry. |
| Additional: SQLite FTS connection close | Expo's native statement sweep finalizes FTS-owned statements before SQLite closes them. A disposable host SQLite process with the app's FTS triggers reproduced native heap corruption using that algorithm; disabling the sweep closed successfully. Database open options now disable the sweep and propagate to exclusive transaction connections. This verifies the defect, but does not establish the stack trace of the reported Android incident. |

The five strict unused-symbol diagnostics are resolved, and the unsupported `.npmrc` setting is removed. File-removal candidates and larger performance/lifecycle work remain listed below; no candidate file was deleted. [Regression checks](./scripts/audit-regression.cjs) exercise the fixed data paths with disposable in-memory SQLite and mocked native APIs.

## Findings

### 1. [P1] Android backup exclusions miss both the real database and recovery snapshot

References: [backup plugin](./plugins/withAndroidBackupRules.js#L16), [database open](./src/lib/db.ts#L124), [recovery file](./src/lib/backup.ts#L34).

The plugin and checked-in XML exclude `domain="database"`, but the installed Expo SQLite Android implementation sets its default directory to `context.filesDir/SQLite` (`node_modules/expo-sqlite/android/src/main/java/expo/modules/sqlite/SQLiteModule.kt:35`). This app opens the default directory. Therefore the exclusions do not cover `app_data`, its WAL, or its SHM file. The complete recovery snapshot is plaintext JSON in `Paths.document`, which also resolves to `filesDir` on Android; it has no exclusion either.

Consequently financial data and notes remain eligible for OS cloud backup and device transfer, contradicting the stated on-device policy. Actual transfer depends on OS settings and backup availability. Android treats `file` and `database` as different backup domains. [Android backup documentation](https://developer.android.com/identity/data/autobackup).

**Fix:** add `file` exclusions for `SQLite/`, the recovery JSON, and its temporary sibling in the persistent config plugin for all three rule blocks. Verify generated XML and a real backup/restore. Decide and implement the equivalent iOS backup policy separately; this audit did not establish iOS exclusion coverage.

### 2. [P1] Budget deletion inside transactions leaves orphaned expenses

References: [transaction wrapper](./src/lib/db.ts#L395), [deleteBudget](./src/lib/budget.ts#L323), [dashboard deletion](./app/(budget)/index.tsx#L84).

`foreign_keys=ON` is set only on the original connection. Expo's `withExclusiveTransactionAsync` opens a separate connection, whose foreign-key enforcement defaults to off in the installed build. `deleteBudget(month, tx)` deletes only the budget and relies on cascading expense deletion. Both dashboard deletion and demo cleanup use this path.

**Reproduced:** delete a budget with one expense using the transaction executor; `PRAGMA foreign_key_check` reports an orphan. The app can then export a backup that its own validator rejects because the expense references a missing budget.

**Fix:** enforce foreign keys on each connection before its transaction starts, or explicitly delete dependent expenses within the transaction. Setting the pragma in this callback is insufficient because Expo has already executed `BEGIN`. Repair existing orphan rows through an intentional migration/recovery policy after protecting user data.

### 3. [P1] Creating a checklist is not atomic

References: [creation helper](./src/lib/notes.ts#L298), [new-note save caller](./app/(notes)/checklist.tsx#L262).

Existing checklist updates are transactional, but creating a new checklist inserts the note and each item using independently committed writes.

**Reproduced:** inject failure on the second item. Save rejects while a partial note and the first item remain persisted. Since the screen receives no created ID on failure, retrying can create another note.

**Fix:** wrap the complete creation in the existing transaction abstraction, preserving support for callers already inside a transaction.

### 4. [P1] Closing a year after an inactive gap discards earlier savings

Reference: [closeYear](./src/lib/savings.ts#L302).

The closing calculation sums only entries dated in the selected year. Earlier carry-forward is included only if its marker happens to be dated within that same year. An intervening year without activity cannot be closed, so its carry-forward never advances. Once a later year is closed, the summary trusts that newest marker and excludes the missing balance.

**Reproduced:** deposit €100 in 2023, close 2023, leave 2024 inactive, deposit €50 in 2025, then close 2025. The displayed balance changes from €150 to €50.

**Fix:** build the closing balance from the latest preceding carry-forward plus subsequent activity through the requested year, with explicit rules for inactive years.

### 5. [P1] Editing closed-year activity leaves carry-forward balances stale

References: [transaction update](./src/lib/savings.ts#L172), [summary cutoff](./src/lib/savings.ts#L235), [UI edit handling](./app/(budget)/savings.tsx#L208).

The UI protects closing markers, but still permits edits, deletions, and additions to underlying historical activity. These mutations neither reject closed periods nor recompute their carry-forward markers. The summary excludes those historical rows, so edits can succeed without changing the savings balance.

**Reproduced:** deposit €100 in 2023, close the year, then update the original deposit to €150. The history shows €150 while the balance remains €100.

**Fix:** either enforce closed-period immutability in the data layer with clear UI feedback, or recompute all affected closing balances transactionally. Cover auto-deposits and date changes as well as manual entries.

### 6. [P1] Demo cleanup can delete real data imported later

References: [demo record](./src/lib/sampleData.ts#L69), [cleanup](./src/lib/sampleData.ts#L219), [import](./src/lib/backup.ts#L422).

Import replaces database rows but leaves the SecureStore demo record unchanged. Cleanup deletes budgets solely by recorded month, without verifying their provenance. Imported real budgets for those months are therefore treated as demo rows. The recovery snapshot also does not restore this metadata.

**Reproduced:** retain a seeded record for September 2026, import a genuine September budget with €5,000 income, then clear demo data. The imported budget is deleted.

**Fix:** invalidate/reconcile demo ownership after both import and safety restore. Prefer database-scoped ownership metadata that participates in the same transaction instead of stale external IDs/months.

### 7. [P2] Undoing the final loan payment does not undo the paid-month counter

Reference: [applyLoanPaidToggle](./src/lib/budget.ts#L115).

The decrement is skipped whenever the loan is currently fully paid, including when the immediately preceding toggle legitimately paid the final month.

**Reproduced:** start at 11/12 months, check payment, then uncheck it. The month flag is false but the loan remains at 12/12 and fully paid.

**Fix:** distinguish an actual recorded increment from a toggle suppressed by the cap. Keep payment flags and the counter consistent without decrementing for increments that never happened. Also make both loan and credit-card toggles idempotent against the persisted flag.

### 8. [P2] Recurring-expense deduplication reads a column it never selected

Reference: [populateRecurringExpenses](./src/lib/budget.ts#L248).

The query selects `category, amount`, but the existing-key builder also reads `is_recurring`. The resulting suffix is `NaN`, whereas comparison keys end in `1`, so no existing matching row is recognized.

**Reproduced:** populate a budget already containing the matching recurring expense; the expense is inserted again. Current dashboard usage usually populates a newly created budget, so normal initial creation can mask this bug.

**Fix:** select the missing column or use the two-column key consistently, and perform the existence checks and insertions within one transaction.

### 9. [P2] Backup validation permits ambiguous IDs that silently reassign relationships

References: [validator](./src/lib/backup.ts#L252), [budget mapping](./src/lib/backup.ts#L492), [note mapping](./src/lib/backup.ts#L572).

Duplicate budget months are rejected, but duplicate original budget IDs and note IDs are accepted. Import maps overwrite earlier entries for the same ID. An otherwise accepted backup can attach expenses or checklist items to the wrong parent. Conflicting `budget_month` and `budget_id` are also not checked for agreement.

**Reproduced:** two distinct months share ID 1; an expense referencing ID 1 passes validation and is silently assigned to the last month.

**Fix:** require unique positive safe integer parent IDs when supplied, validate relationship consistency, and reject ambiguity before creating the safety snapshot or deleting rows.

### 10. [P2] Loan inputs lack bounds for calculations and schedule allocation

References: [import validation](./src/lib/backup.ts#L137), [schedule loop](./src/lib/calculations.ts#L84), [loan term input](./app/(budget)/loans.tsx#L153).

The validator accepts arbitrarily large integer loan terms. The UI has no maximum either. `getActualSchedule` allocates one row per month during rendering, and PMT exponentiation overflows for sufficiently large terms. Finite inputs alone do not guarantee finite outputs.

**Reproduced:** a 10,000,000-month loan passes backup validation; `pmt(1200, 5, 10000000)` produces `NaN`. The potentially huge schedule loop was deliberately not executed in the fixture test.

**Fix:** define shared realistic domain bounds, validate them at input/import boundaries and before calculation, and use numerically stable financial formulas. Add safe-integer checks for identifiers/counters.

### 11. [P2] Manual loan payment is ignored by the payment card when no start date is set

References: [payment card](./src/components/LoanPaymentSection.tsx#L60), [shared payment helper](./src/lib/budget.ts#L487).

Source-confirmed: the card's no-schedule path calls `pmt` directly, while dashboard/monthly summaries honor `loan_payment` through `loanMonthlyPayment`. A valid manual payment with no start date therefore displays differently across screens.

**Fix:** use the shared helper for the card's fallback and review balance calculations for the same override. Verify the resulting card on a device.

### 12. [P2] Tutorial completion and skip handlers can reject without handling the error

Reference: [tutorial handlers](./src/components/TutorialScreen.tsx#L49).

Source-confirmed: both handlers await `setTutorialSeen(true)` but have no catch, and are passed directly to `Pressable`. A SecureStore failure leaves navigation unfinished and creates an unhandled promise rejection.

**Fix:** handle persistence failure intentionally with translated feedback and a retry or documented fallback. Guard duplicate completion requests.

## Additional lifecycle/device checks

- **Unsaved note navigation:** both editors prevent removal with `beforeRemove` on a native stack. The installed Expo Router fork itself warns that this is not fully supported for native dismissals (`useDismissedRouteError.js:47`). Use the supported prevent-remove hook/context and test iOS swipe-back, Android back, and module switching. [Navigation documentation](https://reactnavigation.org/docs/navigation-events/). The device failure was not reproduced here.
- **Pending settings writes during recovery/reset:** normal import cancels the goal debounce and waits for its tracked save, but `runSafetyRestore` and `runClearSampleData` do not. A delayed save can rewrite the restored/reset goal. Apply the same write-draining discipline to all replacement operations; test with controlled delayed writes.
- **Refresh and background handling:** the budget detail screen loads through an ordinary effect, without a focus or foreground reload; its autosave and expense debounces flush on unmount but have no `AppState` handling. Test returning to an already mounted month after import/restore, resuming across midnight/month boundaries, and backgrounding during a pending edit. Inspect seeding too: the emptiness check happens before its write transaction, while bootstrap exposes screens before background seeding finishes.

## Dead code and cleanup

At audit time the normal typecheck and lint passed, while a stricter unused-symbol check identified five diagnostics. All five are now resolved in the working tree:

| Location | Cleanup |
| --- | --- |
| [notes list](./app/(notes)/(tabs)/index.tsx#L1) | Unused default `React` import. |
| [NumberInput](./src/components/NumberInput.tsx#L24) | `step` is accepted but never used; remove the misleading prop/callers or implement its semantics. |
| [settings preview](./src/components/tutorial/SettingsPreview.tsx#L44) | Unused map index `i`. |
| [month label](./src/lib/i18n.tsx#L356) | Unused `lang` argument in the English-only implementation; simplify callers if compatibility permits. |
| [HTML converter](./src/lib/noteContent.ts#L490) | Unused regex callback match argument; retain the positional slot with an intentional unused name. |

Other candidates:

- [Root index.ts](./index.ts#L1) duplicates the configured `expo-router/entry`; package.json does not use it. Confirm there is no external build entry override before deleting it.
- `react-native-svg` has no app-source imports, and `npm explain` reports only the root project as its dependent. Consider removing it and its native autolinking after verifying a native rebuild. `expo-constants`, despite no app-source import, is used by Expo and must not be classified as dead.
- The TypeScript import graph found no unreferenced modules under `src/`. Some exported helpers are only used internally; their exports could become private, but the functions themselves are not dead. Preserve legacy note-conversion code needed by old backups.
- The unsupported `auto-install-peers` setting has been removed from `.npmrc`. Project instructions mention Google Drive/PKCE, but the present source/dependencies contain no such implementation; update that documentation to match reality.

### File removal shortlist

This list identifies source-tree files, rather than code-level unused symbols. It comes from a tracked-file inventory plus searches of package metadata, Expo config, plugin references, routes, and app imports. Remove candidates in a separate cleanup change, then repeat typecheck, Android export, clean prebuild, and native launch checks. The final column names the dependency to check before deletion.

| Candidate | Evidence and removal condition |
| --- | --- |
| [index.ts](./index.ts#L1) | **High confidence.** Its only statement imports `expo-router/entry`, while [package.json](./package.json#L4) already sets that exact package as `main`. No project config points to this file. Check any external EAS/build override before removal. |
| [android-icon-background.png](./assets/android-icon-background.png) | **High confidence for current config.** No source/config reference. [app.json](./app.json#L13) uses `backgroundColor` and `foregroundImage`, and the checked-in Android adaptive-icon XML uses `@color/iconBackground`. Confirm the generated icon after a clean prebuild. |
| [android-icon-monochrome.png](./assets/android-icon-monochrome.png) | **High confidence for current config.** No `monochromeImage` or other source/config reference, and no checked-in Android adaptive-icon XML points to it. Confirm themed icon behavior after a clean prebuild if that capability is intended. |
| [android-icon-foreground.png](./assets/android-icon-foreground.png) | **New candidate after the icon change.** `app.json` now references `android-icon-foreground-personal-hub.png`; no source reference to the old image was found. Confirm a clean prebuild and launcher appearance before removing it. The old `icon.png` is still used by Settings and must be kept. |
| [splash-icon.png](./assets/splash-icon.png) | **Investigate first.** No explicit app/config/plugin reference was found, but Expo's generated splash behavior should be checked with a clean prebuild before deciding whether the source asset is unused. Do not remove solely on the text search. |

`react-native-svg` is a **dependency removal candidate**, not a project file. Removing it changes native autolinking, so check clean Android and iOS builds first. The unsupported `auto-install-peers=true` line in [.npmrc](./.npmrc:1) has been removed; the file retains `legacy-peer-deps=true`.

**Keep:** `src/components/ui/table.tsx` is imported by MonthlySummarySection; `version.json` is written and committed by the version script; the rich-text patch is applied by `postinstall`; `assets/splash-dark.png` is consumed by the dark-splash plugin; `assets/fonts/uicons-regular-rounded.ttf` and `src/constants/uicons.ts` are used by AppIcons; `assets/favicon.png` is referenced by Expo web config; `android/app/debug.keystore` is referenced by Gradle. Generated native resources under `android/app/src/main/res/` remain necessary for the checked-in Android build unless the whole release workflow is changed to regenerate them first.

## Optimizations worth doing

1. **Paginate note queries and bound checklist previews.** `loadNotes` fetches every note and `attachChecklistItems` fetches every checklist item for all returned notes. FlatList only virtualizes rendering, not data loading. Cards display six active items plus counts, so return a bounded preview and aggregates; fetch full items only in the editor. Use stable ordering and chunk/limit the `IN` query.
2. **Virtualize growing collections.** Custom expenses render with `.map` inside the budget ScrollView. Expanded checked checklist items render with `.map` in a draggable-list footer. Large collections bypass virtualization and multiply render work. Use a suitable FlatList/sectioned list while preserving keyboard/reordering behavior.
3. **Subset the icon font.** The Android export includes a 1.1 MB Uicons font. The generator copies the complete decompressed font although its map contains only 50 app icons. Subset to the mapped glyphs while preserving font metadata and attribution. The extra 967 KB Material Symbols font comes from Expo Router infrastructure; inspect its actual requirements before trying to remove it.
4. **Reuse shared month calculations.** MonthlySummarySection repeats substantial logic already in `computeMonthSummary`. Reusing the domain computation reduces UI drift and makes financial fixes apply consistently. Optimize correctness before micro-performance.
5. **Expand regression and release checks.** `npm run audit:regression` now covers the highest-risk data paths with mocked native APIs; add native integration and backup round-trip tests. Existing release CI builds without running the typecheck/lint gates in BuildRelease.bat; add those gates to CI. Keep native signing changes persistent across prebuild and review the release plugin's first-`release`-block regex, which can select `signingConfigs.release` instead of `buildTypes.release`.

## Original audit verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed. |
| `npx expo config --type public` | Passed. |
| `npm audit --json` | Reported 0 known vulnerabilities across 969 dependencies; not proof of application security. |
| `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` | Failed with the five diagnostics listed above. |
| `npx expo install --check` | Online attempt blocked by network/proxy `ECONNREFUSED`; offline fallback says dependencies are up to date but explicitly warns validation is unreliable offline. |
| Android production Metro/Hermes export, 1 worker | Passed: 2,068 modules, 5.1 MB HBC bundle, 33 assets. Initial sandbox attempts failed with Windows `spawn EPERM`; permitted retry succeeded. This is not a Gradle APK build. |
| Isolated actual-source SQLite fixture checks | Nine issue reproductions passed; native/file/storage APIs mocked. |
| Android emulator inventory | Existing `test_avd` booted as `emulator-5554` (Android 35). Installed app is debug version 1.9.7, older than this repository's 1.19.6. `run-as` confirmed `files/SQLite/app_data`, `app_data-wal`, and `app_data-shm`, providing device evidence for finding 1's database path. No database rows were read or changed. The emulator was subsequently stopped at the user's request. |
| Current-version native APK build | Attempted `:app:assembleDebug --offline`; failed during dependency resolution because `com.android.tools.build:gradle:4.2.2`, required by `react-native-keyboard-controller`, was absent from the local cache. This does not establish whether an online build succeeds. No current-version APK was installed. |
| Git status and diff hygiene | Application source remained unchanged; the requested audit document and `.gitignore` exception were added afterward. |

No current-version Android/iOS device run, successful native APK/iOS build, runtime Metro warning audit, OS backup transfer test, or authenticated update-server test was performed.

The original reproductions were made with disposable in-memory SQLite fixtures and mocked native APIs. The in-repository [regression checks](./scripts/audit-regression.cjs) retain and extend those cases; run them with `npm run audit:regression`.

## Remediation verification

| Check | Result |
| --- | --- |
| `npm run audit:regression` | Passed 16 source-level regressions using disposable in-memory SQLite and mocked native APIs, including checklist drop/save timing, duplicate saves, write failure/retry, reordered-item persistence/rollback, the v6 migration and seed race. |
| `npm run typecheck` | Passed. |
| `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` | Passed. |
| `npm run lint` | Passed. |
| `npx expo config --type public` | Passed. |
| Android backup XML check | Parsed both checked-in XML files and confirmed all three sensitive `file` paths are excluded in each applicable rule block. |
| Android production Metro/Hermes export | Passed: 2,068 modules and a 5.1 MB HBC bundle. The first sandbox attempt hit Windows `spawn EPERM`; the permitted retry completed. This is not a native APK build. |
| `python scripts/sqlite-fts-close-repro.py` | Windows host SQLite 3.45.3: Expo's statement-sweep algorithm finalized six FTS internal statements, then connection close terminated the child process with native heap corruption (exit 3221226356). The same in-memory trigger/update/commit flow without the sweep closed successfully (exit 0). This is a cleanup-algorithm reproduction, not an Android/iOS app run. |

Still needed: native upgrade/device checks for migration and tutorial behavior, an Android OS backup/restore check, an iOS backup-policy decision, and investigation of existing orphan expenses. Unsaved-note navigation, budget refresh/background handling, the controlled settings race test, and measured performance work remain open.
