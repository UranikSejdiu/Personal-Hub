const { withAppBuildGradle } = require("expo/config-plugins");

// Signing persists across prebuild. CI never falls back to the debug key.
module.exports = config => withAppBuildGradle(config, cfg => {
  const marker = "// Budget release signing";
  // This is the final app Gradle plugin; replace its own appended block so
  // no-clean prebuilds also pick up signing configuration changes.
  cfg.modResults.contents = cfg.modResults.contents.replace(/\n\/\/ Budget release signing[\s\S]*$/, "");
  cfg.modResults.contents += `
${marker}
def budgetKeystore = rootProject.file('../credentials/release-keystore.jks')
def budgetPropertiesFile = rootProject.file('../credentials/keystore.properties')
def budgetProperties = new Properties()
if (budgetPropertiesFile.exists()) {
    budgetPropertiesFile.withInputStream { budgetProperties.load(it) }
}
def budgetSigned = budgetKeystore.exists() && budgetProperties['STORE_PASSWORD'] &&
        budgetProperties['KEY_ALIAS'] && budgetProperties['KEY_PASSWORD']
if ((System.getenv('CI') == 'true' || gradle.startParameter.taskNames.any { it.toLowerCase().contains('release') }) && !budgetSigned) {
    throw new GradleException('Budget CI builds require credentials/release-keystore.jks and keystore.properties')
}
if (budgetSigned) {
    android.signingConfigs.create('budgetRelease') {
        storeFile budgetKeystore
        storePassword budgetProperties['STORE_PASSWORD']
        keyAlias budgetProperties['KEY_ALIAS']
        keyPassword budgetProperties['KEY_PASSWORD']
    }
    android.buildTypes.release.signingConfig = android.signingConfigs.budgetRelease
}
`;
  return cfg;
});
