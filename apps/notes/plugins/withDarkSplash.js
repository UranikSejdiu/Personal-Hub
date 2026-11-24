const { withPlugins } = require("expo/config-plugins");

function withDarkSplash(config) {
  const image = "./assets/branding/splash-light.png";

  // Match each native launch background to the in-app theme.
  return withPlugins(config, [
    ["expo-splash-screen", {
      image,
      imageWidth: 160,
      backgroundColor: "#ffffff",
      dark: {
        image: "./assets/branding/splash-dark.png",
        backgroundColor: "#000000",
      },
    }],
  ]);
}

module.exports = withDarkSplash;
