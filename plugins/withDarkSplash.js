const { withPlugins } = require("expo/config-plugins");

function withDarkSplash(config) {
  const image = config.android?.adaptiveIcon?.foregroundImage ?? config.icon;
  if (!image) throw new Error("Splash screen requires the configured app icon");

  // Let Expo generate density-correct assets and native launch themes for
  // both platforms, using the same logo as the launcher in both themes.
  return withPlugins(config, [
    ["expo-splash-screen", {
      image,
      imageWidth: 120,
      backgroundColor: "#FFFFFF",
      dark: {
        image,
        backgroundColor: config.android?.adaptiveIcon?.backgroundColor ?? "#101A35",
      },
    }],
  ]);
}

module.exports = withDarkSplash;
