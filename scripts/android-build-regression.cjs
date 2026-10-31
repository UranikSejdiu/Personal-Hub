const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createPlan, checkRemote } = require('./android-build-plan.cjs');
const configure = require('../.github/actions/android-cache/configure-launchers.cjs');

module.exports = async function verifyBuilds(root) {
  const plan = createPlan(root);
  assert.equal(plan.include.length, 4);
  assert.deepEqual(plan.include.map(app => app.id), ['budget', 'notes', 'tasks', 'dhikr']);
  for (const app of plan.include) {
    const only = createPlan(root, app.id, 'arm64-test');
    assert.equal(only.include[0].apk, `${app.title}-${app.version}-arm64-test.apk`);
    for (const platform of ['linux', 'win32']) for (const profile of ['universal', 'arm64-test']) {
      const commands = [], copied = [];
      const mocks = {
        'node:child_process': { spawnSync: (command, args) => { commands.push([command, args]); return { status: 0 }; } },
        'node:fs': { existsSync: () => true, chmodSync() {}, mkdirSync() {}, copyFileSync: (_source, output) => copied.push(output) },
        'node:path': path, '../package.json': { version: app.version },
      };
      const fakeRequire = key => { assert.ok(key in mocks, key); return mocks[key]; };
      fakeRequire.resolve = () => 'expo-cli';
      vm.runInNewContext(fs.readFileSync(path.join(root, 'apps', app.id, 'scripts/build-apk.cjs'), 'utf8'), {
        __dirname: path.join(root, 'apps', app.id, 'scripts'), require: fakeRequire, console: { log() {} },
        process: { platform, execPath: 'node', env: { ANDROID_BUILD_PROFILE: profile }, exit: status => { throw new Error(`Unexpected exit ${status}`); } },
      });
      assert.equal(commands.length, 2);
      const command = commands[1][1].join(' ');
      assert.ok(command.includes('lintVitalRelease assembleRelease'));
      assert.equal(command.includes('-PreactNativeArchitectures=arm64-v8a'), profile === 'arm64-test');
      assert.ok(copied[0].endsWith(createPlan(root, app.id, profile).include[0].apk));
    }
  }
  assert.throws(() => createPlan(root, '../unknown'));
  assert.throws(() => createPlan(root, 'all', 'invalid'));
  assert.throws(() => createPlan(root, 'all', 'arm64-test', true));
  const options = { repository: 'owner/repo', sha: 'a'.repeat(40), ref: 'refs/heads/main', token: 'test' };
  const single = createPlan(root, 'tasks');
  const response = data => ({ status: 200, ok: true, json: async () => data });
  const missing = { status: 404, ok: false };
  const makeRequest = ({ release = null, sha = null, code = 0, tag = 'tasks-v0.9.0' } = {}) => async url => {
    if (url.includes('/releases/tags/')) return release ? response(release) : missing;
    if (url.includes('/commits/')) return sha ? response({ sha }) : missing;
    if (url.includes('/contents/')) return response({ content: Buffer.from(JSON.stringify({ expo: { android: { versionCode: code } } })).toString('base64') });
    return response([{ tag_name: tag }]);
  };
  await checkRemote(single, { ...options, request: makeRequest() });
  await assert.rejects(checkRemote(single, { ...options, ref: 'refs/heads/test', request: makeRequest() }), /main only/);
  await assert.rejects(checkRemote(single, { ...options, request: makeRequest({ release: {} }) }), /already released/);
  await assert.rejects(checkRemote(single, { ...options, request: makeRequest({ sha: 'b'.repeat(40) }) }), /another commit/);
  await assert.rejects(checkRemote(single, { ...options, request: makeRequest({ code: single.include[0].versionCode }) }), /versionCode must exceed/);
  await assert.rejects(checkRemote(single, { ...options, request: makeRequest({ tag: 'tasks-v9.0.0' }) }), /Version must exceed/);
  await assert.rejects(checkRemote(single, { ...options, request: async () => ({ status: 403, ok: false }) }), /403/);
  // Repository preflight must work without any app node_modules installed.
  for (const source of [
    'find_program(CCACHE_FOUND ccache)\nif(CCACHE_FOUND)\n  set_property(GLOBAL PROPERTY RULE_LAUNCH_COMPILE ccache)\nendif(CCACHE_FOUND)\n',
    '# ReactAndroid JNI\nfind_program(CCACHE_FOUND ccache)\nif(CCACHE_FOUND)\n  set_property(GLOBAL PROPERTY RULE_LAUNCH_COMPILE ccache)\n  set_property(GLOBAL PROPERTY RULE_LAUNCH_LINK ccache)\nendif(CCACHE_FOUND)\n',
  ]) {
    const configured = configure(source);
    assert.ok(configured.includes('if(CCACHE_FOUND AND NOT CMAKE_CXX_COMPILER_LAUNCHER)'));
    assert.equal(configure(configured), configured);
  }
  assert.throws(() => configure('upstream changed'));
  console.log('Android build checks passed: all/individual selection, Windows/Linux profiles, release overwrite protection, increasing versionCodes, main-only publishing, and cache launcher compatibility.');
};
