const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

module.exports = function verifyStandaloneReleases(root) {
  assert.equal(fs.existsSync(path.join(root, '.github/workflows/build-release.yml')), false, 'Hub must not have an active APK build workflow');
  assert.equal(fs.existsSync(path.join(root, 'app.json')), false, 'The root is repository tooling, not a Hub app');
  for (const id of ['budget', 'notes', 'tasks']) {
    const appRoot = path.join(root, 'apps', id);
    const identity = JSON.parse(fs.readFileSync(path.join(appRoot, 'src/appIdentity.json'), 'utf8'));
    const config = JSON.parse(fs.readFileSync(path.join(appRoot, 'app.json'), 'utf8')).expo;
    const pkg = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
    const lock = JSON.parse(fs.readFileSync(path.join(appRoot, 'package-lock.json'), 'utf8'));
    assert.equal(config.android.package, identity.packageId);
    assert.equal(config.scheme, identity.scheme);
    assert.equal(config.version, pkg.version);
    assert.equal(lock.version, pkg.version);
    assert.deepEqual(lock.packages[''].dependencies, pkg.dependencies);
    const raw = fs.readFileSync(path.join(root, `.github/workflows/build-${id}.yml`), 'utf8');
    const build = YAML.parse(raw);
    const checks = YAML.parse(fs.readFileSync(path.join(root, `.github/workflows/${id}-checks.yml`), 'utf8'));
    assert.deepEqual(build.on.push.tags, [`${identity.tagPrefix}*`]);
    assert.equal(build.jobs.build.defaults.run['working-directory'], `apps/${id}`);
    assert.equal(build.jobs.checks.uses, `./.github/workflows/${id}-checks.yml`);
    assert.deepEqual(build.jobs.publish.needs, ['checks', 'build']);
    assert.ok(build.jobs.publish.if.includes(`refs/tags/${identity.tagPrefix}`));
    const publisher = build.jobs.publish.steps.find(step => step.uses?.startsWith('softprops/action-gh-release'));
    assert.equal(publisher.with.make_latest, 'false');
    assert.equal(publisher.with.fail_on_unmatched_files, true);
    assert.ok(checks.on.pull_request.paths.includes(`apps/${id}/**`));
    assert.ok(raw.includes('${{ secrets.KEYSTORE_BASE64 }}'));
    assert.ok(!raw.includes('DHIKR_KEYSTORE'));
    const roots = [path.join(appRoot, 'src'), path.join(appRoot, 'app')];
    const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
    for (const file of roots.flatMap(walk).filter(file => /\.[jt]sx?$/.test(file))) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(/(?:from\s*|require\(\s*)["'](\.[^"']+)["']/g)) {
        assert.ok(path.resolve(path.dirname(file), match[1]).startsWith(appRoot + path.sep), `${file} imports outside its standalone app`);
      }
    }
  }
  return { name: 'Standalone apps have isolated source, version locks, signing, release gates, tags, and APK publishing channels', passed: true };
};
