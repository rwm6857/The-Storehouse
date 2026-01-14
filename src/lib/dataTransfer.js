const fs = require('fs');
const path = require('path');
const { db } = require('../db');
const { normalizeRarity } = require('./rarity');

const EXPORT_VERSION = 1;

function exportStorehouseData() {
  return {
    version: EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    students: db.prepare(`
      SELECT id, name, qr_id, active, notes, created_at
      FROM students
      ORDER BY id ASC
    `).all(),
    items: db.prepare(`
      SELECT id, name, price_shekels, inventory, active, sort_order, category, rarity,
             type, goal_amount, buy_in_cost, progress_amount, completed_at, created_at
      FROM items
      ORDER BY id ASC
    `).all(),
    transactions: db.prepare(`
      SELECT id, student_id, type, reason, amount_shekels, created_at
      FROM transactions
      ORDER BY id ASC
    `).all(),
    talents: db.prepare(`
      SELECT student_id, talents
      FROM talents_ledger
      ORDER BY student_id ASC
    `).all(),
    settings: db.prepare(`
      SELECT key, value
      FROM settings
      ORDER BY key ASC
    `).all()
  };
}

function coerceInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function requireInt(value, fieldName) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} must be a number.`);
  }
  return parsed;
}

function coerceBool(value, fallback = 0) {
  if (value === null || typeof value === 'undefined') {
    return fallback;
  }
  return value ? 1 : 0;
}

function ensureString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Import payload must be a JSON object.');
  }

  return {
    students: Array.isArray(payload.students) ? payload.students : [],
    items: Array.isArray(payload.items) ? payload.items : [],
    transactions: Array.isArray(payload.transactions) ? payload.transactions : [],
    talents: Array.isArray(payload.talents) ? payload.talents : [],
    settings: Array.isArray(payload.settings) ? payload.settings : null
  };
}

function importStorehouseData(payload) {
  const data = normalizePayload(payload);
  const nowIso = new Date().toISOString();

  const importTx = db.transaction(() => {
    db.prepare('DELETE FROM transactions').run();
    db.prepare('DELETE FROM talents_ledger').run();
    db.prepare('DELETE FROM students').run();
    db.prepare('DELETE FROM items').run();
    if (data.settings) {
      db.prepare('DELETE FROM settings').run();
    }

    const insertStudent = db.prepare(`
      INSERT INTO students (id, name, qr_id, active, notes, created_at)
      VALUES (@id, @name, @qr_id, @active, @notes, @created_at)
    `);
    data.students.forEach((student) => {
      if (!student || !student.name || !student.qr_id) {
        throw new Error('Student rows must include id, name, and qr_id.');
      }
      insertStudent.run({
        id: requireInt(student.id, 'students.id'),
        name: ensureString(student.name),
        qr_id: ensureString(student.qr_id),
        active: coerceBool(student.active, 1),
        notes: student.notes ? ensureString(student.notes) : null,
        created_at: ensureString(student.created_at, nowIso)
      });
    });

    const insertItem = db.prepare(`
      INSERT INTO items (
        id, name, price_shekels, inventory, active, sort_order, category, rarity,
        type, goal_amount, buy_in_cost, progress_amount, completed_at, created_at
      )
      VALUES (
        @id, @name, @price_shekels, @inventory, @active, @sort_order, @category, @rarity,
        @type, @goal_amount, @buy_in_cost, @progress_amount, @completed_at, @created_at
      )
    `);
    data.items.forEach((item) => {
      if (!item || !item.name) {
        throw new Error('Item rows must include id and name.');
      }
      const itemType = item.type === 'group_buy' ? 'group_buy' : 'standard';
      insertItem.run({
        id: requireInt(item.id, 'items.id'),
        name: ensureString(item.name),
        price_shekels: coerceInt(item.price_shekels),
        inventory: coerceInt(item.inventory),
        active: coerceBool(item.active, 1),
        sort_order: coerceInt(item.sort_order),
        category: ensureString(item.category || 'snack'),
        rarity: normalizeRarity(item.rarity),
        type: itemType,
        goal_amount: Number.isFinite(Number.parseInt(item.goal_amount, 10)) ? Number.parseInt(item.goal_amount, 10) : null,
        buy_in_cost: Number.isFinite(Number.parseInt(item.buy_in_cost, 10)) ? Number.parseInt(item.buy_in_cost, 10) : null,
        progress_amount: coerceInt(item.progress_amount),
        completed_at: item.completed_at ? ensureString(item.completed_at) : null,
        created_at: ensureString(item.created_at, nowIso)
      });
    });

    const insertTalent = db.prepare(`
      INSERT INTO talents_ledger (student_id, talents)
      VALUES (@student_id, @talents)
    `);
    data.talents.forEach((entry) => {
      insertTalent.run({
        student_id: requireInt(entry.student_id, 'talents.student_id'),
        talents: coerceInt(entry.talents)
      });
    });

    if (data.settings) {
      const insertSetting = db.prepare(`
        INSERT INTO settings (key, value)
        VALUES (@key, @value)
      `);
      data.settings.forEach((setting) => {
        if (!setting || !setting.key) {
          throw new Error('Settings rows must include key.');
        }
        insertSetting.run({
          key: ensureString(setting.key),
          value: ensureString(setting.value)
        });
      });
    }

    const insertTransaction = db.prepare(`
      INSERT INTO transactions (id, student_id, type, reason, amount_shekels, created_at)
      VALUES (@id, @student_id, @type, @reason, @amount_shekels, @created_at)
    `);
    data.transactions.forEach((tx) => {
      if (!tx || !tx.type) {
        throw new Error('Transaction rows must include id, student_id, and type.');
      }
      insertTransaction.run({
        id: requireInt(tx.id, 'transactions.id'),
        student_id: requireInt(tx.student_id, 'transactions.student_id'),
        type: ensureString(tx.type),
        reason: tx.reason ? ensureString(tx.reason) : null,
        amount_shekels: coerceInt(tx.amount_shekels),
        created_at: ensureString(tx.created_at, nowIso)
      });
    });
  });

  importTx();
}

function writeExportFile(filePath, payload) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

module.exports = {
  exportStorehouseData,
  importStorehouseData,
  writeExportFile
};
