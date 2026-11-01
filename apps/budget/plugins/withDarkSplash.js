const { withPlugins } = require("expo/config-plugins");

function withDarkSplash(config) {
  const image = "./assets/branding/splash-light.png";

  // Let Expo generate density-correct assets and native launch themes for
  // both platforms, using the same logo as the launcher in both themes.
  return withPlugins(config, [
    ["expo-splash-screen", {
      image,
      imageWidth: 160,
      backgroundColor: "#f8f9f4",
      dark: {
        image: "./assets/branding/splash-dark.png",
        backgroundColor: "#111813",
      },
    }],
  ]);
}

module.exports = withDarkSplash;
