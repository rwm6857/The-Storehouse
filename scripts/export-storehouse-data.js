const path = require('path');
const { exportStorehouseData, writeExportFile } = require('../src/lib/dataTransfer');

function getStamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function run() {
  const targetPath = process.argv[2];
  const payload = exportStorehouseData();
  const outPath =
    targetPath ||
    path.join(__dirname, '..', 'build', `storehouse-export-${getStamp()}.json`);
  writeExportFile(outPath, payload);
  // eslint-disable-next-line no-console
  console.log(`Export written to ${outPath}`);
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Export failed', error);
  process.exit(1);
});
