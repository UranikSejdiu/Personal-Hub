#!/usr/bin/env node
/**
 * bump-version.js
 *
 * Single source of truth: package.json "version" field.
 *
 * Usage:
 *   node scripts/bump-version.js          # sync from package.json
 *   node scripts/bump-version.js 1.7.1    # set version, then sync
 *   node scripts/bump-version.js --dry    # preview changes without writing
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const isDry = process.argv.includes("--dry");

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf-8"));
}

function writeJson(file, data) {
  const content = JSON.stringify(data, null, 2) + "\n";
  if (isDry) {
    console.log(`[dry] Would write ${file}`);
  } else {
    fs.writeFileSync(path.join(ROOT, file), content);
  }
}

function replaceInFile(file, replacements) {
  const filePath = path.join(ROOT, file);
  let content = fs.readFileSync(filePath, "utf-8");
  for (const [pattern, replacement] of replacements) {
    content = content.replace(pattern, replacement);
  }
  if (isDry) {
    console.log(`[dry] Would update ${file}`);
  } else {
    fs.writeFileSync(filePath, content);
  }
}

// --- Resolve target version ---
let targetVersion;
if (process.argv[2] && !process.argv[2].startsWith("--")) {
  targetVersion = process.argv[2];
} else {
  const pkg = readJson("package.json");
  targetVersion = pkg.version;
}

if (!/^\d+\.\d+\.\d+$/.test(targetVersion)) {
  console.error(`Invalid version: "${targetVersion}". Expected semver like 1.7.1`);
  process.exit(1);
}

console.log(`Syncing all version references to ${targetVersion}...\n`);

// --- 1. package.json ---
const pkg = readJson("package.json");
const oldVersion = pkg.version;
pkg.version = targetVersion;
writeJson("package.json", pkg);
console.log(`  package.json:        ${oldVersion} -> ${targetVersion}`);

// --- 2. app.json (Expo config) ---
const app = readJson("app.json");
const oldAppVersion = app.expo.version;
const oldCode = app.expo.android.versionCode;
const newCode = oldCode + 1;
app.expo.version = targetVersion;
app.expo.android.versionCode = newCode;
writeJson("app.json", app);
console.log(`  app.json version:    ${oldAppVersion} -> ${targetVersion}`);
console.log(`  app.json versionCode: ${oldCode} -> ${newCode}`);

// --- 3. version.json ---
const vjson = { versionCode: newCode, versionName: targetVersion };
writeJson("version.json", vjson);
console.log(`  version.json:        ${vjson.versionName} / ${vjson.versionCode}`);

// --- 4. android/app/build.gradle ---
replaceInFile("android/app/build.gradle", [
  [/versionCode\s+\d+/, `versionCode ${newCode}`],
  [/versionName\s+"[^"]*"/, `versionName "${targetVersion}"`],
]);
console.log(`  build.gradle:        ${targetVersion} / ${newCode}`);

// --- 5. package-lock.json ---
if (!isDry) {
  execSync("npm install --package-lock-only --silent", { cwd: ROOT });
  console.log("  package-lock.json:   synced via npm");
} else {
  console.log("[dry] Would sync package-lock.json");
}

// --- 6. Git commit + tag ---
if (!isDry) {
  const files = [
    "package.json",
    "package-lock.json",
    "app.json",
    "version.json",
    "android/app/build.gradle",
  ];
  execSync(`git add ${files.join(" ")}`, { cwd: ROOT });
  execSync(`git commit -m "chore: bump version to ${targetVersion}" --no-verify`, {
    cwd: ROOT,
    stdio: "inherit",
  });
  execSync(`git tag v${targetVersion}`, { cwd: ROOT });
  console.log(`\n  Git commit created and tagged v${targetVersion}`);
  console.log("  Run 'git push origin main --tags' to push.");
} else {
  console.log("\n[dry] Would create git commit + tag v" + targetVersion);
}
