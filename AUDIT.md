# Notes App — Audit & Pending Fixes

**Date:** Sep 9 2026
**Version:** v1.9.5

---

## Original Issues (from user)

### 1. Editor scroll — can't see cursor when typing long content
- **Root cause:** `EnrichedTextInput` has `scrollEnabled={false}` and is wrapped in a React Native `ScrollView` that has no cursor-position awareness
- **Fix:** Set `scrollEnabled={true}`, remove wrapping `ScrollView`, keep header/toolbar fixed
- **File:** `app/(notes)/editor.tsx` lines 216, 270-283

### 2. Checkbox text overlapping
- **Root cause:** Inline `style={{ minHeight: 200, padding: 16, fontSize: 14 }}` conflicts with library's internal paragraph styles for checkbox items
- **Fix:** Move `padding` out of inline `style`, add `htmlStyle={{ ulCheckbox: { boxSize: 22, gapWidth: 12, marginLeft: 12 } }}`
- **File:** `app/(notes)/editor.tsx` lines 269-283

---

## Audit Findings

### High Priority

| # | File | Line(s) | Issue |
|---|------|---------|-------|
| 1 | `app/_layout.tsx` | 74-83 | `initDatabase()` error silently swallowed — app freezes permanently on splash with no recovery |
| 2 | `app/(budget)/budget.tsx` | 120-127, 349 | Infinite loading skeleton after load error — no error state, no retry |
| 3 | `app/(notes)/index.tsx` | 83-88 | No error handling on `loadNotes()`/`searchNotes()` — unhandled rejections |
| 4 | `app/(notes)/editor.tsx` | 141-157 | `contentHtml` fallback in `handleSave` is stale after user edits — potential data loss |

### Medium Priority

| # | File | Line(s) | Issue |
|---|------|---------|-------|
| 5 | `app/(notes)/index.tsx` | 91-98 | Double data load on mount (`useEffect` + `useFocusEffect` both fire) |
| 6 | `app/(notes)/index.tsx` | 81-98 | No debounce on search — fires DB query per keystroke |
| 7 | `app/(notes)/editor.tsx` | 141-157 | No double-tap guard on Save — can create duplicate notes |
| 8 | `app/(dhikr)/index.tsx` | 115-129 | Race condition: optimistic revert on tap 1 overwrites tap 2's state |
| 9 | `src/lib/theme.tsx` | 52, 57 | `SecureStore.setItem` fire-and-forget — theme persistence can silently fail |
| 10 | `app/(budget)/_layout.tsx` | 22-28 | Multiple unhandled promises in `loadSavingsGoal().then()` |
| 11 | `src/lib/db.ts` | 115, 121 | `db` assigned before migration completes — partial schema on failure |
| 12 | `src/hooks/useHaptics.ts` | 7-11 | `cachedEnabled` defaults to `true` before settings load — haptic fires on cold launch even if disabled |

### Low Priority

| # | File | Line(s) | Issue |
|---|------|---------|-------|
| 13 | `app/(notes)/index.tsx` | 59 | Pin icon color ternary — both branches return `undefined` (dead code) |
| 14 | `app/(notes)/editor.tsx` | 173 | Delete failure shows "Failed to save" instead of delete-specific message |
| 15 | `app/(notes)/_layout.tsx` | 8-10 | Hardcoded Albanian labels in tab definitions |
| 16 | `app/(budget)/loans.tsx` | 50 | Wrong error message on save failure |
| 17 | `app/(dhikr)/list.tsx` | 270-274 | Navigates away from list after adding a dhikr |
| 18 | `app/(budget)/savings.tsx` | 23 | `todayDate` imported from dhikr module (cross-module coupling) |

---

## Notes Feature — Full Bug List

### Notes List (`app/(notes)/index.tsx`)

- **Double load on mount** (line 91-98): `useEffect` fires `load()`, then `useFocusEffect` also fires `load()` on initial focus. Remove the `useEffect`.
- **No error handling** (line 83-88): `loadNotes()`/`searchNotes()` can throw with no try/catch. Shows empty state with no error feedback.
- **No search debounce** (line 81-98): Each keystroke triggers a new DB query. Add debounce (300ms).
- **Pin icon dead code** (line 59): `color={textColorClass.includes("foreground") ? undefined : undefined}` — both branches return `undefined`.
- **ScrollView + .map()** (line 190): Should use `FlatList` or `FlashList` for virtualization.
- **Missing accessibility** (lines 39-70, 148-172): Note cards, "New Note" button, and clear-search button lack `accessibilityRole`/`accessibilityLabel`.

### Notes Editor (`app/(notes)/editor.tsx`)

- **Stale contentHtml fallback** (line 141-157): `handleSave` falls back to `contentHtml` which is never updated after load. Data loss if `getHTML()` returns null.
- **No double-tap guard on Save** (line 141-157): No `isSaving` state. Quick double-tap creates duplicate notes and calls `router.back()` twice.
- **Delete shows wrong toast** (line 173): Uses `t("saveFailed")` instead of a delete-specific message.
- **Inline style recreated every render** (line 277-282): `style={{ minHeight: 200, padding: 16, ... }}` creates new object reference every render. Should memoize with `useMemo`.
- **9 inline arrow functions in RichTextToolbar** (line 203-214): All callbacks are inline arrows, recreated on every keystroke.
- **Color picker accessibility labels** (line 253): Uses raw enum values (`"default"`, `"yellow"`) instead of translated labels.

### Notes Database (`src/lib/notes.ts`)

- **toNote casts without validation** (line 32-42): `String(null)` returns `"null"` literal. Unsafe cast for `NoteColor`.
- **ensurePlainTextBackfill swallows error** (line 68-73): Original error discarded, replaced with generic message.
- **searchNotes doesn't call backfill** (line 76-84): Searches `plain_text` column without ensuring backfill ran first.

### ConfirmDialog (`src/components/ConfirmDialog.tsx`)

- **onConfirm async rejection unhandled** (line 35-38): `void onConfirm()` discards promise. If async operation throws after dialog closes, unhandled rejection.
- **No disabled/loading state on confirm button** (line 80-88): Can double-tap delete confirm.

---

## Dhikr Feature — Bugs

| # | File | Line(s) | Severity | Issue |
|---|------|---------|----------|-------|
| 1 | `app/(dhikr)/index.tsx` | 115-129 | High | Race condition: optimistic revert on tap 1 overwrites tap 2's state |
| 2 | `app/(dhikr)/index.tsx` | 41-51 | Medium | No error handling on `refresh()` — stale data on failure |
| 3 | `app/(dhikr)/index.tsx` | 88-102 | Low | Side effect inside React state updater (`justHitLimit` mutation) |
| 4 | `app/(dhikr)/list.tsx` | 154 | Medium | `void loadDhikrs().then(setDhikrs)` — no `.catch()` |
| 5 | `app/(dhikr)/list.tsx` | 270-274 | Low | Navigates away from list after adding dhikr |
| 6 | `app/(dhikr)/list.tsx` | 236-251 | Low | `listHeader` not memoized in DraggableFlatList |
| 7 | `src/lib/dhikrSelection.ts` | — | Low | Stale selected ID persists after dhikr deletion |
| 8 | `src/components/DhikrModal.tsx` | 77 | Medium | Hardcoded `text-red-500` instead of theme-aware `text-destructive` |

---

## Budget Feature — Bugs

| # | File | Line(s) | Severity | Issue |
|---|------|---------|----------|-------|
| 1 | `app/(budget)/budget.tsx` | 120-127, 349 | High | Infinite loading skeleton after load error |
| 2 | `app/(budget)/budget.tsx` | 208-215, 251-257 | High | Unhandled promises in `handleIncomeChange` and `handleAddExpense` |
| 3 | `app/(budget)/budget.tsx` | 63-72 | High | Timer not cleared on month change — premature save indicator clear |
| 4 | `app/(budget)/budget.tsx` | 279-307 | Medium | Recurring template race: toggling OFF removes template by category+amount match |
| 5 | `app/(budget)/budget.tsx` | 310-326 | Medium | Stale closure in `handleRemoveExpense` |
| 6 | `app/(budget)/budget.tsx` | 188-196 | Low | Cleanup effect can't await async flush on unmount |
| 7 | `app/(budget)/loans.tsx` | 28-34 | Medium | `loadLoans` depends on `t` — refetches on language change |
| 8 | `app/(budget)/loans.tsx` | 50 | Low | Wrong error message on save failure |
| 9 | `app/(budget)/loans.tsx` | 81 | Low | `isCcPaid` logic may be incorrect |
| 10 | `app/(budget)/savings.tsx` | 23 | Medium | `todayDate` imported from dhikr module (cross-module coupling) |
| 11 | `app/(budget)/savings.tsx` | 69-99, 101-103 | Medium | `loadData` depends on `t` — refetches on language change |
| 12 | `app/(budget)/index.tsx` | 86-100 | Medium | `confirmDelete` partial failure — no transaction wrapping |
| 13 | `src/lib/budget.ts` | 93-110 | Medium | Read-then-write race in `incrementLoanMonthsPaid`/`incrementCcMonthsPaid` |

---

## Core Infrastructure — Bugs

| # | File | Line(s) | Severity | Issue |
|---|------|---------|----------|-------|
| 1 | `app/_layout.tsx` | 74-83 | High | `initDatabase()` error silently swallowed — app freezes on splash |
| 2 | `src/lib/db.ts` | 115, 121-124 | Medium | `db` assigned before migration completes — partial schema on failure |
| 3 | `src/lib/theme.tsx` | 52, 57 | Medium | `SecureStore.setItem` fire-and-forget — theme persistence can fail silently |
| 4 | `src/hooks/useHaptics.ts` | 7-11 | Medium | `cachedEnabled` defaults to `true` before settings load |
| 5 | `src/hooks/useHaptics.ts` | 26-60 | Low | Haptic functions return unhandled promises on error |
