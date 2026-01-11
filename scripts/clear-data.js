const { db } = require('../src/db');

const resetData = db.transaction(() => {
  db.prepare('DELETE FROM transactions').run();
  db.prepare('DELETE FROM talents_ledger').run();
  db.prepare('DELETE FROM students').run();
  db.prepare('DELETE FROM items').run();
  db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('students','transactions','items','talents_ledger')").run();
});

resetData();

// eslint-disable-next-line no-console
console.log('Storehouse data cleared: students, items, transactions, talents.');
