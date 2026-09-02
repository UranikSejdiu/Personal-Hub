AGENTS.md
Uranik's Hub — AI Coding Agent Instructions
IMPORTANT: This file contains the permanent project rules for AI coding agents.
These instructions apply to EVERY task in this repository.
Always read and follow this file before modifying anything.

1. PRIME DIRECTIVE
Do the work properly, not merely quickly.
The goal is not to produce the fastest possible implementation.
The goal is to produce the:
- most correct solution
- cleanest implementation
- safest implementation
- most maintainable code
- least error-prone code
- most consistent implementation with the existing architecture

Always prefer a solution that leaves the codebase better than you found it.

Priority order:
When making engineering decisions, prioritize:
1. Correctness
2. Reliability
3. Data safety
4. Maintainability
5. Architecture consistency
6. Type safety
7. User experience
8. Performance
9. Simplicity
10. Implementation speed

Speed is never a reason to knowingly choose an inferior implementation.

2. ALWAYS INSPECT BEFORE CODING
Never start modifying code based only on the user's description.
Before making changes:
- Locate the relevant files.
- Read the existing implementation.
- Understand how the relevant feature currently works.
- Search for related implementations elsewhere in the repository.
- Identify existing utilities, components, hooks, types, and abstractions.
- Understand how data flows through the application.
- Identify potential side effects.
- Determine the smallest clean architectural change.

Never assume:
- a file exists
- a function works a certain way
- a component is unused
- a dependency is installed
- an API behaves a certain way
- a database schema is unchanged
- a feature is implemented in only one place
Inspect first.

3. SEARCH BEFORE CREATING
Before creating a new:
- component
- hook
- utility
- function
- database helper
- type
- dialog/modal
- form
- navigation screen
- translation key
- styling pattern
search the repository first.

If equivalent functionality already exists: Reuse it.
If the existing implementation is flawed: Improve it rather than duplicating it.

Do not create duplicate implementations (e.g., `ButtonNew.tsx`, `useDB.ts`) without a clear architectural reason.

4. UNDERSTAND THE ARCHITECTURE
The project stack consists of:
- **Framework:** React Native via Expo (Expo SDK 51+)
- **Routing:** Expo Router (File-based app directory navigation)
- **Language:** TypeScript 5+
- **Styling:** NativeWind v4 (Tailwind CSS for React Native) & React Native Reanimated
- **Database / Storage:** Native SQLite (`expo-sqlite`), `expo-secure-store`, `@react-native-async-storage/async-storage`
- **Integrations & Native SDKs:** `expo-file-system`, `expo-sharing`, `expo-haptics`, Google Drive API via `expo-auth-session` (PKCE)
- **Architecture Paradigm:** Offline-first local data architecture for iOS & Android

Important project areas include:
```
app/              # Expo Router screens, layouts, and route handlers
src/
├── components/   # Shared UI components and React Native primitives
├── hub/          # App registry, switching logic, and hub context
├── lib/          # Database helpers, Google Drive sync, native abstractions
└── types/        # TypeScript interfaces and domain definitions
assets/           # Fonts, images, and native static resources
```

The existing hub architecture includes:
- app registration & module switching
- Expo Router tab & stack navigation
- native gesture-driven swipe navigation
- Android hardware back-button handling
- cross-platform theme engine (Light, Dark, Tawheed Dark)

Do not create a parallel architecture when the existing architecture already provides the required functionality.

5. RESPECT EXISTING PROJECT PATTERNS
Consistency is more important than personal preference.
Before introducing a new pattern, inspect how the project already solves similar problems.

Follow existing conventions for:
- component structure
- naming
- file organization
- state management
- database access
- Expo Router layouts
- translations
- styling (`className` via NativeWind)
- error handling
- async operations
- modals & bottom sheets
- forms
- icons (`@expo/vector-icons` or Lucide React Native)
- theme context

Do not introduce a new approach simply because you personally prefer it.
If the existing architecture is genuinely problematic, explain the reason before performing a large architectural change.

6. MINIMAL BUT CORRECT CHANGES
Make the smallest change that correctly solves the problem.
Do not:
- rewrite unrelated files
- refactor unrelated components
- rename unrelated variables
- change formatting across the repository
- upgrade dependencies without reason
- redesign unrelated UI
- restructure the project unnecessarily

However: Do not interpret "minimal change" as "quick hack."
A small change that creates technical debt is worse than a slightly larger change that correctly fixes the underlying problem.

7. FIX ROOT CAUSES
Do not patch symptoms when the root cause can be fixed.

Bad approach:
Error occurs → suppress error → add workaround → move on

Preferred approach:
Error occurs → investigate cause → understand why → fix underlying issue → verify

Never use:
- arbitrary timeouts
- unnecessary retries
- silent catches
- random state updates
- duplicated logic
- forced type casts
just to make an error disappear.

8. TYPESCRIPT RULES
TypeScript must remain strongly typed.
- Never use `any` to hide a problem.
- Avoid `const data: any = ...` and `something as any`.
- Do not use TypeScript assertions (`// @ts-ignore` or `// @ts-expect-error`) unless there is a documented and genuinely unavoidable reason.

If TypeScript reports an error: Fix the underlying type problem.
Prefer:
- explicit types
- type guards
- discriminated unions
- generics
- properly typed APIs
- reusable domain types

Types should represent actual application behavior.

9. REACT NATIVE & REACT RULES
Use React Native components intentionally.
- Use standard React Native primitives (`View`, `Text`, `Pressable`, `ScrollView`, `FlatList`) instead of web DOM elements (`div`, `span`, `p`, `button`).
- Do not use `TouchableOpacity` or `TouchableHighlight` for new components; prefer `Pressable` with proper feedback states.
- Always use `FlatList` or `FlashList` for long lists—never render large collections inside standard `ScrollView`.
- Do not add state because it is convenient. Ask: *Can this value be derived from existing state or props?*
- Do not use `useEffect` merely to calculate derived values.

Avoid:
- inline styling when NativeWind classes apply
- unnecessary re-renders during gestures or list scrolling
- unhandled animation loops on the JS thread (use `react-native-reanimated` worklets)
- missing `keyExtractor` on virtualized lists
- business logic inside JSX

10. COMPONENT DESIGN
Components should have clear responsibilities.
Avoid components that simultaneously contain:
- database queries
- complex mathematical calculations
- file system or backup logic
- Expo Router navigation
- translation logic
- input validation
- deep UI rendering trees

Move domain logic into appropriate modules:
`UI → Domain/data layer → expo-sqlite / native storage`

Do not put complex SQL directly into a presentation component.

11. DATABASE RULES (`expo-sqlite`)
SQLite is a critical part of this application.
Database access should use `expo-sqlite` via the established database abstraction (`src/lib/db/`).
Do not create random database connections throughout the application.

Before changing database behavior:
- Inspect the database helpers and migration logs.
- Inspect the relevant data layer and domain models.
- Find every caller.
- Understand existing schema assumptions.
- Consider existing user data.
- Consider SQLite schema migrations and upgrades.
- Consider failure scenarios.

Never casually destroy user data.
Do not: drop tables, overwrite databases, delete records, or reset data unless explicitly required and safely handled.

12. DATABASE SAFETY
For every database operation, consider:
- **Success:** Does the operation work normally?
- **Empty data:** Does it behave correctly when there are no records?
- **Invalid data:** What happens with malformed or unexpected values?
- **Failure:** What happens if `expo-sqlite` encounters a locked DB or query syntax error?
- **Interruption:** What happens if the app crashes or goes to background during a write?
- **Persistence:** Does the data remain intact across app restarts and Expo builds?
- **Concurrency:** Are read/write transactions handled safely?

Use async transactions (`withTransactionAsync`) for multi-step database mutations.

13. OFFLINE-FIRST RULE
This application is offline-first.
Normal application functionality must continue working without internet access.
- Do not introduce unnecessary network dependencies.
- Do not add remote APIs, telemetry, analytics, cloud databases, or external services unless explicitly requested.

Existing network-dependent functionality includes areas such as Google Drive backups and update checking (`expo-updates`). Do not make unrelated features dependent on these services.

14. EXPO & NATIVE MOBILE RULES
This is a native mobile application compiled via Expo for Android and iOS.
When working with native capabilities:
- `expo-file-system`, `expo-sharing`, `expo-haptics`, `expo-secure-store`, `expo-auth-session`
- Safe Area Insets (`react-native-safe-area-context`)
- Android hardware back button (`BackHandler`)
- iOS swipe gestures & native header behaviors
- App Lifecycle (`AppState` listener for foreground/background shifts)

Always consider actual native mobile behavior on both platforms. Do not assume web browser behavior.

Consider:
- native permission requests and denials
- notch/island safe areas (`useSafeAreaInsets`)
- keyboard avoiding behaviors (`KeyboardAvoidingView` / `react-native-keyboard-controller`)
- device rotation and screen dimensions
- backgrounding/resuming states

15. GOOGLE DRIVE / OAUTH SECURITY
OAuth uses PKCE via `expo-auth-session`.
Never weaken authentication for convenience.
Never:
- expose client secrets
- store access/refresh tokens in unencrypted storage (always use `expo-secure-store`)
- log access or refresh tokens
- commit credentials
- bypass OAuth validation

Handle cancelled authentication, expired tokens, unavailable accounts, network failures, and Drive API errors gracefully.

16. IMPORT / EXPORT / BACKUP SAFETY
Backups and imports involve user data.
- Never blindly replace application data.
- Validate imported files before applying them (e.g., verifying SQLite header signatures via `expo-file-system`).
- Protect against partial failure during restore operations.
- Protect against corrupting the active SQLite database file.
- Refresh global state and UI hooks correctly after restoration.

17. ERROR HANDLING
Errors must be intentional.
Never silently swallow errors (`try { await op(); } catch {}`).
Avoid logging errors without handling them (`catch (error) { console.error(error); }`) unless logging is intentionally part of the application's error strategy.

Errors should be handled, propagated, or converted into user-visible alerts/toast feedback depending on context.

18. ZERO-CONSOLE-ERROR POLICY
Target: zero unexpected warnings or redbox/yellowbox errors.
After making changes, check for:
- JavaScript / TypeScript errors
- Unhandled Promise rejections
- React Native key missing warnings
- NativeWind unhandled class warnings
- VirtualizedList nested inside ScrollView warnings
- React Reanimated thread warnings
- `expo-sqlite` unclosed database handle warnings

Do not consider the task complete simply because the screen renders. Fix warnings at their root cause.

19. ASYNC CODE
Every asynchronous operation must have intentional error behavior.
Avoid floating promises where rejection could become unhandled.
Prefer explicit `await` with appropriate error handling.

For event handlers and native listeners, ensure rejected promises are caught.
Consider: loading states, success, failure, cancellation, duplicate calls, component unmounting, and stale requests.

20. UI / UX PRINCIPLES
The UI should be minimal, modern, clean, consistent, intuitive, responsive, accessible, touch-friendly, and native-feeling on iOS and Android.

Do not add visual complexity without a UX reason.
Prefer:
- clear typographic hierarchy
- natural native tab & stack transitions via Expo Router
- adequate touch target sizes (minimum 44x44pt)
- tactile feedback using `expo-haptics` for meaningful user actions
- smooth, 60/120fps animations driven by NativeWind / Reanimated

Avoid:
- custom scrollbars or web-like UI hacks
- missing active touch states (always show visual feedback on press)
- visual clutter or cramped layouts
- rigid pixel dimensions that break on different screen sizes

21. USE EXISTING UI COMPONENTS
The project uses NativeWind v4 and custom design tokens built on top of React Native primitives.
Before creating a custom UI primitive, check whether an existing component in `src/components/` can be reused.

Prefer existing components for:
- Buttons, Modals, Input Fields, Dropdowns, Cards, Bottom Sheets, Toast/Alerts.

If a component needs customization, extend the existing component's props or variants rather than duplicating it.

22. STYLING (NativeWind v4)
Use Tailwind classes via the `className` prop supported by NativeWind.
Avoid arbitrary CSS/inline objects (`style={{ marginTop: 13 }}`) unless dynamic runtime calculation (e.g., animated values) requires it.
Maintain consistency in spacing, typography, border radii, shadows, and color tokens across all native screens.

23. DARK MODE
The application supports:
- Light
- Dark
- Tawheed Dark

Every UI change must be checked against all supported themes using NativeWind dark mode variants (`dark:`). Ensure text contrast, backgrounds, borders, icons, and input fields render cleanly across all themes without hardcoded hex colors that bypass theme tokens.

24. INTERNATIONALIZATION
The application supports:
- Albanian (`sq`)
- English (`en`)

User-facing text must use the existing i18n translation system (`i18next` / `expo-localization`).
When adding new text:
- Add translation keys to both `sq` and `en` JSON dictionaries.
- Never leave a feature translated in only one language.
- Do not hardcode UI text strings inside components.

25. NAVIGATION (Expo Router)
Use Expo Router for all screen transitions and layout management.
Centralized capabilities include:
- File-based route structure under `app/`
- App switching & registration via `src/hub/`
- Native Tab Bar and Stack Headers
- Hardware Back Button integration on Android
- Route parameter typing and tab memory persistence

When adding a new app or module:
1. Create its screen routes in `app/(hub)/[appId]/`.
2. Define layout options (`Stack.Screen`, `Tabs.Screen`).
3. Register the module metadata in `src/hub/registry.ts`.
4. Add translation strings (`sq`, `en`).
5. Verify navigation, back stack behavior, and tab state persistence.

26. STATE MANAGEMENT
Avoid unnecessary global state.
Before adding global state (Zustand / React Context), confirm whether multiple unrelated screens or modules genuinely need it. Avoid duplicate sources of truth; ensure one authoritative owner for each piece of state.

27. PERFORMANCE
Do not prematurely optimize, but avoid common React Native bottlenecks:
- Rendering un-memoized heavy lists without `FlatList` or `FlashList`
- Executing expensive JS calculations during pan/scroll gestures (use Reanimated worklets)
- Running unindexed queries on large SQLite datasets
- Unnecessary re-renders caused by passing inline objects or functions to list items

Correctness comes before micro-optimizations. Maintain readable code.

28. DEPENDENCIES
Before installing a new npm package:
- Search existing dependencies in `package.json`.
- Check if Expo SDK modules already provide the capability natively.
- Confirm React Native & Expo SDK version compatibility (avoid packages requiring custom un-configured native C++ setup unless compatible with Expo Prebuild).
- Avoid installing heavy web-only libraries into the React Native bundle.

29. SECURITY
Never:
- commit API secrets or private keys
- log sensitive credentials or OAuth tokens
- store tokens in `AsyncStorage` (use `expo-secure-store`)
- disable input validation
- trust external or imported data blindly (Google Drive responses, imported SQLite databases, URL parameters)

30. VALIDATION
Validate data at system boundaries (user input, file imports, local storage, external APIs) using schema validators (e.g., Zod) or typed guards before letting it reach core domain logic.

31. ACCESSIBILITY
Ensure accessible native elements:
- Set `accessible={true}`, `accessibilityLabel`, and `accessibilityRole` on interactive `Pressable` components.
- Ensure dynamic font scaling works without layout clipping (`maxFontSizeMultiplier`).
- Maintain adequate touch target dimensions and high-contrast color pairings.

32. FILE ORGANIZATION
Keep files organized within standard repository structures:
```
app/
├── (auth)/
├── (hub)/
└── _layout.tsx
src/
├── components/
├── hub/
├── lib/
└── types/
plugins/
└── withFilepathsXml.js    # Expo config plugin for native file persistence
```
Do not move existing files around without an architectural reason.

33. PREBUILD & NATIVE FILE PERSISTENCE
`npx expo prebuild --clean` wipes the entire `android/` directory and regenerates it. This deletes any manually added native files (e.g., `filepaths.xml`, custom gradle properties).

**Config plugins** are used to persist native changes across prebuild runs. They are registered in `app.json` under `expo.plugins` and run automatically during prebuild.

Current config plugins:
- `plugins/withFilepathsXml.js` — Generates `android/app/src/main/res/xml/filepaths.xml` during prebuild. Required by `expo-file-system`'s `FileProvider` to generate `content://` URIs for APK install flow.

**Adding new native files:** Instead of manually adding files to `android/`, create a config plugin in `plugins/` that generates or modifies the file during prebuild. Register it in `app.json` plugins array.

**Do NOT use `npx patch-project`** — it fails on Windows with EPERM errors due to Node.js `fs.rename` limitations on Windows directories.

33. REFACTORING RULES
Refactor code when it directly improves the scope of your active task.
Do not refactor unrelated code simply because you encountered it. Keep pull requests and changes focused.

34. GIT / DIFF HYGIENE
Before completing a task, inspect `git diff`:
- Remove `console.log` statements, temporary debug code, and unused imports.
- Ensure no accidental formatting changes occurred in untouched files.

35. DO NOT DESTROY EXISTING FUNCTIONALITY
Inspect existing callers and hidden dependencies before altering shared utilities or components. Preserve existing module behavior unless the task explicitly demands breaking changes.

36. BUILD VERIFICATION
Always run project typechecks and Expo checks before finishing:
```bash
npm run typecheck
# or
npx tsc --noEmit
```
If working on native configurations, verify the Expo configuration:
```bash
npx expo config
```
The project must compile without TypeScript or bundle build errors.

37. TEST THE ACTUAL FEATURE
Verify behavior across expected scenarios:
- **Happy Path:** Expected data & navigation flow.
- **Edge Cases:** Empty data states, malformed input, offline mode, app restart/resume.
- **Environment:** iOS & Android physical/emulator devices, dark/light/Tawheed themes, Albanian/English languages.

38. DEBUGGING PROCESS
Follow a structured flow:
`Reproduce Problem → Locate Root Cause → Fix Underlying Issue → Verify Fix → Check Metro Bundler & Logs`

39. WHEN SOMETHING FAILS
If an implementation fails, analyze the Metro error stack or native logcat/Xcode output directly rather than stacking temporary workarounds or arbitrary timeouts.

40. DO NOT GUESS
Inspect code, types, schema definitions, and Expo module documentation directly rather than guessing function signatures or component props.

41. NO FAKE VERIFICATION
Never state that typechecks, Expo builds, or device tests were run unless they actually were performed and passed.

42. AGENT WORKFLOW
Execute tasks in 7 distinct steps:
1. **Understand:** Read `AGENTS.md` and related source files.
2. **Investigate:** Search for existing implementations and reusable Expo/React Native modules.
3. **Plan:** Identify necessary file changes and risk factors.
4. **Implement:** Write minimal, correct, and architecturally consistent code.
5. **Self Review:** Inspect code quality, typing, and safety.
6. **Verify:** Run TypeScript checks (`npx tsc --noEmit`) and test functional requirements.
7. **Final Cleanup:** Remove temporary code and review `git diff`.

43. FINAL RESPONSE FORMAT
Keep completion summaries concise:
```markdown
Implemented:
- ...
- ...

Verified:
- ...
- ...

Notes:
- ...
```
Only list checks that were genuinely performed.

44. DECISION RULE
Evaluate implementation choices against:
`Correctness > Architecture > Maintainability > Reliability > Data Safety > UX > Performance > Simplicity`

45. ABSOLUTE PROHIBITIONS
Never:
- use `any` or bypass TypeScript without cause
- suppress Metro bundler or native warnings
- leave unhandled promises or floating async calls
- store sensitive tokens in unencrypted `AsyncStorage`
- destroy local SQLite user data unexpectedly
- break offline-first capabilities
- commit untranslated UI strings
- break dark/Tawheed mode contrast

46. QUALITY STANDARD
Ensure your code passes all quality checks:
`Works → Correct → Safe → Architectural → Clean → Strongly Typed → Handled Errors → Theme Compliant → Multi-language → Mobile Performant → Typecheck Clean`

47. FINAL PRINCIPLE
Ask: *"What is the cleanest, safest, most maintainable way to solve this correctly within the existing Expo / React Native architecture?"*

**Inspect → Understand → Plan → Implement → Review → Test → Clean → Verify**
