const { withPlugins } = require("expo/config-plugins");

function withDarkSplash(config) {
  const image = "./assets/logo-personal-hub.png";

  // Let Expo generate density-correct assets and native launch themes for
  // both platforms, using the same logo as the launcher in both themes.
  return withPlugins(config, [
    ["expo-splash-screen", {
      image,
      imageWidth: 160,
      backgroundColor: "#FFFFFF",
      dark: {
        image,
        backgroundColor: "#080F2E",
      },
    }],
  ]);
}

module.exports = withDarkSplash;
