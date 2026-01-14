const fs = require('fs');
const path = require('path');
const { generateStudentCardsPdf } = require('../src/lib/studentCardsPdf');

async function run() {
  const samples = Array.from({ length: 12 }, (_, index) => ({
    id: index + 1,
    name: `Student ${String(index + 1).padStart(2, '0')}`,
    qr_id: `sample-${String(index + 1).padStart(3, '0')}`
  }));

  const pdfBytes = await generateStudentCardsPdf({
    students: samples,
    baseUrl: 'http://localhost:3040'
  });

  const outDir = path.join(__dirname, '..', 'build');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'storehouse-student-cards-sample.pdf');
  fs.writeFileSync(outPath, Buffer.from(pdfBytes));
  // eslint-disable-next-line no-console
  console.log(`Sample PDF written to ${outPath}`);
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to generate sample PDF', error);
  process.exit(1);
});
