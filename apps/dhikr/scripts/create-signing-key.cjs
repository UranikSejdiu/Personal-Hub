const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const directory = path.resolve(__dirname, '../credentials');
const keystore = path.join(directory, 'release-keystore.jks');
const properties = path.join(directory, 'keystore.properties');
if (fs.existsSync(keystore) || fs.existsSync(properties)) {
  throw new Error('Signing credentials already exist; refusing to replace an app update key.');
}
fs.mkdirSync(directory, { recursive: true });
const passwordFile = path.join(directory, '.password.tmp');
const password = crypto.randomBytes(32).toString('base64url');
fs.writeFileSync(passwordFile, password, { mode: 0o600, flag: 'wx' });
const keytool = process.env.JAVA_HOME
  ? path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool')
  : 'keytool';
try {
  const result = spawnSync(keytool, [
    '-genkeypair', '-keystore', keystore, '-storetype', 'JKS', '-alias', 'dhikr',
    '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
    '-dname', 'CN=Dhikr Android App',
    '-storepass:file', passwordFile, '-keypass:file', passwordFile,
  ], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Signing key generation failed.');
  fs.writeFileSync(properties, `STORE_PASSWORD=${password}\nKEY_ALIAS=dhikr\nKEY_PASSWORD=${password}\n`, { mode: 0o600, flag: 'wx' });
  console.log('Created independent Dhikr release signing credentials in credentials/. Keep a secure backup for future app updates.');
} finally {
  fs.unlinkSync(passwordFile);
}
