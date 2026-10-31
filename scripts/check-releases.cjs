const path = require('node:path');
const result = require('./standalone-release-regression.cjs')(path.resolve(__dirname, '..'));
console.log(result.name);
