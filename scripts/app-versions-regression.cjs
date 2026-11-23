const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { APPS, changedApps, prepareVersions, applyVersions } = require('./app-versions.cjs');
const { createPlan, checkRemote } = require('./android-build-plan.cjs');

module.exports = async function verifyVersions() {
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
      write(id, 'app.json', { expo: { name: id === 'budget' ? 'MoneyPlan' : id === 'notes' ? 'My Notes' : id[0].toUpperCase() + id.slice(1), version, android: { package: `com.test.${id}`, versionCode: id === 'dhikr' ? 3 : 1 } } });
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
    const published = createPlan(root).include.map(app => ({
      tag_name: app.tag, assets: [{ name: app.apk, state: 'uploaded', size: 1 }],
    }));
    const tagCommit = git('rev-parse', 'HEAD').trim();
    git('-c', 'user.name=Version tests', '-c', 'user.email=version-tests@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-qm', 'workflow-only change');
    const options = {
      root, changedOnly: true, repository: 'owner/repo', token: 'test',
      sha: git('rev-parse', 'HEAD').trim(), ref: 'refs/heads/main',
    };
    const request = releases => async url => {
      let data = releases;
      if (url.includes('/git/ref/tags/')) {
        const tag = url.split('/').at(-1);
        if (!published.some(release => release.tag_name === tag)) return { ok: false, status: 404 };
        data = { object: { type: 'commit', sha: tagCommit } };
      } else if (url.includes('/contents/')) {
        const endpoint = new URL(url);
        const app = endpoint.pathname.match(/\/contents\/(apps\/\w+\/app\.json)$/)[1];
        const config = git('show', `${endpoint.searchParams.get('ref')}:${app}`);
        data = { content: Buffer.from(config).toString('base64') };
      }
      return { ok: true, status: 200, json: async () => data };
    };
    const releaseCandidates = createPlan(root, 'changed', 'universal', true);
    const withOrphanTag = published.filter(release => !release.tag_name.startsWith('tasks-v'));
    const orphanBump = prepareVersions(root, 'changed', 'patch', withOrphanTag);
    assert.deepEqual(orphanBump.map(app => [app.id, app.version, app.code]), [['tasks', '1.0.1', 2]],
      'The bump command sees a failed release and prepares a version above its reserved tag');
    const retry = await checkRemote(releaseCandidates, { ...options, request: request(withOrphanTag) });
    assert.deepEqual(retry.include.map(app => app.id), ['tasks'], 'An unpublished tag can be retried after a workflow-only commit');
    const withDraft = [...withOrphanTag, { ...published.find(release => release.tag_name.startsWith('tasks-v')), draft: true }];
    assert.deepEqual((await checkRemote(releaseCandidates, { ...options, request: request(withDraft) })).include, retry.include,
      'A draft APK is not visible to installed apps');
    assert.deepEqual((await checkRemote(releaseCandidates, { ...options, request: request(published) })).include, [],
      'A completed release is skipped when the app is unchanged');
    write('notes', 'README.md', 'Edited docs\n');
    write('budget', 'scripts/test.cjs', '// edited tests\n');
    assert.deepEqual(changedApps(root), [], 'Docs and test-only changes do not force releases');
    write('tasks', 'src/new.ts', 'export const added = true;\n');
    assert.deepEqual(changedApps(root), ['tasks'], 'Untracked app code is included');
    assert.deepEqual(createPlan(root, 'changed').include.map(app => app.id), ['tasks'], 'Workflow selection matches local version preparation');
    git('add', 'apps/tasks/src/new.ts');
    write('tasks', 'src/main.ts', 'export const value = 2;\n');
    const waiting = await checkRemote(createPlan(root, 'changed', 'universal', true), { ...options, request: request(published) });
    assert.deepEqual(waiting.include, []);
    assert.match(waiting.waiting[0], /version:bump -- tasks/);
    const notesBump = prepareVersions(root, 'notes');
    fs.mkdirSync(path.join(root, 'scripts'));
    const command = path.join(root, 'scripts', 'app-versions.cjs');
    fs.copyFileSync(path.join(__dirname, 'app-versions.cjs'), command);
    const bump = (...args) => execFileSync(process.execPath, [command, 'notes', '--offline', ...args], { cwd: root, encoding: 'utf8' });
    assert.match(bump('--dry-run'), /1\.0\.1 \(2\).*preview only/);
    assert.equal(read('notes', 'app.json').expo.version, '1.0.0');
    assert.match(bump(), /1\.0\.1 \(2\).*Version increased/);
    assert.match(bump(), /1\.0\.1 \(2\).*Next release already prepared/);
    const ready = await checkRemote(createPlan(root, 'changed', 'universal', true), { ...options, request: request(published) });
    assert.deepEqual(ready.include.map(app => [app.id, app.tag, app.versionCode, app.apk]), [['notes', 'notes-v1.0.1', 2, 'Notes-1.0.1.apk']],
      'A version-only bump puts the named app on the publish matrix');
    assert.deepEqual(ready.waiting, waiting.waiting, 'Other pending changes are reported and do not block a prepared app');
    for (const entry of notesBump[0].files) fs.writeFileSync(entry.file, entry.before);
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
    const prepared = await checkRemote(createPlan(root, 'changed', 'universal', true), { ...options, request: request(published) });
    assert.deepEqual(prepared.include.map(app => app.tag), ['tasks-v1.0.1']);
    assert.deepEqual(prepared.waiting, []);
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
    console.log('Version checks passed: changed-only publishing, version-only bumps, unbumped app reporting, failed releases, grouped apps, and rollback.');
  } finally {
    const target = fs.realpathSync(root), parent = fs.realpathSync(os.tmpdir());
    assert.ok(target.startsWith(parent + path.sep + 'uranik-version-tests-'), 'Cleanup must stay in its test temporary directory');
    fs.rmSync(target, { recursive: true, force: true });
  }
};
