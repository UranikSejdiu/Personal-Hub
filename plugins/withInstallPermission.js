const { withAndroidManifest } = require("expo/config-plugins");

function withInstallPermission(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    if (!manifest["uses-permission"]) {
      manifest["uses-permission"] = [];
    }

    const alreadyHas = manifest["uses-permission"].some(
      (p) => p.$?.["android:name"] === "android.permission.REQUEST_INSTALL_PACKAGES"
    );

    if (!alreadyHas) {
      manifest["uses-permission"].push({
        $: { "android:name": "android.permission.REQUEST_INSTALL_PACKAGES" },
      });
    }

    return config;
  });
}

module.exports = withInstallPermission;
