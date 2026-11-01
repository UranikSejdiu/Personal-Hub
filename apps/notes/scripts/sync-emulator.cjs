// Install an offline, debug-signed preview on a running emulator. No dev server.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const serial = process.argv[2] || 'emulator-5554';
if (!/^emulator-\d+$/.test(serial)) throw new Error('Select an Android emulator, not a physical device.');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(process.env.USERPROFILE || '', 'AppData/Local/Android/Sdk');
const adb = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} exited with ${result.status}`);
}
const gradleFile = path.join(root, 'android/app/build.gradle');
const applicationFile = path.join(root, 'android/app/src/main/java/com/uranik/notes/MainApplication.kt');
const originalGradle = fs.readFileSync(gradleFile, 'utf8');
const originalApplication = fs.readFileSync(applicationFile, 'utf8');
if (!originalGradle.includes('react {') || !originalApplication.includes('context = applicationContext,')) throw new Error('Unexpected native template; run Expo prebuild first.');
const previewGradle = originalGradle.replace('react {', 'react {\n    debuggableVariants = [] // Embed JS for this offline emulator preview.');
const previewApplication = originalApplication.replace('context = applicationContext,', 'context = applicationContext,\n      useDevSupport = false, // Offline emulator preview only.');
try {
  run(adb, ['-s', serial, 'get-state']);
  fs.writeFileSync(gradleFile, previewGradle);
  fs.writeFileSync(applicationFile, previewApplication);
  if (process.platform === 'win32') {
    run('cmd.exe', ['/d', '/s', '/c', 'gradlew.bat app:assembleDebug -PreactNativeArchitectures=x86_64 --build-cache --console=plain'], path.join(root, 'android'));
  } else {
    run('./gradlew', ['app:assembleDebug', '-PreactNativeArchitectures=x86_64', '--build-cache', '--console=plain'], path.join(root, 'android'));
  }
} finally {
  // These generated files are ignored. Restore normal development behaviour;
  // do not overwrite unrelated edits made while the build was running.
  if (fs.readFileSync(gradleFile, 'utf8') === previewGradle) fs.writeFileSync(gradleFile, originalGradle);
  if (fs.readFileSync(applicationFile, 'utf8') === previewApplication) fs.writeFileSync(applicationFile, originalApplication);
}
run(adb, ['-s', serial, 'install', '-r', path.join(root, 'android/app/build/outputs/apk/debug/app-debug.apk')]);
run(adb, ['-s', serial, 'shell', 'am', 'force-stop', 'com.uranik.notes']);
run(adb, ['-s', serial, 'shell', 'am', 'start', '-n', 'com.uranik.notes/.MainActivity']);
console.log('Notes synced. The installed emulator build runs without Metro; existing app data is preserved.');
