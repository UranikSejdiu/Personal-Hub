const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

// A previous image-picker configuration can leave tools:node="remove" behind
// during incremental prebuilds. Both features now need their runtime permission.
module.exports = function withAttachmentPermissions(config) {
  config = withAndroidManifest(config, cfg => {
    const manifest = cfg.modResults.manifest;
    const permissions = manifest["uses-permission"] ?? [];
    for (const name of ["android.permission.CAMERA", "android.permission.RECORD_AUDIO"]) {
      const existing = permissions.find(permission => permission.$?.["android:name"] === name);
      if (existing) delete existing.$["tools:node"];
      else permissions.push({ $: { "android:name": name } });
    }
    manifest["uses-permission"] = permissions;
    const features = manifest["uses-feature"] ?? [];
    for (const name of ["android.hardware.camera", "android.hardware.camera.autofocus", "android.hardware.microphone"]) {
      const feature = features.find(item => item.$?.["android:name"] === name);
      if (feature) feature.$["android:required"] = "false";
      else features.push({ $: { "android:name": name, "android:required": "false" } });
    }
    manifest["uses-feature"] = features;
    return cfg;
  });
  return withDangerousMod(config, ["android", async mod => {
    const path = require("node:path");
    await require("node:fs/promises").copyFile(path.join(__dirname, "lint.xml"),
      path.join(mod.modRequest.platformProjectRoot, "app/lint.xml"));
    return mod;
  }]);
};
