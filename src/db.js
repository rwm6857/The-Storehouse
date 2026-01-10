const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'storehouse.sqlite');
const dbPath = process.env.DATABASE_PATH || DEFAULT_DB_PATH;

const dbDir = path.dirname(dbPath);
fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    qr_id TEXT NOT NULL UNIQUE,
    active INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    reason TEXT,
    amount_shekels INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (student_id) REFERENCES students(id)
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price_shekels INTEGER NOT NULL,
    inventory INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    category TEXT NOT NULL DEFAULT 'snack',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS talents_ledger (
    student_id INTEGER PRIMARY KEY,
    talents INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (student_id) REFERENCES students(id)
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_student ON transactions(student_id);
  CREATE INDEX IF NOT EXISTS idx_students_active ON students(active);
  CREATE INDEX IF NOT EXISTS idx_items_active ON items(active);
`);

const itemColumns = db.prepare('PRAGMA table_info(items)').all();
const hasInventory = itemColumns.some((col) => col.name === 'inventory');
if (!hasInventory) {
  db.exec('ALTER TABLE items ADD COLUMN inventory INTEGER NOT NULL DEFAULT 0');
}
db.exec('UPDATE items SET inventory = 0 WHERE inventory IS NULL');

const defaultEconomy = {
  attendance_shekels: 2,
  participation_shekels: 1,
  memory_verse_shekels: 3,
  bonus_min: 0,
  bonus_max: 3,
  shekels_per_talent: 25
};

const defaultLabels = {
  shekels_label: 'Shekels',
  talents_label: 'Talents'
};

function upsertSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

function getSetting(key) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
}

function initSettings() {
  const economyRow = getSetting('economy');
  if (!economyRow) {
    upsertSetting('economy', JSON.stringify(defaultEconomy));
  }

  const labelsRow = getSetting('labels');
  if (!labelsRow) {
    upsertSetting('labels', JSON.stringify(defaultLabels));
  }
}

function getEconomySettings() {
  const row = getSetting('economy');
  try {
    return row ? JSON.parse(row.value) : { ...defaultEconomy };
  } catch {
    return { ...defaultEconomy };
  }
}

function setEconomySettings(settings) {
  upsertSetting('economy', JSON.stringify(settings));
}

function getCurrencyLabels() {
  const row = getSetting('labels');
  try {
    return row ? JSON.parse(row.value) : { ...defaultLabels };
  } catch {
    return { ...defaultLabels };
  }
}

function setCurrencyLabels(labels) {
  upsertSetting('labels', JSON.stringify(labels));
}

function ensureTalentsRow(studentId) {
  db.prepare(`
    INSERT INTO talents_ledger (student_id, talents)
    VALUES (?, 0)
    ON CONFLICT(student_id) DO NOTHING
  `).run(studentId);
}

initSettings();

module.exports = {
  db,
  dbPath,
  defaultEconomy,
  getEconomySettings,
  setEconomySettings,
  getCurrencyLabels,
  setCurrencyLabels,
  ensureTalentsRow
};
