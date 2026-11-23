const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

module.exports = function verifyStandaloneReleases(root) {
  assert.equal(fs.existsSync(path.join(root, '.github/workflows/build-release.yml')), false, 'Hub must not have an active APK build workflow');
  assert.equal(fs.existsSync(path.join(root, 'app.json')), false, 'The root is repository tooling, not a Hub app');
  const workflowRoot = path.join(root, '.github/workflows');
  assert.deepEqual(fs.readdirSync(workflowRoot).filter(name => /\.ya?ml$/.test(name)), ['android.yml'], 'Keep a single visible workflow');
  const raw = fs.readFileSync(path.join(workflowRoot, 'android.yml'), 'utf8');
  const build = YAML.parse(raw);
  assert.deepEqual(Object.keys(build.on), ['workflow_dispatch'], 'Build and publication are manual');
  assert.deepEqual(build.on.workflow_dispatch.inputs.apps.options, ['changed', 'all', 'budget', 'notes', 'tasks', 'dhikr']);
  assert.equal(build.on.workflow_dispatch.inputs.apps.default, 'changed');
  assert.equal(build.jobs.plan.steps[0].with['fetch-depth'], 0);
  assert.equal(build.on.workflow_dispatch.inputs.publish.default, true);
  assert.deepEqual(build.jobs.publish.needs, ['plan', 'build']);
  assert.equal(build.jobs.publish.if, "inputs.publish && needs.plan.outputs.has_apps == 'true'");
  assert.equal(build.jobs.build.if, "needs.plan.outputs.has_apps == 'true'");
  assert.equal(build.jobs.build.strategy['fail-fast'], false);
  assert.ok(build.jobs.build.steps.some(step => step.run === 'npm run validate'));
  for (const id of ['budget', 'notes', 'tasks', 'dhikr']) {
    const { scripts } = JSON.parse(fs.readFileSync(path.join(root, 'apps', id, 'package.json'), 'utf8'));
    assert.ok(scripts.validate.startsWith('npm run check:dependency-audit && '), `${id} must audit before validation`);
    assert.equal(scripts['check:dependency-audit'], 'node scripts/audit-dependencies.cjs');
    const audit = fs.readFileSync(path.join(root, 'apps', id, 'scripts/audit-dependencies.cjs'), 'utf8');
    const processStub = { execPath: 'node', env: { npm_execpath: 'npm-cli.js', npm_config_allow_scripts: 'test' } };
    require('node:vm').runInNewContext(audit, {
      process: processStub,
      require(name) {
        assert.equal(name, 'node:child_process');
        return { spawnSync(executable, args, options) {
          assert.equal(executable, 'node');
          assert.deepEqual(Array.from(args), ['npm-cli.js', 'audit', '--include=dev', '--audit-level=moderate']);
          assert.equal(options.env.npm_config_allow_scripts, undefined);
          return { status: 1 };
        } };
      },
    });
    assert.equal(processStub.exitCode, 1, `${id} must propagate a failed audit`);
  }
  assert.ok(build.jobs.build.steps.some(step => step.run === 'npm run bundle:check'));
  assert.ok(build.jobs.build.steps.some(step => step.run === 'npm run build:apk'));
  assert.equal(build.jobs.publish.permissions.contents, 'write');
  const publisher = build.jobs.publish.steps.find(step => step.run?.includes('gh release create'));
  assert.ok(publisher.run.includes('test -s "release/$RELEASE_APK"'));
  assert.ok(publisher.run.includes('--target "$GITHUB_SHA"'));
  assert.ok(publisher.run.includes('--latest=false'));
  assert.ok(publisher.run.includes('gh release view'));
  assert.equal(publisher.env.RELEASE_APK, '${{ matrix.apk }}');
  const artifactUploads = build.jobs.build.steps.filter(step => step.uses?.startsWith('actions/upload-artifact'));
  assert.equal(artifactUploads.length, 2);
  assert.ok(artifactUploads.every(step => step.with['retention-days'] === 1));
  assert.ok(raw.includes('${{ secrets.KEYSTORE_BASE64 }}'));
  assert.ok(raw.includes('${{ secrets.DHIKR_KEYSTORE_BASE64 }}'));
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
    const roots = [path.join(appRoot, 'src'), path.join(appRoot, 'app')];
    const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
    for (const file of roots.flatMap(walk).filter(file => /\.[jt]sx?$/.test(file))) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(/(?:from\s*|require\(\s*)["'](\.[^"']+)["']/g)) {
        assert.ok(path.resolve(path.dirname(file), match[1]).startsWith(appRoot + path.sep), `${file} imports outside its standalone app`);
      }
    }
  }
  return { name: 'One manual Android workflow preserves isolated apps, signing keys, validation gates, and update channels', passed: true };
};
