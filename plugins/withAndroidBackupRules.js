const fs = require("fs");
const path = require("path");
const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

const BACKUP_RULES_ATTRIBUTE = "@xml/backup_rules";
const DATA_EXTRACTION_RULES_ATTRIBUTE = "@xml/data_extraction_rules";

// Android 11 and lower: only <exclude> entries, everything else stays backed up.
const BACKUP_RULES_XML = `<?xml version="1.0" encoding="utf-8"?>
<!--
  Personal Hub is offline-first. The SQLite database must never reach cloud
  backup: restoring an older copy over a newer schema corrupts user data, and
  the data is already kept on-device. Auth tokens in SecureStore stay out too.
-->
<full-backup-content>
  <exclude domain="database" path="."/>
  <exclude domain="sharedpref" path="SecureStore"/>
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
    <exclude domain="database" path="."/>
    <exclude domain="sharedpref" path="SecureStore"/>
  </cloud-backup>
  <device-transfer>
    <exclude domain="database" path="."/>
    <exclude domain="sharedpref" path="SecureStore"/>
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
// rules, which would leave the SQLite database eligible for backup.
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
    application.$["android:fullBackupContent"] = BACKUP_RULES_ATTRIBUTE;
    application.$["android:dataExtractionRules"] = DATA_EXTRACTION_RULES_ATTRIBUTE;
    return cfg;
  });
}

module.exports = withAndroidBackupRules;
