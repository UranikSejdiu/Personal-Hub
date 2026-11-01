const { withProjectBuildGradle } = require("expo/config-plugins");

// Ninja bundled with Android's CMake can hit MAX_PATH in a deep Windows checkout.
// Let CMake hash long object paths before they reach the filesystem limit.
module.exports = config => withProjectBuildGradle(config, cfg => {
  const begin = "// @generated begin dhikr-windows-cmake-paths";
  const end = "// @generated end dhikr-windows-cmake-paths";
  let contents = cfg.modResults.contents.replace(/\/\/ @generated begin dhikr-windows-cmake-paths[\s\S]*?\/\/ @generated end dhikr-windows-cmake-paths\r?\n?/, "");
  const anchor = 'apply plugin: "expo-root-project"';
  if (!contents.includes(anchor)) throw new Error("Unexpected Expo root Gradle template");
  // React's root plugin evaluates :app immediately. Register this before it
  // runs, while the application's Android DSL can still be configured.
  const block = `${begin}
if (System.getProperty('os.name').toLowerCase().contains('windows')) {
    subprojects { nativeProject ->
        ['com.android.application', 'com.android.library'].each { androidPlugin ->
            nativeProject.plugins.withId(androidPlugin) {
                nativeProject.android.defaultConfig.externalNativeBuild.cmake.arguments '-DCMAKE_OBJECT_PATH_MAX=240'
            }
        }
    }
}
${end}
`;
  contents = contents.replace(anchor, block + anchor);
  cfg.modResults.contents = contents;
  return cfg;
});
