const { withAppBuildGradle } = require("expo/config-plugins");

// Signing persists across prebuild. CI never falls back to the debug key.
module.exports = config => withAppBuildGradle(config, cfg => {
  const marker = "// Tasks release signing";
  // This is the final app Gradle plugin; replace its own appended block so
  // no-clean prebuilds also pick up signing configuration changes.
  cfg.modResults.contents = cfg.modResults.contents.replace(/\n\/\/ Tasks release signing[\s\S]*$/, "");
  cfg.modResults.contents += `
${marker}
def tasksKeystore = rootProject.file('../credentials/release-keystore.jks')
def tasksPropertiesFile = rootProject.file('../credentials/keystore.properties')
def tasksProperties = new Properties()
if (tasksPropertiesFile.exists()) {
    tasksPropertiesFile.withInputStream { tasksProperties.load(it) }
}
def tasksSigned = tasksKeystore.exists() && tasksProperties['STORE_PASSWORD'] &&
        tasksProperties['KEY_ALIAS'] && tasksProperties['KEY_PASSWORD']
// Check the resolved graph so lint and other analysis can run without a release key.
gradle.taskGraph.whenReady { graph ->
    def packagesRelease = graph.hasTask(':app:packageRelease') || graph.hasTask(':app:signReleaseBundle')
    if (packagesRelease && !tasksSigned) {
        throw new GradleException('Release packaging requires credentials/release-keystore.jks and keystore.properties')
    }
}
if (tasksSigned) {
    android.signingConfigs.create('tasksRelease') {
        storeFile tasksKeystore
        storePassword tasksProperties['STORE_PASSWORD']
        keyAlias tasksProperties['KEY_ALIAS']
        keyPassword tasksProperties['KEY_PASSWORD']
    }
    android.buildTypes.release.signingConfig = android.signingConfigs.tasksRelease
}
`;
  return cfg;
});
