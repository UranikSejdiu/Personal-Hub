const { withGradleProperties } = require("expo/config-plugins");

const PROPERTIES = {
  "org.gradle.jvmargs": "-Xmx4096m -XX:MaxMetaspaceSize=512m",
  "newArchEnabled": "false",
  "expo.gif.enabled": "true",
  "expo.webp.enabled": "true",
  "expo.webp.animated": "false",
  "expo.useLegacyPackaging": "false",
  "expo.inlineModules.watchedDirectories": "[]",
};

function withCustomGradleProperties(config) {
  return withGradleProperties(config, (config) => {
    for (const [key, value] of Object.entries(PROPERTIES)) {
      const existing = config.modResults.find(
        (prop) => prop.type === "property" && prop.key === key
      );

      if (existing) {
        if (existing.value !== value) {
          existing.value = value;
        }
      } else {
        config.modResults.push({ type: "property", key, value });
      }
    }

    return config;
  });
}

module.exports = withCustomGradleProperties;