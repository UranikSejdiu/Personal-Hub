const { withAndroidManifest } = require("expo/config-plugins");

// The default Expo prebuild template ships permissions this app does not use.
// They come back on every `expo prebuild --clean`, so strip them here instead
// of editing the generated manifest.
const UNUSED_PERMISSIONS = ["android.permission.SYSTEM_ALERT_WINDOW"];

function withUnusedPermissions(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const permissions = manifest["uses-permission"];
    if (Array.isArray(permissions)) {
      const legacyWrite = permissions.find(permission => permission.$?.["android:name"] === "android.permission.WRITE_EXTERNAL_STORAGE");
      if (legacyWrite) legacyWrite.$["android:maxSdkVersion"] = "28";
      manifest["uses-permission"] = permissions.filter(
        (permission) =>
          !UNUSED_PERMISSIONS.includes(permission.$?.["android:name"])
      );
    }
    return cfg;
  });
}

module.exports = withUnusedPermissions;
