const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
process.env.NODE_ENV = 'production';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, [require.resolve('expo/bin/cli'), 'prebuild', '--no-clean', '--platform', 'android', '--no-install']);
const native = path.join(root, 'android');
if (process.platform !== 'win32') fs.chmodSync(path.join(native, 'gradlew'), 0o755);
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ||
  (process.platform === 'win32' && path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk'));
if (!fs.existsSync(path.join(native, 'local.properties')) && sdk && fs.existsSync(sdk)) {
  fs.writeFileSync(path.join(native, 'local.properties'), `sdk.dir=${sdk.replaceAll('\\', '/')}\n`);
}
if (!fs.existsSync(path.join(root, 'credentials/release-keystore.jks'))) {
  console.log('Local APK uses the Android debug signing key. Configure a release key before distributing production updates.');
}
if (process.platform === 'win32') {
  run('cmd.exe', ['/d', '/s', '/c', 'gradlew.bat assembleRelease'], { cwd: native });
} else {
  run('./gradlew', ['assembleRelease'], { cwd: native });
}
const version = require('../package.json').version;
const output = path.join(root, 'build', `Dhikr-${version}.apk`);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.copyFileSync(path.join(native, 'app/build/outputs/apk/release/app-release.apk'), output);
console.log(`APK: ${output}`);
