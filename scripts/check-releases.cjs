const path = require('node:path');
(async () => {
  const root = path.resolve(__dirname, '..');
  const result = require('./standalone-release-regression.cjs')(root);
  console.log(result.name);
  await require('./android-build-regression.cjs')(root);
  require('./app-versions-regression.cjs')();
})().catch(error => { console.error(error); process.exitCode = 1; });
