const { withAppBuildGradle } = require("expo/config-plugins");

function withReleaseBuildConfig(config) {
  return withAppBuildGradle(config, (config) => {
    if (!config.modResults.contents) {
      return config;
    }

    let contents = config.modResults.contents;

    if (!contents.includes("release {")) {
      return config;
    }

    const releaseBlockMatch = contents.match(/(release\s*\{)([\s\S]*?)(\n\s*\})/);
    if (!releaseBlockMatch) {
      return config;
    }

    let releaseBlock = releaseBlockMatch[2];

    releaseBlock = releaseBlock.replace(
      /minifyEnabled\s+\S+/g,
      "minifyEnabled true"
    );

    releaseBlock = releaseBlock.replace(
      /shrinkResources\s+\S+/g,
      "shrinkResources true"
    );

    releaseBlock = releaseBlock.replace(
      /crunchPngs\s+\S+/g,
      "crunchPngs true"
    );

    if (!releaseBlock.includes("ndk {")) {
    releaseBlock = releaseBlock.replace(
      /(\n\s*)(shrinkResources\s+true)/,
      "$1$2\n\n        ndk {\n            abiFilters \"armeabi-v7a\", \"arm64-v8a\"\n        }"
    );
    } else {
      releaseBlock = releaseBlock.replace(
        /ndk\s*\{[\s\S]*?\}/g,
        "ndk {\n            abiFilters \"armeabi-v7a\", \"arm64-v8a\"\n        }"
      );
    }

    contents =
      contents.slice(0, releaseBlockMatch.index + releaseBlockMatch[1].length) +
      releaseBlock +
      contents.slice(releaseBlockMatch.index + releaseBlockMatch[1].length + releaseBlockMatch[2].length);

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withReleaseBuildConfig;