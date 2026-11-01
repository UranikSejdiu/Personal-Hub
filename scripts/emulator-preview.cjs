// Build offline debug previews for QA. Never uninstall or clear app data.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const ids = ['budget', 'notes', 'tasks', 'dhikr'];
const [selection = 'all', serial = 'emulator-5554'] = process.argv.slice(2);
if (!/^emulator-\d+$/.test(serial)) throw new Error('QA previews require an emulator, not a physical phone.');
const selected = selection === 'all' ? ids : selection.split(',');
if (!selected.length || selected.some(id => !ids.includes(id)) || new Set(selected).size !== selected.length) throw new Error('Choose all or unique comma-separated app IDs: ' + ids.join(','));
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(process.env.USERPROFILE || '', 'AppData/Local/Android/Sdk');
const adb = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {cwd, stdio:'inherit', env:{...process.env, ANDROID_HOME:sdk}});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} exited with ${result.status}`);
}
run(adb, ['-s', serial, 'get-state']);
for (const id of selected) {
  const appRoot = path.join(root, 'apps', id);
  const config = JSON.parse(fs.readFileSync(path.join(appRoot, 'app.json'), 'utf8')).expo;
  const pkg = config.android.package;
  console.log(`Building offline ${id} preview (${pkg})`);
  run(process.execPath, [require.resolve('expo/bin/cli', {paths:[appRoot]}), 'prebuild', '--no-clean', '--platform', 'android', '--no-install'], appRoot);
  const native = path.join(appRoot, 'android');
  const gradleFile = path.join(native, 'app/build.gradle');
  const applicationFile = path.join(native, 'app/src/main/java', ...pkg.split('.'), 'MainApplication.kt');
  const originalGradle = fs.readFileSync(gradleFile, 'utf8');
  const originalApplication = fs.readFileSync(applicationFile, 'utf8');
  if (!originalGradle.includes('react {') || !originalApplication.includes('context = applicationContext,')) throw new Error('Unexpected Expo native template');
  const previewGradle = originalGradle.replace('react {', 'react {\n    debuggableVariants = [] // Offline QA preview.');
  const previewApplication = originalApplication.replace('context = applicationContext,', 'context = applicationContext,\n      useDevSupport = false, // Offline QA preview.');
  try {
    fs.writeFileSync(gradleFile, previewGradle);
    fs.writeFileSync(applicationFile, previewApplication);
    if (process.platform === 'win32') run('cmd.exe', ['/d','/s','/c','gradlew.bat app:assembleDebug -PreactNativeArchitectures=x86_64 --build-cache --console=plain --max-workers=2'], native);
    else { fs.chmodSync(path.join(native,'gradlew'),0o755); run('./gradlew',['app:assembleDebug','-PreactNativeArchitectures=x86_64','--build-cache','--console=plain','--max-workers=2'],native); }
  } finally {
    if (fs.readFileSync(gradleFile,'utf8') === previewGradle) fs.writeFileSync(gradleFile,originalGradle);
    if (fs.readFileSync(applicationFile,'utf8') === previewApplication) fs.writeFileSync(applicationFile,originalApplication);
  }
  run(adb, ['-s', serial, 'install', '-r', path.join(native,'app/build/outputs/apk/debug/app-debug.apk')]);
  run(adb, ['-s', serial, 'shell', 'am', 'force-stop', pkg]);
  run(adb, ['-s', serial, 'shell', 'am', 'start', '-n', `${pkg}/.MainActivity`]);
  console.log(`${id}: installed with existing data preserved.`);
}
