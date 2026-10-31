const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { APPS, changedApps, prepareVersions, applyVersions } = require('./app-versions.cjs');
const { createPlan } = require('./android-build-plan.cjs');

module.exports = function verifyVersions() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uranik-version-tests-'));
  const git = (...args) => execFileSync('git', ['-c', 'core.autocrlf=false', ...args], { cwd: root, stdio: 'pipe', encoding: 'utf8' });
  const file = (id, name) => path.join(root, 'apps', id, name);
  const write = (id, name, value) => fs.writeFileSync(file(id, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
  const read = (id, name) => JSON.parse(fs.readFileSync(file(id, name), 'utf8'));
  try {
    git('init', '-q', '-b', 'main');
    for (const id of APPS) {
      fs.mkdirSync(file(id, 'src'), { recursive: true });
      fs.mkdirSync(file(id, 'scripts'));
      const version = id === 'dhikr' ? '1.0.2' : '1.0.0';
      write(id, 'package.json', { name: id, version, dependencies: {} });
      write(id, 'package-lock.json', { version, packages: { '': { version, dependencies: {} } } });
      write(id, 'app.json', { expo: { version, android: { package: `com.test.${id}`, versionCode: id === 'dhikr' ? 3 : 1 } } });
      write(id, 'src/main.ts', 'export const value = 1;\n');
      write(id, 'README.md', 'Documentation\n');
      write(id, 'scripts/test.cjs', '// tests\n');
      write(id, '.gitignore', 'credentials/\nnode_modules/\n');
    }
    git('add', '.');
    git('-c', 'user.name=Version tests', '-c', 'user.email=version-tests@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture');
    assert.equal(prepareVersions(root, 'all').every(app => app.files.length === 0), true, 'First releases retain their chosen versions');
    for (const id of APPS) git('tag', `${id}-v${read(id, 'package.json').version}`);
    assert.deepEqual(changedApps(root), []);
    assert.deepEqual(createPlan(root, 'changed').include, [], 'The workflow can skip every unchanged app');
    write('notes', 'README.md', 'Edited docs\n');
    write('budget', 'scripts/test.cjs', '// edited tests\n');
    assert.deepEqual(changedApps(root), [], 'Docs and test-only changes do not force releases');
    write('tasks', 'src/new.ts', 'export const added = true;\n');
    assert.deepEqual(changedApps(root), ['tasks'], 'Untracked app code is included');
    assert.deepEqual(createPlan(root, 'changed').include.map(app => app.id), ['tasks'], 'Workflow selection matches local version preparation');
    git('add', 'apps/tasks/src/new.ts');
    write('tasks', 'src/main.ts', 'export const value = 2;\n');
    const changed = prepareVersions(root, 'changed');
    assert.equal(changed.length, 1); assert.equal(changed[0].version, '1.0.1'); assert.equal(changed[0].code, 2);
    assert.equal(read('tasks', 'package.json').version, '1.0.0', 'Preparing a preview does not write files');
    applyVersions(changed);
    assert.equal(read('tasks', 'package.json').version, '1.0.1');
    assert.equal(read('tasks', 'package-lock.json').version, '1.0.1');
    assert.equal(read('tasks', 'package-lock.json').packages[''].version, '1.0.1');
    assert.equal(read('tasks', 'app.json').expo.version, '1.0.1');
    assert.equal(read('tasks', 'app.json').expo.android.versionCode, 2);
    assert.equal(read('notes', 'app.json').expo.version, '1.0.0');
    assert.equal(prepareVersions(root, 'changed')[0].files.length, 0, 'Repeated preparation cannot double-bump a pending release');
    const minor = prepareVersions(root, 'tasks', 'minor');
    assert.equal(minor[0].version, '1.1.0'); applyVersions(minor);
    assert.equal(prepareVersions(root, 'tasks', 'minor')[0].files.length, 0);
    assert.equal(prepareVersions(root, 'tasks', 'major')[0].version, '2.0.0');
    assert.deepEqual(prepareVersions(root, 'budget,notes').map(app => app.id), ['budget', 'notes']);
    const all = prepareVersions(root, 'all');
    assert.equal(all.length, 4); assert.equal(all.find(app => app.id === 'dhikr').version, '1.0.3');
    const original = all.flatMap(app => app.files).map(entry => fs.readFileSync(entry.file, 'utf8'));
    let renames = 0;
    assert.throws(() => applyVersions(all, { ...fs, renameSync: (...args) => { if (++renames === 2) throw new Error('Injected disk failure'); return fs.renameSync(...args); } }), /Injected disk failure/);
    assert.deepEqual(all.flatMap(app => app.files).map(entry => fs.readFileSync(entry.file, 'utf8')), original, 'A partial write rolls all app versions back');
    assert.ok(APPS.every(id => !fs.readdirSync(file(id, '')).some(name => name.endsWith('.tmp'))));
    const stale = prepareVersions(root, 'budget');
    write('budget', 'package.json', fs.readFileSync(file('budget', 'package.json'), 'utf8') + ' ');
    assert.throws(() => applyVersions(stale), /changed; prepare again/);
    write('budget', 'package-lock.json', { version: '9.9.9', packages: { '': { version: '9.9.9' } } });
    assert.throws(() => prepareVersions(root, 'all'), /package-lock version differs/);
    assert.throws(() => prepareVersions(root, '../unknown'));
    console.log('Version checks passed: changed-app isolation, preview, all four version fields, pending-release reuse, minor/major, grouped apps, rollback, and stale-file protection.');
  } finally {
    const target = fs.realpathSync(root), parent = fs.realpathSync(os.tmpdir());
    assert.ok(target.startsWith(parent + path.sep + 'uranik-version-tests-'), 'Cleanup must stay in its test temporary directory');
    fs.rmSync(target, { recursive: true, force: true });
  }
};
