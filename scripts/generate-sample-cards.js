const fs = require('fs');
const path = require('path');
const { generateStudentCardsPdf } = require('../src/lib/studentCardsPdf');

async function run() {
  const samples = [
    { id: 1, name: 'Ava Johnson', qr_id: 'sample-001' },
    { id: 2, name: 'Christopher Alessandro Montgomery', qr_id: 'sample-002' },
    { id: 3, name: 'Liam Chen', qr_id: 'sample-003' },
    { id: 4, name: 'Olivia Martinez', qr_id: 'sample-004' },
    { id: 5, name: 'Amelia Rutherford-Smythe', qr_id: 'sample-005' },
    { id: 6, name: 'Noah Patel', qr_id: 'sample-006' },
    { id: 7, name: 'Sophia Nguyen', qr_id: 'sample-007' },
    { id: 8, name: 'Jackson Davis', qr_id: 'sample-008' }
  ];

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
