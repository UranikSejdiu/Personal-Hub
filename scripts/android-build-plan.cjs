const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { APPS, appChangedSince, compare, githubGet, githubRepository, latestDownloadableRelease, listReleases, selectApps } = require('./app-versions.cjs');

function createPlan(root, selection = 'all', profile = 'universal', publish = false) {
  assert.ok(['universal', 'arm64-test'].includes(profile), 'Unknown Android build profile');
  assert.ok(!publish || profile === 'universal', 'Published APKs must support both ARM architectures');
  // Publish preflight filters against public APK releases, including when the
  // local Git tags are ahead of what users can download.
  const candidates = publish && selection === 'changed' ? APPS : selectApps(root, selection);
  return { include: candidates.map(id => {
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

async function checkRemote(plan, { repository, sha, ref, token, root, changedOnly = false, workingTree = false, request = fetch }) {
  assert.equal(ref, 'refs/heads/main', 'Publish releases from main only');
  assert.match(sha, /^[0-9a-f]{40}$/);
  assert.ok(token || workingTree, 'GitHub token required for release preflight');
  const get = githubGet(repository, token, request);
  const releases = await listReleases(get);

  const include = [];
  const waiting = [];
  for (const app of plan.include) {
    const previous = latestDownloadableRelease(app.id, releases);
    if (changedOnly && previous && !appChangedSince(root, app.id, previous.tag)) continue;

    const needsBump = `${app.title} (${app.tag}) needs a version bump. Run npm run version:bump -- ${app.id}.`;
    const published = releases.find(release => release.tag_name === app.tag && !release.draft);
    if (changedOnly && published) {
      waiting.push(needsBump);
      continue;
    }
    assert.ok(!published, `${app.tag} is already released. Increase the app version and Android versionCode before publishing an update.`);
    const existing = await get(`git/ref/tags/${app.tag}`);
    let target = existing?.object;
    for (let depth = 0; target?.type === 'tag' && depth < 8; depth++) {
      assert.match(target.sha, /^[0-9a-f]{40}$/);
      target = (await get(`git/tags/${target.sha}`))?.object;
    }
    if (existing) {
      assert.ok(target?.type === 'commit' && /^[0-9a-f]{40}$/.test(target.sha), `Cannot resolve ${app.tag} to a commit`);
      const appTree = commit => execFileSync('git', ['rev-parse', `${commit}:apps/${app.id}`], { cwd: root, encoding: 'utf8' }).trim();
      const matches = workingTree ? !appChangedSince(root, app.id, target.sha, true)
        : target.sha === sha || (root && appTree(target.sha) === appTree(sha));
      if (changedOnly && !matches) {
        waiting.push(needsBump);
        continue;
      }
      assert.ok(matches,
        `${app.tag} already points to another commit with different app files; prepare a newer version`);
    }
    // versionCode must also increase, even when the semantic version changes.
    if (previous) {
      assert.ok(compare(app.version, previous.version) > 0, `${app.id}: Version must exceed ${previous.tag}`);
      const previousConfig = await get(`contents/apps/${app.id}/app.json?ref=${encodeURIComponent(previous.tag)}`);
      assert.ok(previousConfig?.content, `Cannot verify previous Android versionCode for ${app.id}`);
      const old = JSON.parse(Buffer.from(previousConfig.content, 'base64').toString('utf8')).expo;
      assert.ok(app.versionCode > old.android.versionCode, `${app.id}: Android versionCode must exceed ${old.android.versionCode}`);
    }
    include.push(app);
  }
  return { include, waiting };
}

module.exports = { createPlan, checkRemote };
if (require.main === module) (async () => {
  const root = path.resolve(__dirname, '..');
  if (process.argv[2] === '--check') {
    const selection = process.argv[3] ?? 'changed';
    assert.ok(process.argv.length <= 4, 'Usage: npm run version:check -- [changed|all|app]');
    const plan = await checkRemote(createPlan(root, selection, 'universal', true), {
      root, workingTree: true, changedOnly: selection === 'changed', repository: githubRepository(root),
      sha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
      ref: 'refs/heads/main', token: process.env.GH_TOKEN,
    });
    for (const app of plan.include) console.log(`${app.title}: ${app.tag} · Android ${app.versionCode} · ${app.apk}`);
    for (const message of plan.waiting) console.log(message);
    if (!plan.include.length) console.log('No release-ready apps selected.');
    if (!plan.include.length && plan.waiting.length) process.exitCode = 1;
    return;
  }
  const publish = process.env.PUBLISH_RELEASES === 'true';
  const selection = process.env.SELECTED_APPS;
  let plan = createPlan(root, selection, process.env.BUILD_PROFILE, publish);
  if (publish) plan = await checkRemote(plan, {
    root, changedOnly: selection === 'changed', repository: process.env.GITHUB_REPOSITORY,
    sha: process.env.GITHUB_SHA, ref: process.env.GITHUB_REF, token: process.env.GITHUB_TOKEN,
  });
  const apps = plan.include.map(app => `- ${app.title} ${app.version} (Android ${app.versionCode})`).join('\n');
  const waiting = (plan.waiting ?? []).map(message => `- ${message}`).join('\n');
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Android apps\n\n${publish ? 'Publish releases' : 'Build APKs only'} · ${process.env.BUILD_PROFILE}\n\n${apps || 'No release-ready apps selected.'}\n${waiting ? `\n### Waiting for a version bump\n\n${waiting}\n` : ''}`);
  assert.ok(plan.include.length || !waiting, 'Changed apps need version bumps. See the run summary.');
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_apps=${plan.include.length > 0}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify({ include: plan.include })}\n`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
