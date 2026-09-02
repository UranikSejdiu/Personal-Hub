# Bug: Dark theme renders white background after theme refactor

## Reported symptom
After the theme refactor (remove Tawheed, apply vibrant blue accent), the **Dark** theme shows a **white background**. Both Light and Dark are affected in that Dark no longer applies dark surfaces.

## Root cause
The app drives NativeWind colors (`bg-background`, `text-foreground`, etc.) from CSS variables defined in `global.css`, applied via a class on the root view in `app/_layout.tsx`:

```tsx
<View className={theme} style={{ flex: 1 }}>   // theme = "light" | "dark"
```

NativeWind resolves `bg-background` → `var(--background)`. The variable comes from:
- `:root { --background: 0 0% 100%; }`  → white (light default)
- `.dark { --background: 240 10% 3.9%; }` → near-black (dark)

When `theme === "dark"`, the root view gets `className="dark"`, which should redefine `--background` for that subtree so `bg-background` becomes dark.

**The `.dark { ... }` block was deleted from `global.css`** during the Tawheed removal (it was removed together with the `.tawheed { ... }` block). So `.dark` no longer defines any variables. As a result, every `bg-background`/`text-foreground` falls back to the `:root` (white) values → Dark mode renders white.

Confirmed: `global.css` currently ends at line 46 with the `:root` block closed; there is **no `.dark` block**.

## Fix (NOT yet applied)
Re-add the `.dark` block to `global.css` (keeping Tawheed removed), with the vibrant blue primary:

```css
.dark {
  --background: 240 10% 3.9%;
  --foreground: 0 0% 98%;
  --card: 240 10% 3.9%;
  --card-foreground: 0 0% 98%;
  --primary: 221 83% 53%;
  --primary-foreground: 0 0% 100%;
  --secondary: 240 3.7% 15.9%;
  --secondary-foreground: 0 0% 98%;
  --muted: 240 3.7% 15.9%;
  --muted-foreground: 240 5% 64.9%;
  --accent: 240 3.7% 15.9%;
  --accent-foreground: 0 0% 98%;
  --destructive: 0 93.2% 58%;
  --destructive-foreground: 0 0% 98%;
  --success: 142 71% 45%;
  --success-foreground: 0 0% 98%;
  --surface: 240 3.7% 15.9%;
  --border: 240 3.7% 15.9%;
  --input: 240 3.7% 15.9%;
  --ring: 240 4.9% 83.9%;
}
```

This must remain in sync with the JS palette in `src/constants/theme.ts` (`COLORS.dark`) — which still correctly defines the dark values, so only `global.css` is missing the block.

## Files involved
- `global.css` — `.dark` block deleted (the bug). Needs the block restored.
- `app/_layout.tsx` — applies `className={theme}`; correct, no change needed.
- `src/constants/theme.ts` — `COLORS.dark` correct; no change needed.
- `src/lib/theme.tsx` — `THEMES` no longer has Tawheed; correct.

## Verification after fix
- Run `npx tsc --noEmit` (no change expected, but sanity check).
- Visually: toggle Dark in Settings → background/foreground/cards should be dark; only `primary` surfaces (buttons, active pill-tab, checkboxes, progress bars) should be blue.
- Confirm Light is unchanged.
