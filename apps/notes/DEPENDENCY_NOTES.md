# Dependency compatibility

Notes uses Expo SDK 58, React Native 0.88 and `react-native-enriched-html` 1.2.
Keep native packages aligned with `expo/bundledNativeModules.json` when upgrading.

Security overrides in `package.json`:

- DOMPurify 3.4.17 replaces the editor's pinned vulnerable sanitizer.
- Glob 14.0.3 fixes cancelled filesystem traversal and uses the fixed matcher.
- Minimatch 11.0.3 replaces vulnerable copies in Expo and lint tooling.

The checked-in patches are applied by `postinstall`:

- Minimatch: retain its fixed matching engine and named exports, while restoring
  the callable CommonJS entry point used by ESLint 9 and its plugins.
- ESLint import plugin: use `Minimatch.match` instead of the removed `makeRe`
  API in `no-internal-modules`. This avoids converting patterns to regular expressions.
- Draggable FlatList: schedule resets without the removed `InteractionManager` API.
- Enriched HTML: preserve the Android checkbox hit area, gesture ownership,
  drag cancellation and selection collapse behavior.

`npm run validate` checks the lint compatibility paths and file discovery along
with app regressions. `npm run bundle:check`, Expo Doctor and a native Android
build also validate the overrides. Revisit them when upstream consumers adopt
the fixed versions; do not remove a patch without checking its remaining callers.

The Windows CMake config plugin limits generated object paths to avoid Ninja's
path-length failures in this checkout. It survives native project regeneration.
Windows builds also require Ninja 1.12 or newer; Android's CMake 3.22.1 may bundle
Ninja 1.10.2, which cannot handle some generated native paths. See the
[Reanimated Windows build guide](https://docs.swmansion.com/react-native-reanimated/docs/guides/building-on-windows/).
