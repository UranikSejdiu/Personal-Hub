// Audit does not install packages or run lifecycle scripts. Avoid propagating
// npm's project-scoped allow-scripts flag into a nested npm invocation.
const { spawnSync } = require('node:child_process');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run npm run check:dependency-audit.');
const env = { ...process.env };
for (const key of Object.keys(env)) if (key.toLowerCase() === 'npm_config_allow_scripts') delete env[key];
const result = spawnSync(process.execPath, [npmCli, 'audit', '--audit-level=high'], { env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
