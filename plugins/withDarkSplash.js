const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const DENSITIES = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];

function withDarkSplash(config) {
  return withDangerousMod(config, [
    "android",
    (config) => {
      const projectRoot = config.modRequest.platformProjectRoot;
      const resDir = path.join(projectRoot, "app", "src", "main", "res");

      const assetsRoot = config.modRequest.projectRoot;
      const darkSplashSource = path.join(assetsRoot, "assets", "splash-dark.png");

      if (!fs.existsSync(darkSplashSource)) {
        console.warn("withDarkSplash: assets/splash-dark.png not found, skipping");
        return config;
      }

      for (const density of DENSITIES) {
        const nightDir = path.join(resDir, `drawable-night-${density}`);
        fs.mkdirSync(nightDir, { recursive: true });
        fs.copyFileSync(darkSplashSource, path.join(nightDir, "splashscreen_logo.png"));
      }

      console.log("withDarkSplash: dark splash assets generated for all densities");
      return config;
    },
  ]);
}

module.exports = withDarkSplash;