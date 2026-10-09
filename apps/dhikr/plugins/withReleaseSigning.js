const { withAppBuildGradle } = require("expo/config-plugins");

// Signing persists across prebuild. CI never falls back to the debug key.
module.exports = config => withAppBuildGradle(config, cfg => {
  const marker = "// Dhikr release signing";
  // This is the final app Gradle plugin; replace its own appended block so
  // no-clean prebuilds also pick up signing configuration changes.
  cfg.modResults.contents = cfg.modResults.contents.replace(/\n\/\/ Dhikr release signing[\s\S]*$/, "");
  cfg.modResults.contents += `
${marker}
def dhikrKeystore = rootProject.file('../credentials/release-keystore.jks')
def dhikrPropertiesFile = rootProject.file('../credentials/keystore.properties')
def dhikrProperties = new Properties()
if (dhikrPropertiesFile.exists()) {
    dhikrPropertiesFile.withInputStream { dhikrProperties.load(it) }
}
def dhikrSigned = dhikrKeystore.exists() && dhikrProperties['STORE_PASSWORD'] &&
        dhikrProperties['KEY_ALIAS'] && dhikrProperties['KEY_PASSWORD']
if (System.getenv('CI') == 'true' && !dhikrSigned) {
    throw new GradleException('Dhikr CI builds require credentials/release-keystore.jks and keystore.properties')
}
if (dhikrSigned) {
    android.signingConfigs.create('dhikrRelease') {
        storeFile dhikrKeystore
        storePassword dhikrProperties['STORE_PASSWORD']
        keyAlias dhikrProperties['KEY_ALIAS']
        keyPassword dhikrProperties['KEY_PASSWORD']
    }
    android.buildTypes.release.signingConfig = android.signingConfigs.dhikrRelease
}
`;
  return cfg;
});
