const crypto = require('crypto');
const { db, ensureTalentsRow, getEconomySettings } = require('../src/db');

function makeQrId() {
  return crypto.randomBytes(16).toString('base64url');
}

function nowIso() {
  return new Date().toISOString();
}

const demoStudents = [
  'Avery Johnson',
  'Brooklyn Carter',
  'Caleb Wilson',
  'Daisy Patel',
  'Elijah Brooks',
  'Faith Ramirez',
  'Gavin Scott',
  'Hannah Lee',
  'Isaac Perry',
  'Jasmine Reed'
];

const demoItems = [
  { name: 'Granola Bar', price: 3, category: 'snack', sort: 1, inventory: 24, rarity: 'common' },
  { name: 'Fruit Snacks', price: 2, category: 'snack', sort: 2, inventory: 30, rarity: 'uncommon' },
  { name: 'Chocolate Chip Cookie', price: 4, category: 'snack', sort: 3, inventory: 18, rarity: 'rare' },
  { name: 'Sticker Pack', price: 6, category: 'trinket', sort: 4, inventory: 12, rarity: 'rare' },
  { name: 'Soda Can', price: 5, category: 'snack', sort: 5, inventory: 20, rarity: 'legendary' }
];

const insertStudent = db.prepare(`
  INSERT INTO students (name, qr_id, active, notes, created_at)
  VALUES (?, ?, 1, NULL, ?)
`);

const insertItem = db.prepare(`
  INSERT INTO items (name, price_shekels, inventory, active, sort_order, category, rarity, created_at)
  VALUES (?, ?, ?, 1, ?, ?, ?, ?)
`);

const insertTransaction = db.prepare(`
  INSERT INTO transactions (student_id, type, reason, amount_shekels, created_at)
  VALUES (?, ?, ?, ?, ?)
`);

const economy = getEconomySettings();

const existingCount = db.prepare('SELECT COUNT(*) as count FROM students').get().count;
if (existingCount > 0) {
  console.log('Database already has students. Seed skipped.');
  process.exit(0);
}

const createdAt = nowIso();

const studentIds = demoStudents.map((name) => {
  const qrId = makeQrId();
  const result = insertStudent.run(name, qrId, createdAt);
  ensureTalentsRow(result.lastInsertRowid);
  return result.lastInsertRowid;
});

for (const item of demoItems) {
  insertItem.run(item.name, item.price, item.inventory, item.sort, item.category, item.rarity, createdAt);
}

studentIds.forEach((id, index) => {
  insertTransaction.run(id, 'earn', 'Attendance', economy.attendance_shekels, createdAt);
  if (index % 2 === 0) {
    insertTransaction.run(id, 'earn', 'Participation', economy.participation_shekels, createdAt);
  }
});

console.log('Seed data added: 10 students and demo items.');
