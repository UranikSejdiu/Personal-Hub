const { withAndroidManifest } = require("expo/config-plugins");

// A previous image-picker configuration can leave tools:node="remove" behind
// during incremental prebuilds. Both features now need their runtime permission.
module.exports = function withAttachmentPermissions(config) {
  return withAndroidManifest(config, cfg => {
    const manifest = cfg.modResults.manifest;
    const permissions = manifest["uses-permission"] ?? [];
    for (const name of ["android.permission.CAMERA", "android.permission.RECORD_AUDIO"]) {
      const existing = permissions.find(permission => permission.$?.["android:name"] === name);
      if (existing) delete existing.$["tools:node"];
      else permissions.push({ $: { "android:name": name } });
    }
    manifest["uses-permission"] = permissions;
    return cfg;
  });
};
