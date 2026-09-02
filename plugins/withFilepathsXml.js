const { withAndroidManifest, withProjectBuildGradle } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const FILEPATHS_XML = `<?xml version="1.0" encoding="utf-8"?>
<paths>
    <cache-path name="cache" path="." />
    <external-cache-path name="external_cache" path="." />
    <files-path name="files" path="." />
    <external-files-path name="external_files" path="." />
</paths>`;

function withFilepathsXml(config) {
  return {
    ...config,
    mods: {
      ...config.mods,
      android: {
        ...config.mods?.android,
        project: async (config) => {
          const projectRoot = config.modRequest.projectRoot;
          const xmlDir = path.join(projectRoot, "android", "app", "src", "main", "res", "xml");

          if (!fs.existsSync(xmlDir)) {
            fs.mkdirSync(xmlDir, { recursive: true });
          }

          fs.writeFileSync(path.join(xmlDir, "filepaths.xml"), FILEPATHS_XML, "utf-8");

          return config;
        },
      },
    },
  };
}

module.exports = withFilepathsXml;
