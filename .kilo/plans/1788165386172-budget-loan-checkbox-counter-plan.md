# Remove Tawheed theme + apply vibrant shared blue accent

## Goal
1. Drop the **Tawheed** theme entirely; keep only **Light** and **Dark**.
2. Apply one shared vibrant accent hue (blue `hsl(221, 83%, 53%)`) as the `primary` color in **both** remaining themes. `success`/`destructive`/`secondary`/`muted` stay as-is (neutral surfaces, existing status colors).

Both theme systems in this repo must be kept in sync:
- JS palette: `src/constants/theme.ts` (`COLORS`) used via `useThemeColors()`.
- CSS variables: `global.css` `:root` / `.dark` used by NativeWind classes (`bg-primary`, `text-foreground`, …). Applied to the root view via `<View className={theme}>` in `app/_layout.tsx:20`.

## Changes

### 1. `src/constants/theme.ts`
- Remove the `tawheed: { … }` block from `COLORS`.
- Set `COLORS.light.primary = "hsl(221, 83%, 53%)"` and `COLORS.light.primaryForeground = "hsl(0, 0%, 100%)"`.
- Set `COLORS.dark.primary = "hsl(221, 83%, 53%)"` and `COLORS.dark.primaryForeground = "hsl(0, 0%, 100%)"`.
- Change `export type ThemeName = "light" | "dark" | "tawheed";` → `export type ThemeName = "light" | "dark";`.

### 2. `src/lib/theme.tsx`
- Remove `{ value: "tawheed", labelKey: "themeTawheed" }` from the `THEMES` array.
- In `ThemeProvider` initial state, migrate legacy stored value: if `stored === "tawheed"` treat it as `"dark"` (Tawheed was a dark theme) so existing users don't fall back to system scheme unexpectedly. i.e. `if (stored === "light" || stored === "dark") return stored; if (stored === "tawheed") return "dark"; return systemScheme === "dark" ? "dark" : "light";`

### 3. `global.css`
- `:root` (light): `--primary: 221 83% 53%;` and `--primary-foreground: 0 0% 100%;`
- `.dark`: `--primary: 221 83% 53%;` and `--primary-foreground: 0 0% 100%;`
- Delete the entire `.tawheed { … }` block (lines ~76–94+).

### 4. Notes screens
- `app/(notes)/index.tsx:21` and `app/(notes)/editor.tsx:29`: change
  `const isDark = theme === "dark" || theme === "tawheed";` → `const isDark = theme === "dark";`

### 5. `src/lib/i18n.tsx` (cleanup, optional but recommended)
- Remove `themeTawheed: "Tavhid (errët)"` (sq ~line 153) and `themeTawheed: "Tawheed (dark)"` (en ~line 446).

### 6. `src/components/SettingsScreen.tsx` (minor)
- Theme selector already maps over `THEMES`, so it auto-drops Tawheed.
- Update the cast on line ~251 from `"themeLight" | "themeDark" | "themeTawheed"` → `"themeLight" | "themeDark"`.

## No change needed
- `app/_layout.tsx`: `className={theme}` already resolves to `light`/`dark` classes; Tawheed never reaches it after migration.
- `NOTE_COLORS`: uses Tailwind `dark:` variants, unaffected.

## Risks / edge cases
- Ensure no code path can leave `theme === "tawheed"` at runtime (would make `COLORS[theme]` undefined → crash). The migration in step 2 prevents this; verify `setTheme` is only ever called with `"light"`/`"dark"` (the selector renders only those).
- Confirm `PillNav` active-tab indicator uses `primary` (it should turn blue) — expected vibrant effect.
- Contrast: white `primaryForeground` on blue `primary` meets WCAG AA for buttons/checkboxes.

## Validation
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- Manual: open Settings → theme selector shows only Light/Dark. Toggle each; verify primary surfaces (buttons, active PillNav tab, checkboxes, progress bars, rings, update badge) render blue in both themes. Confirm Tawheed is no longer selectable and legacy Tawheed users land on Dark.
- Check Light and Dark in both Albanian and English; verify no missing/broken translation keys.
