const fs = require("node:fs/promises");
const path = require("node:path");
const { withAndroidStyles, withFinalizedMod } = require("expo/config-plugins");

const splashTheme = "Theme.App.SplashScreen";
const baseTheme = "AppSplashBase";

module.exports = function withLaunchResources(config) {
  // Registered first so this runs after the splash plugin produces its items.
  config = withAndroidStyles(config, mod => {
    const styles = mod.modResults.resources.style;
    const splash = styles.find(style => style.$.name === splashTheme);
    if (!splash) throw new Error("Missing generated splash theme");
    const items = splash.item.filter(item => item.$.name !== "android:windowSplashScreenBehavior");
    mod.modResults.resources.style = [
      ...styles.filter(style => style.$.name !== baseTheme && style !== splash),
      { $: { name: baseTheme, parent: splash.$.parent }, item: items },
      { $: { name: splashTheme, parent: baseTheme } },
    ];
    return mod;
  });
  return withFinalizedMod(config, ["android", async mod => {
    const res = path.join(mod.modRequest.platformProjectRoot, "app/src/main/res");
    const dir = path.join(res, "values-v33");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "app_splash.xml"), `<resources>
  <style name="${splashTheme}" parent="${baseTheme}">
    <item name="android:windowSplashScreenBehavior">icon_preferred</item>
  </style>
</resources>
`);
    // Expo may emit PNG bytes under WebP filenames. Preserve pixels and resource names.
    for (const density of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
      const mipmap = path.join(res, "mipmap-" + density);
      for (const name of await fs.readdir(mipmap)) {
        if (!name.startsWith("ic_launcher") || !name.endsWith(".webp")) continue;
        const file = path.join(mipmap, name);
        const bytes = await fs.readFile(file);
        if (bytes.readUInt32BE(0) === 0x89504e47) {
          const webp = await require("sharp")(bytes).webp({ lossless: true }).toBuffer();
          await fs.writeFile(file, webp);
        }
      }
    }
    return mod;
  }]);
};
