const { db } = require('../db');

function nowIso() {
  return new Date().toISOString();
}

const getBalanceStmt = db.prepare(`
  SELECT COALESCE(SUM(amount_shekels), 0) AS balance
  FROM transactions
  WHERE student_id = ?
`);

const getItemStmt = db.prepare('SELECT * FROM items WHERE id = ? AND active = 1');

const insertTransactionStmt = db.prepare(`
  INSERT INTO transactions (student_id, type, reason, amount_shekels, created_at)
  VALUES (?, ?, ?, ?, ?)
`);

const updateProgressStmt = db.prepare(`
  UPDATE items
  SET progress_amount = progress_amount + ?,
      completed_at = CASE
        WHEN progress_amount + ? >= goal_amount AND completed_at IS NULL THEN ?
        ELSE completed_at
      END
  WHERE id = ?
    AND active = 1
    AND type = 'group_buy'
    AND progress_amount < goal_amount
    AND completed_at IS NULL
`);

const getProgressStmt = db.prepare(`
  SELECT progress_amount, goal_amount, completed_at
  FROM items
  WHERE id = ?
`);

const contributeToGroupBuy = db.transaction((studentId, itemId) => {
  const item = getItemStmt.get(itemId);
  if (!item) {
    return { error: 'Item is not available.' };
  }
  if (item.type !== 'group_buy') {
    return { error: 'Item is not a group buy.' };
  }

  const goalAmount = Number.parseInt(item.goal_amount, 10);
  const buyInCost = Number.parseInt(item.buy_in_cost, 10);
  const progress = Number.parseInt(item.progress_amount, 10) || 0;
  if (!Number.isFinite(goalAmount) || goalAmount <= 0 || !Number.isFinite(buyInCost) || buyInCost <= 0) {
    return { error: 'Group buy is not configured.' };
  }
  if (item.completed_at || progress >= goalAmount) {
    return { error: 'Group buy is already complete.' };
  }

  const balanceRow = getBalanceStmt.get(studentId);
  if ((balanceRow?.balance || 0) < buyInCost) {
    return { error: 'Not enough Shekels.' };
  }

  const updatedAt = nowIso();
  const update = updateProgressStmt.run(buyInCost, buyInCost, updatedAt, itemId);
  if (update.changes === 0) {
    return { error: 'Group buy is already complete.' };
  }

  insertTransactionStmt.run(
    studentId,
    'group_buy',
    `Group Buy: ${item.name}`,
    -Math.abs(buyInCost),
    updatedAt
  );

  const latest = getProgressStmt.get(itemId);
  const complete = latest && Number.parseInt(latest.progress_amount, 10) >= goalAmount;
  return { success: true, complete };
});

module.exports = {
  contributeToGroupBuy
};
