const fs = require("fs");
const path = require("path");
const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

const BACKUP_RULES_ATTRIBUTE = "@xml/backup_rules";
const DATA_EXTRACTION_RULES_ATTRIBUTE = "@xml/data_extraction_rules";

// Android 11 and lower: include portable data, not caches or native credentials.
const BACKUP_RULES_XML = `<?xml version="1.0" encoding="utf-8"?>
<!--
  Back up app records, portable preferences, and the last recovery copy.
  Only these paths are included. Shared preferences (including SecureStore),
  temporary files, and caches remain outside this allowlist.
-->
<full-backup-content>
  <include domain="database" path="."/>
  <include domain="file" path="SQLite/"/>
  <include domain="file" path="personal-hub-safety-backup.json"/>
</full-backup-content>
`;

// Android 12 and higher.
const DATA_EXTRACTION_RULES_XML = `<?xml version="1.0" encoding="utf-8"?>
<!--
  Same rules as backup_rules.xml for cloud backup and device-to-device
  transfer on Android 12+.
-->
<data-extraction-rules>
  <cloud-backup>
    <include domain="database" path="."/>
    <include domain="file" path="SQLite/"/>
    <include domain="file" path="personal-hub-safety-backup.json"/>
  </cloud-backup>
  <device-transfer>
    <include domain="database" path="."/>
    <include domain="file" path="SQLite/"/>
    <include domain="file" path="personal-hub-safety-backup.json"/>
  </device-transfer>
</data-extraction-rules>
`;

function writeXmlFile(projectRoot, name, contents) {
  const xmlDir = path.join(
    projectRoot,
    "android",
    "app",
    "src",
    "main",
    "res",
    "xml"
  );
  fs.mkdirSync(xmlDir, { recursive: true });
  fs.writeFileSync(path.join(xmlDir, name), contents, "utf8");
}

// Generates the rule files (they are wiped by `expo prebuild --clean`) and
// points the manifest at them instead of expo-secure-store's shared-pref-only
// rules. Include Expo SQLite (files/SQLite) and Android databases (AsyncStorage).
function withAndroidBackupRules(config) {
  const withRulesFiles = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      writeXmlFile(projectRoot, "backup_rules.xml", BACKUP_RULES_XML);
      writeXmlFile(projectRoot, "data_extraction_rules.xml", DATA_EXTRACTION_RULES_XML);
      return cfg;
    },
  ]);

  return withAndroidManifest(withRulesFiles, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (!application?.$) {
      throw new Error(
        "withAndroidBackupRules: generated manifest has no <application> element"
      );
    }
    application.$["android:allowBackup"] = "true";
    application.$["android:fullBackupContent"] = BACKUP_RULES_ATTRIBUTE;
    application.$["android:dataExtractionRules"] = DATA_EXTRACTION_RULES_ATTRIBUTE;
    return cfg;
  });
}

module.exports = withAndroidBackupRules;
