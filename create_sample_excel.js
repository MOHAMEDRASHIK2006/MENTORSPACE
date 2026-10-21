const { spawnSync } = require('child_process');
const path = require('path');

const result = spawnSync(
  process.execPath,
  [path.join(__dirname, 'backend', 'scripts', 'createSampleExcel.js')],
  { stdio: 'inherit' }
);

if (result.error) throw result.error;
process.exitCode = result.status || 0;
