const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { selectApps } = require('./app-versions.cjs');

const APPS = ['budget', 'notes', 'tasks', 'dhikr'];
function createPlan(root, selection = 'all', profile = 'universal', publish = false) {
  assert.ok(['changed', 'all', ...APPS].includes(selection), 'Choose changed, all or a known app');
  assert.ok(['universal', 'arm64-test'].includes(profile), 'Unknown Android build profile');
  assert.ok(!publish || profile === 'universal', 'Published APKs must support both ARM architectures');
  return { include: selectApps(root, selection).map(id => {
    const read = file => JSON.parse(fs.readFileSync(path.join(root, 'apps', id, file), 'utf8'));
    const pkg = read('package.json'), lock = read('package-lock.json'), config = read('app.json').expo;
    assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
    assert.equal(config.version, pkg.version, `${id}: app and package versions differ`);
    assert.equal(lock.version, pkg.version, `${id}: lock version differs`);
    assert.equal(lock.packages[''].version, pkg.version, `${id}: lock root version differs`);
    assert.ok(Number.isSafeInteger(config.android.versionCode) && config.android.versionCode > 0);
    const apkPrefix = id[0].toUpperCase() + id.slice(1);
    const title = config.name;
    assert.ok(typeof title === 'string' && title.trim(), `${id}: app display name is missing`);
    const artifactPrefix = title.replace(/\s+/g, '-');
    const suffix = profile === 'arm64-test' ? '-arm64-test' : '';
    return { id, title, version: pkg.version, versionCode: config.android.versionCode,
      tag: `${id}-v${pkg.version}`, packageId: config.android.package,
      artifact: `${artifactPrefix}-APK${suffix}`, apk: `${apkPrefix}-${pkg.version}${suffix}.apk` };
  }) };
}

async function checkRemote(plan, { repository, sha, ref, token, request = fetch }) {
  assert.equal(ref, 'refs/heads/main', 'Publish releases from main only');
  assert.match(repository, /^[\w.-]+\/[\w.-]+$/);
  assert.match(sha, /^[0-9a-f]{40}$/);
  assert.ok(token, 'GitHub token required for release preflight');
  for (const app of plan.include) {
    const get = async endpoint => {
      const response = await request(`https://api.github.com/repos/${repository}/${endpoint}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'uranik-android-builds' },
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`${app.id}: GitHub preflight failed (${response.status})`);
      return response.json();
    };
    assert.equal(await get(`releases/tags/${app.tag}`), null, `${app.tag} is already released. Increase the app version and Android versionCode before publishing an update.`);
    const existing = await get(`git/ref/tags/${app.tag}`);
    let target = existing?.object;
    for (let depth = 0; target?.type === 'tag' && depth < 8; depth++) {
      assert.match(target.sha, /^[0-9a-f]{40}$/);
      target = (await get(`git/tags/${target.sha}`))?.object;
    }
    assert.ok(!existing || (target?.type === 'commit' && target.sha === sha), `${app.tag} already points to another commit; never move a distributed tag`);
    // versionCode must also increase, even when the semantic version changes.
    const releases = await get('releases?per_page=100');
    const previous = releases?.find(release => !release.draft && !release.prerelease && release.tag_name.startsWith(`${app.id}-v`));
    if (previous) {
      const oldVersion = previous.tag_name.slice(`${app.id}-v`.length).split('.').map(Number);
      const nextVersion = app.version.split('.').map(Number);
      const changed = nextVersion.findIndex((part, index) => part !== oldVersion[index]);
      assert.ok(changed >= 0 && nextVersion[changed] > oldVersion[changed], `${app.id}: Version must exceed ${previous.tag_name}`);
      const previousConfig = await get(`contents/apps/${app.id}/app.json?ref=${encodeURIComponent(previous.tag_name)}`);
      assert.ok(previousConfig?.content, `Cannot verify previous Android versionCode for ${app.id}`);
      const old = JSON.parse(Buffer.from(previousConfig.content, 'base64').toString('utf8')).expo;
      assert.ok(app.versionCode > old.android.versionCode, `${app.id}: Android versionCode must exceed ${old.android.versionCode}`);
    }
  }
}

module.exports = { createPlan, checkRemote };
if (require.main === module) (async () => {
  const root = path.resolve(__dirname, '..');
  const publish = process.env.PUBLISH_RELEASES === 'true';
  const plan = createPlan(root, process.env.SELECTED_APPS, process.env.BUILD_PROFILE, publish);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_apps=${plan.include.length > 0}\n`);
  if (publish) await checkRemote(plan, { repository: process.env.GITHUB_REPOSITORY, sha: process.env.GITHUB_SHA, ref: process.env.GITHUB_REF, token: process.env.GITHUB_TOKEN });
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify(plan)}\n`);
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Android apps\n\n${publish ? 'Publish releases' : 'Build APKs only'} · ${process.env.BUILD_PROFILE}\n\n${plan.include.map(app => `- ${app.title} ${app.version} (Android ${app.versionCode})`).join('\n')}\n`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
