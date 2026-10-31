const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const APPS = ['budget', 'notes', 'tasks', 'dhikr'];
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
function parts(version) {
  assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 'Use a stable major.minor.patch version');
  const values = version.split('.').map(Number);
  assert.ok(values.every(Number.isSafeInteger), 'Version is too large');
  return values;
}
function compare(a, b) { const aa = parts(a), bb = parts(b); return aa[0] - bb[0] || aa[1] - bb[1] || aa[2] - bb[2]; }
function increment(version, level) {
  const values = parts(version), index = ['major', 'minor', 'patch'].indexOf(level);
  assert.ok(index >= 0, 'Choose patch, minor, or major');
  values[index]++;
  for (let i = index + 1; i < 3; i++) values[i] = 0;
  const next = values.join('.'); parts(next); return next;
}
function latestRelease(root, id) {
  assert.ok(APPS.includes(id));
  const prefix = `${id}-v`;
  const tags = git(root, 'tag', '--list', `${prefix}*`).trim().split('\n')
    .filter(tag => new RegExp(`^${id}-v\\d+\\.\\d+\\.\\d+$`).test(tag))
    .sort((a, b) => compare(b.slice(prefix.length), a.slice(prefix.length)));
  if (!tags.length) return null;
  const tag = tags[0], version = tag.slice(prefix.length);
  const config = JSON.parse(git(root, 'show', `${tag}:apps/${id}/app.json`)).expo;
  assert.equal(config.version, version, `${tag}: tag and APK versions disagree`);
  assert.ok(Number.isSafeInteger(config.android.versionCode) && config.android.versionCode > 0);
  return { tag, version, code: config.android.versionCode };
}
function releaseRelevant(file, id) {
  const prefix = `apps/${id}/`;
  if (!file.startsWith(prefix)) return false;
  const relative = file.slice(prefix.length);
  return !(/^scripts\//.test(relative) || /^[^/]+\.md$/i.test(relative) || relative === '.gitignore');
}
function changedApps(root) {
  return APPS.filter(id => {
    const release = latestRelease(root, id);
    if (!release) return true; // First release uses its existing version.
    const files = [
      ...git(root, 'diff', '--name-only', '-z', release.tag, '--', `apps/${id}`).split('\0'),
      ...git(root, 'ls-files', '--others', '--exclude-standard', '-z', '--', `apps/${id}`).split('\0'),
    ];
    return files.some(file => releaseRelevant(file, id));
  });
}
function selectApps(root, selection = 'changed') {
  if (selection === 'changed') return changedApps(root);
  if (selection === 'all') return [...APPS];
  const ids = selection.split(',');
  assert.ok(ids.length && ids.every(id => APPS.includes(id)), 'Choose changed, all, or app names separated by commas');
  return [...new Set(ids)];
}
function prepareVersions(root, selection = 'changed', level = 'patch') {
  assert.ok(['patch', 'minor', 'major'].includes(level), 'Choose patch, minor, or major');
  return selectApps(root, selection).map(id => {
    const relativeFiles = ['package.json', 'package-lock.json', 'app.json'];
    const files = relativeFiles.map(name => {
      const file = path.join(root, 'apps', id, name), before = fs.readFileSync(file, 'utf8');
      return { file, before, json: JSON.parse(before) };
    });
    const [pkg, lock, config] = files.map(file => file.json), version = pkg.version;
    parts(version);
    assert.equal(lock.version, version, `${id}: package-lock version differs`);
    assert.equal(lock.packages[''].version, version, `${id}: package-lock root version differs`);
    assert.equal(config.expo.version, version, `${id}: app.json version differs`);
    const code = config.expo.android.versionCode;
    assert.ok(Number.isSafeInteger(code) && code > 0, `${id}: invalid Android versionCode`);
    const released = latestRelease(root, id);
    let next = version, nextCode = code, status = 'First release already prepared';
    if (released) {
      assert.ok(compare(version, released.version) >= 0, `${id}: current version is behind ${released.tag}`);
      assert.ok(code >= released.code, `${id}: Android versionCode is behind its release`);
      if (compare(version, released.version) > 0) assert.ok(code > released.code, `${id}: prepared version also needs a higher Android versionCode`);
      else assert.equal(code, released.code, `${id}: Android versionCode changed without a version increase`);
      const desired = increment(released.version, level);
      if (compare(version, desired) < 0) {
        next = desired; nextCode = code + 1; status = 'Version increased';
        assert.ok(Number.isSafeInteger(nextCode), `${id}: Android versionCode is too large`);
      } else status = 'Next release already prepared';
    }
    pkg.version = lock.version = lock.packages[''].version = config.expo.version = next;
    config.expo.android.versionCode = nextCode;
    return { id, from: version, version: next, fromCode: code, code: nextCode, status,
      files: files.filter(() => next !== version || nextCode !== code).map(file => ({
        file: file.file, before: file.before,
        after: (JSON.stringify(file.json, null, 2) + '\n').replace(/\n/g, file.before.includes('\r\n') ? '\r\n' : '\n'),
      })) };
  });
}
function applyVersions(plan, io = fs) {
  const files = plan.flatMap(app => app.files), staged = [], replaced = [];
  // Validate every app before touching a version file, including edits made
  // between preview and apply. Stage complete JSON files before replacements.
  for (const file of files) assert.equal(io.readFileSync(file.file, 'utf8'), file.before, `${file.file} changed; prepare again`);
  try {
    files.forEach((file, index) => {
      const temporary = `${file.file}.version-${process.pid}-${index}.tmp`;
      const descriptor = io.openSync(temporary, 'wx');
      staged.push({ ...file, temporary });
      try { io.writeFileSync(descriptor, file.after); }
      finally { io.closeSync(descriptor); }
    });
    for (const file of staged) { io.renameSync(file.temporary, file.file); replaced.push(file); }
  } catch (error) {
    const failures = [];
    for (const file of replaced.reverse()) {
      try { io.writeFileSync(file.file, file.before); } catch (rollback) { failures.push(rollback); }
    }
    if (failures.length) throw new AggregateError([error, ...failures], 'Version write failed; some files need recovery from Git');
    throw error;
  } finally {
    for (const file of staged) if (io.existsSync(file.temporary)) io.unlinkSync(file.temporary);
  }
}
module.exports = { APPS, latestRelease, changedApps, selectApps, prepareVersions, applyVersions };

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.includes('--help')) {
      console.log('npm run version:bump -- [changed|all|tasks|budget,notes] [--bump patch|minor|major] [--dry-run] [--offline]\nDefaults: changed apps, patch increase. Fetches origin tags unless --offline. Never commits, pushes, tags, builds, or publishes.');
    } else {
      let selection = 'changed', level = 'patch', selected = false;
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--bump') { level = args[++i]; assert.ok(level, 'Missing bump level'); }
        else if (['--dry-run', '--offline'].includes(arg)) continue;
        else { assert.ok(!arg.startsWith('-') && !selected, `Unknown argument: ${arg}`); selection = arg; selected = true; }
      }
      const root = path.resolve(__dirname, '..');
      if (!args.includes('--offline')) git(root, 'fetch', 'origin', '--tags');
      const plan = prepareVersions(root, selection, level);
      if (!args.includes('--dry-run')) applyVersions(plan);
      if (!plan.length) console.log('No app changes since the latest release tags. No versions changed.');
      for (const app of plan) console.log(`${app.id}: ${app.from} (${app.fromCode}) → ${app.version} (${app.code}) · ${app.status}${args.includes('--dry-run') ? ' · preview only' : ''}`);
      console.log('No commits, pushes, builds, or releases were created.');
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
