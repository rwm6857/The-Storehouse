const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'storehouse-groupbuy-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'storehouse.sqlite');

const { db } = require('../src/db');
const { contributeToGroupBuy } = require('../src/lib/groupBuy');

function nowIso() {
  return new Date().toISOString();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getItem(id) {
  return db.prepare('SELECT * FROM items WHERE id = ?').get(id);
}

function run() {
  db.prepare(`
    INSERT INTO students (id, name, qr_id, active, notes, created_at)
    VALUES (1, 'Test Student', 'test-qr', 1, NULL, ?)
  `).run(nowIso());

  db.prepare(`
    INSERT INTO transactions (student_id, type, reason, amount_shekels, created_at)
    VALUES (1, 'earn', 'Seed', 200, ?)
  `).run(nowIso());

  db.prepare(`
    INSERT INTO items (
      id, name, price_shekels, inventory, active, sort_order, category, rarity,
      type, goal_amount, buy_in_cost, progress_amount, completed_at, created_at
    )
    VALUES (1, 'Group Buy Snack', 10, 0, 1, 0, 'snack', 'rare',
      'group_buy', 100, 10, 0, NULL, ?)
  `).run(nowIso());

  let result = contributeToGroupBuy(1, 1);
  assert(result.success, 'Expected first contribution to succeed.');
  result = contributeToGroupBuy(1, 1);
  assert(result.success, 'Expected second contribution to succeed.');
  result = contributeToGroupBuy(1, 1);
  assert(result.success, 'Expected third contribution to succeed.');

  const midItem = getItem(1);
  assert(midItem.progress_amount === 30, `Expected progress 30, got ${midItem.progress_amount}`);

  for (let i = 0; i < 7; i += 1) {
    contributeToGroupBuy(1, 1);
  }
  const completedItem = getItem(1);
  assert(completedItem.progress_amount >= 100, 'Expected progress to reach goal.');
  assert(completedItem.completed_at, 'Expected completed_at to be set.');

  const afterComplete = contributeToGroupBuy(1, 1);
  assert(afterComplete.error, 'Expected error contributing after completion.');

  db.prepare(`
    INSERT INTO students (id, name, qr_id, active, notes, created_at)
    VALUES (2, 'Low Balance', 'low-qr', 1, NULL, ?)
  `).run(nowIso());

  db.prepare(`
    INSERT INTO items (
      id, name, price_shekels, inventory, active, sort_order, category, rarity,
      type, goal_amount, buy_in_cost, progress_amount, completed_at, created_at
    )
    VALUES (2, 'Group Buy Gadget', 50, 0, 1, 0, 'trinket', 'uncommon',
      'group_buy', 200, 50, 0, NULL, ?)
  `).run(nowIso());

  const insufficient = contributeToGroupBuy(2, 2);
  assert(insufficient.error, 'Expected insufficient funds error.');

  const updatedItem = getItem(2);
  assert(updatedItem.progress_amount === 0, 'Expected no progress without funds.');

  // Seed funds and simulate multiple contributions.
  db.prepare(`
    INSERT INTO transactions (student_id, type, reason, amount_shekels, created_at)
    VALUES (1, 'earn', 'Seed 2', 250, ?)
  `).run(nowIso());

  for (let i = 0; i < 5; i += 1) {
    contributeToGroupBuy(1, 2);
  }
  const updatedAfter = getItem(2);
  assert(updatedAfter.progress_amount === 200, `Expected progress 200, got ${updatedAfter.progress_amount}`);
  assert(updatedAfter.completed_at, 'Expected item 2 to be complete.');

  // eslint-disable-next-line no-console
  console.log('Group buy verification passed.');
}

run();
