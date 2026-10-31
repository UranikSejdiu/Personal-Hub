const path = require('node:path');
const { spawnSync } = require('node:child_process');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this through npm run validate or npm run install:apps.');
for (const id of ['budget', 'notes', 'tasks', 'dhikr']) {
  const args = process.argv[2] === 'install' ? ['ci', '--prefer-offline', '--include=dev'] : ['run', 'validate'];
  const result = spawnSync(process.execPath, [npmCli, ...args], { cwd: path.resolve(__dirname, '..', 'apps', id), stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
