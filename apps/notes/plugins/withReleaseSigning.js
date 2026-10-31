const { withAppBuildGradle } = require("expo/config-plugins");

// Signing persists across prebuild. CI never falls back to the debug key.
module.exports = config => withAppBuildGradle(config, cfg => {
  const marker = "// Notes release signing";
  // This is the final app Gradle plugin; replace its own appended block so
  // no-clean prebuilds also pick up signing configuration changes.
  cfg.modResults.contents = cfg.modResults.contents.replace(/\n\/\/ Notes release signing[\s\S]*$/, "");
  cfg.modResults.contents += `
${marker}
def notesKeystore = rootProject.file('../credentials/release-keystore.jks')
def notesPropertiesFile = rootProject.file('../credentials/keystore.properties')
def notesProperties = new Properties()
if (notesPropertiesFile.exists()) {
    notesPropertiesFile.withInputStream { notesProperties.load(it) }
}
def notesSigned = notesKeystore.exists() && notesProperties['STORE_PASSWORD'] &&
        notesProperties['KEY_ALIAS'] && notesProperties['KEY_PASSWORD']
if ((System.getenv('CI') == 'true' || gradle.startParameter.taskNames.any { it.toLowerCase().contains('release') }) && !notesSigned) {
    throw new GradleException('Notes CI builds require credentials/release-keystore.jks and keystore.properties')
}
if (notesSigned) {
    android.signingConfigs.create('notesRelease') {
        storeFile notesKeystore
        storePassword notesProperties['STORE_PASSWORD']
        keyAlias notesProperties['KEY_ALIAS']
        keyPassword notesProperties['KEY_PASSWORD']
    }
    android.buildTypes.release.signingConfig = android.signingConfigs.notesRelease
}
`;
  return cfg;
});

