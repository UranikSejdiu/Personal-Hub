# New Architecture Migration — Personal Hub

## Key Finding

**The New Architecture is already active.** Expo SDK 57 (React Native 0.86) makes the New Architecture mandatory — it cannot be disabled. The `newArchEnabled: false` settings in our config are **silently ignored** and are dead code.

This document covers cleanup, fixes, and verification.

---

## Current State

| Setting | Value | Status |
|---------|-------|--------|
| Expo SDK | 57.0.18 | Latest |
| React Native | 0.86.3 | New Architecture mandatory |
| React | 19.2.3 | Compatible |
| `app.json` → `newArchEnabled` | Removed | ✅ Cleaned up |
| `withGradleProperties.js` → `newArchEnabled` | Removed | ✅ Cleaned up |
| `babel.config.js` | worklets plugin added | ✅ Fixed |
| Dependencies | All updated | ✅ Compatible |
| expo-doctor | 19/21 pass | ✅ Non-breaking warnings only |
| TypeScript | Clean | ✅ No errors |

---

## Changes Required

### 1. Fix babel.config.js (CRITICAL) ✅ DONE

**File:** `babel.config.js`

Reanimated 4 and NativeWind 4.2+ depend on `react-native-worklets`. The Babel plugin MUST be added as the last plugin.

```js
// BEFORE
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};

// AFTER
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: ["react-native-worklets/plugin"],
  };
};
```

**Why:** Without this plugin, workletized code (Reanimated animations, NativeWind CSS interop) silently fails at runtime with cryptic errors.

### 2. Clean up dead `newArchEnabled: false` ✅ DONE

**File:** `app.json` — removed `newArchEnabled` field entirely (not recognized in SDK 57 schema)

**File:** `plugins/withGradleProperties.js` — removed the `"newArchEnabled": "false"` line

### 3. Update dependencies to SDK 57 compatible versions ✅ DONE

Updated via `npm install`:
- `expo-linking` → ~57.0.9
- `expo-router` → ~57.0.20
- `expo-secure-store` → ~57.0.3
- `expo-sharing` → ~57.0.18
- `expo-build-properties` → ~57.0.17
- `react-native-svg` → 15.15.4

### 4. Verify with expo-doctor ✅ DONE

Result: 19/21 checks pass. 2 remaining warnings are non-breaking:
- `splash` field is deprecated in SDK 57 but still works (backward compat)
- Non-CNG project warning is informational

---

## Dependency Compatibility Matrix

| Dependency | Version | New Arch Status | Action |
|------------|---------|----------------|--------|
| react-native-gesture-handler | ~2.32.0 | ✅ Supported | None |
| react-native-reanimated | 4.5.1 | ✅ New Arch ONLY | Add worklets plugin |
| react-native-worklets | ^0.10.1 | ✅ New Arch ONLY | Add Babel plugin |
| react-native-safe-area-context | ~5.7.0 | ✅ Supported | None |
| react-native-screens | ~4.26.0 | ✅ Supported | None |
| nativewind | ^4.2.6 | ✅ Supported | Ensure >= 4.2.5 |
| react-native-css-interop | ^0.2.6 | ✅ Supported | Ensure >= 0.2.5 |
| sonner-native | ^0.27.0 | ✅ New Arch ONLY | None |
| react-native-enriched-html | ^1.1.1 | ✅ New Arch ONLY | None |
| react-native-draggable-flatlist | ^4.0.3 | ⚠️ Partial | Watch for flickering |
| react-native-svg | ^15.15.5 | ✅ Supported | None |
| @react-native-async-storage/async-storage | ^2.2.0 | ✅ TurboModule | Clean rebuild if null |
| expo-router | ^57.0.17 | ✅ Supported | Watch iOS boot race |
| expo-sqlite | ~57.0.2 | ✅ TurboModule | None |
| expo-secure-store | ~57.0.2 | ✅ Supported | None |
| expo-haptics | ~57.0.2 | ✅ Supported | None |
| expo-file-system | ~57.0.6 | ✅ Supported | None |
| expo-sharing | ~57.0.16 | ✅ Supported | None |
| expo-document-picker | ^57.0.1 | ✅ Supported | None |
| expo-intent-launcher | ^57.0.1 | ✅ Supported | None |
| expo-application | ^57.0.2 | ✅ Supported | None |
| expo-linking | ^57.0.8 | ✅ Supported | None |
| lucide-react-native | ^0.511.0 | ✅ JS-only | None |
| @expo/vector-icons | ^15.1.1 | ✅ JS-only | None |
| clsx | ^2.1.1 | ✅ JS-only | None |
| tailwind-merge | ^3.6.0 | ✅ JS-only | None |

---

## Known Issues to Monitor

### 1. react-native-draggable-flatlist flickering
- **Issue:** Flickering/glitching on drag-end with New Architecture
- **Workaround:** Include `index` in `keyExtractor`: `` `${item.id}-${index}` ``
- **Used in:** Budget app (category reordering)

### 2. expo-router Tabs/Stacks boot race (iOS)
- **Issue:** iOS Release builds can hang on splash screen with nested Tabs/Stacks
- **Workaround:** Flatten tab screen structure if this occurs
- **Status:** Debug builds unaffected

### 3. AsyncStorage null errors
- **Issue:** `NativeModule: AsyncStorage is null` in bridgeless mode
- **Fix:** Clean rebuild (`gradlew clean`, `pod install`, cache reset)

### 4. Hermes V1 memory increase
- **Issue:** Reanimated 4 imports cause ~25-30% memory increase
- **Fix:** Already resolved in expo@57.0.9+ (we're on 57.0.18)

---

## Testing Checklist

### Build Verification ✅ DONE (2026-09-10)
- [x] `npx expo-doctor@latest` passes (19/21, 2 non-breaking warnings)
- [x] `npx expo prebuild --clean` completes successfully
- [x] Android build succeeds (`npx expo run:android` — BUILD SUCCESSFUL on test_avd emulator)
- [x] App launches without crash, Metro bundles successfully
- [ ] iOS build succeeds (`npx expo run:ios`) — needs macOS, test via EAS when available

### Core Features
- [ ] App launches without crash
- [ ] Splash screen displays and hides
- [ ] Navigation between all tabs works
- [ ] Hardware back button (Android) works
- [ ] Swipe gestures work

### Budget App
- [ ] Categories load
- [ ] Add/edit/delete category works
- [ ] Drag-to-reorder categories works (no flickering)
- [ ] Transactions load
- [ ] Add/edit/delete transaction works
- [ ] Search works
- [ ] Summary stats display
- [ ] Export/import works

### Dhikr App
- [ ] Dhikr list loads
- [ ] Counter works (tap, haptic feedback)
- [ ] Reset works
- [ ] Settings work
- [ ] Animations are smooth

### Notes App
- [ ] Notes list loads
- [ ] Create new note works
- [ ] Edit note works (title, content, color)
- [ ] Rich text formatting works (bold, italic, etc.)
- [ ] Checkbox list works
- [ ] Search works
- [ ] Pin/unpin works
- [ ] Delete works
- [ ] Color picker works

### Settings
- [ ] Theme switching works (Light, Dark, Tawheed Dark)
- [ ] Language switching works (Albanian, English)
- [ ] Accent color switching works

### Dark Mode
- [ ] All screens render correctly in Dark mode
- [ ] All screens render correctly in Tawheed Dark mode
- [ ] Text contrast is adequate
- [ ] No hardcoded colors breaking theme

### Error States
- [ ] No red/yellow box errors in development
- [ ] Empty states display correctly
- [ ] Error states display correctly
- [ ] Loading states display correctly

---

## Rollback Plan

If critical issues are found after cleanup:

1. Revert `babel.config.js` changes
2. Revert `app.json` changes
3. Revert `withGradleProperties.js` changes
4. Run `npx expo prebuild --clean`

Note: Since the New Architecture is already active, reverting these changes won't change runtime behavior — it only restores misleading configuration.

---

## Post-Migration: Lexical + DOM Components

Once the New Architecture is verified working:

1. Install dependencies:
   ```bash
   npx expo install react-dom react-native-web @expo/metro-runtime
   npm install lexical @lexical/react @lexical/list
   ```

2. Create DOM Component editor:
   - `src/components/dom/LexicalEditor.tsx` (with `'use dom'` directive)
   - Native wrapper with toolbar, color picker, save/load

3. Bridge native functions:
   - `saveNote` — save to expo-sqlite
   - `loadNote` — load from expo-sqlite
   - `triggerHaptic` — haptic feedback

4. Implement Google Keep features:
   - Checkbox with strikethrough + opacity
   - Drag-to-reorder (custom touch implementation)
   - Color themes

---

## References

- [Expo New Architecture Guide](https://docs.expo.dev/guides/new-architecture)
- [React Native 0.82 Blog](https://reactnative.dev/blog/2025/10/08/react-native-0.82)
- [Reanimated v4 Getting Started](https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/getting-started)
- [Expo DOM Components](https://docs.expo.dev/guides/dom-components)
- [Lexical Documentation](https://lexical.dev)
