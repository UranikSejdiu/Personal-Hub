const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
const prefix = pkg.name === 'dhikr' ? 'dhikr-v' : 'v';
const expected = `${prefix}${pkg.version}`;
assert.equal(process.env.RELEASE_TAG, expected, `Release tag must be ${expected}; the installed APK reports ${pkg.version}.`);
assert.equal(config.version, pkg.version, 'app.json and package.json must use the same release version.');
assert.ok(Number.isSafeInteger(config.android.versionCode) && config.android.versionCode > 0, 'Android versionCode must be a positive integer.');
console.log(`Verified release ${expected} (Android build ${config.android.versionCode}).`);
