const fs = require('fs');
const path = require('path');
const { importStorehouseData } = require('../src/lib/dataTransfer');

async function run() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error('Usage: node scripts/import-storehouse-data.js <path-to-json>');
  }
  const resolved = path.resolve(inputPath);
  const raw = fs.readFileSync(resolved, 'utf8');
  const payload = JSON.parse(raw);
  importStorehouseData(payload);
  // eslint-disable-next-line no-console
  console.log(`Import complete from ${resolved}`);
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Import failed', error);
  process.exit(1);
});
