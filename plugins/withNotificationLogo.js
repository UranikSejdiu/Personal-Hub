const fs = require("fs");
const path = require("path");
const { generateImageAsync } = require("@expo/image-utils");
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

const RESOURCE_NAME = "notification_logo";

// expo-notifications supports a local large icon through manifest metadata,
// but its built-in config plugin only exposes the monochrome small icon.
function withNotificationLogo(config) {
  config = withAndroidManifest(config, (cfg) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      application,
      "expo.modules.notifications.large_notification_icon",
      `@drawable/${RESOURCE_NAME}`,
      "resource"
    );
    return cfg;
  });

  return withDangerousMod(config, ["android", async (cfg) => {
    const projectRoot = cfg.modRequest.projectRoot;
    const directory = path.join(cfg.modRequest.platformProjectRoot, "app", "src", "main", "res", "drawable-nodpi");
    const { source } = await generateImageAsync(
      { projectRoot, cacheType: "personal-hub-notification-logo" },
      {
        src: path.join(projectRoot, "assets", "icon-personal-hub.png"),
        width: 256,
        height: 256,
        resizeMode: "contain",
        backgroundColor: "transparent",
      }
    );
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, `${RESOURCE_NAME}.png`), source);
    return cfg;
  }]);
}

module.exports = withNotificationLogo;
