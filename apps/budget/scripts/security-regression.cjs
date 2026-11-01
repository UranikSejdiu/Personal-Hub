// Real encryption, Node crypto interoperability, and hostile-input checks.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const filename = path.join(root, 'src/lib/backupCrypto.ts');
const moduleUnderTest = { exports: {} };
const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const requireMock = id => id === 'expo-crypto' ? { getRandomBytesAsync: async n => new Uint8Array(crypto.randomBytes(n)) } : require(id);
vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(requireMock, moduleUnderTest, moduleUnderTest.exports);
const { encryptBackup, decryptBackup, isEncryptedBackup } = moduleUnderTest.exports;
(async () => {
  const password = 'Private backup 🔐 passphrase';
  const original = JSON.stringify({ tables: { income: 2456.78, name: 'Uranik · € · 日本語' } });
  await assert.rejects(encryptBackup(original, 'too short'));
  const encrypted = await encryptBackup(original, password);
  assert.equal(isEncryptedBackup(encrypted), true);
  assert.equal(isEncryptedBackup('{"meta":{"format":"uranik-budget.backup"}}'), false);
  assert.ok(!encrypted.includes('2456.78') && !encrypted.includes('Uranik'));
  assert.equal(await decryptBackup(encrypted, password), original);
  await assert.rejects(decryptBackup(encrypted, 'Incorrect password'), /Wrong password or damaged/);
  const second = JSON.parse(await encryptBackup(original, password));
  const first = JSON.parse(encrypted);
  assert.notEqual(first.salt, second.salt); assert.notEqual(first.nonce, second.nonce); assert.notEqual(first.ciphertext, second.ciphertext);
  const bytes = Buffer.from(first.ciphertext, 'base64'); bytes[0] ^= 1;
  await assert.rejects(decryptBackup(JSON.stringify({ ...first, ciphertext: bytes.toString('base64') }), password));
  for (const fields of [{ version: 2 }, { iterations: 2 ** 32 }, { cipher: 'AES-CBC' }, { nonce: '' }, { salt: 'bad' }]) {
    await assert.rejects(decryptBackup(JSON.stringify({ ...first, ...fields }), password));
  }
  const key = crypto.pbkdf2Sync(password, Buffer.from(first.salt, 'base64'), first.iterations, 32, 'sha256');
  const sealed = Buffer.from(first.ciphertext, 'base64');
  const aad = Buffer.from(`${first.format}:1:PBKDF2-SHA256:${first.iterations}:AES-256-GCM`);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(first.nonce, 'base64'));
  decipher.setAAD(aad); decipher.setAuthTag(sealed.subarray(-16));
  assert.equal(Buffer.concat([decipher.update(sealed.subarray(0, -16)), decipher.final()]).toString('utf8'), original);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, Buffer.from(first.nonce, 'base64'));
  cipher.setAAD(aad);
  const fromNode = Buffer.concat([cipher.update(original, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  assert.equal(await decryptBackup(JSON.stringify({ ...first, ciphertext: fromNode.toString('base64') }), password), original);
  key.fill(0);
  // SDK 58 removed the vulnerable query-string/decoder chain entirely.
  const lock = require('../package-lock.json');
  assert.ok(lock.packages['node_modules/expo'].version.startsWith('58.'));
  for (const [name, pkg] of Object.entries(lock.packages)) {
    assert.ok(!name.endsWith('/decode-uri-component'), 'Retired vulnerable URL-decoder chain must stay removed');
    if (name.endsWith('/shell-quote')) {
      const [major, minor] = pkg.version.split('.').map(Number);
      assert.ok(major > 1 || (major === 1 && minor >= 11));
    }
  }
  console.log('Security checks passed: encrypted Unicode round trips, fresh salts/nonces, wrong passwords, tamper rejection, bounded parameters, Node AES interoperability, and SDK 58 dependency guards.');
})().catch(err => { console.error(err); process.exitCode = 1; });
