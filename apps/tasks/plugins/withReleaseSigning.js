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
if ((System.getenv('CI') == 'true' || gradle.startParameter.taskNames.any { it.toLowerCase().contains('release') }) && !tasksSigned) {
    throw new GradleException('Tasks CI builds require credentials/release-keystore.jks and keystore.properties')
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
