const express = require('express');
const QRCode = require('qrcode');
const { db, getEconomySettings, ensureTalentsRow } = require('../db');
const { normalizeRarity, getRarityTokens, hexToRgba } = require('../lib/rarity');

function nowIso() {
  return new Date().toISOString();
}

function publicRoutes() {
  const router = express.Router();

  const listStudentsStmt = db.prepare(`
    SELECT s.*, COALESCE(SUM(t.amount_shekels), 0) AS balance, COALESCE(l.talents, 0) AS talents
    FROM students s
    LEFT JOIN transactions t ON t.student_id = s.id
    LEFT JOIN talents_ledger l ON l.student_id = s.id
    WHERE s.active = 1
    GROUP BY s.id
    ORDER BY s.name COLLATE NOCASE
  `);

  const studentByQrStmt = db.prepare(`
    SELECT s.*, COALESCE(SUM(t.amount_shekels), 0) AS balance, COALESCE(l.talents, 0) AS talents
    FROM students s
    LEFT JOIN transactions t ON t.student_id = s.id
    LEFT JOIN talents_ledger l ON l.student_id = s.id
    WHERE s.qr_id = ?
    GROUP BY s.id
  `);

  const recentTransactionsStmt = db.prepare(`
    SELECT * FROM transactions
    WHERE student_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 10
  `);

  const activeItemsStmt = db.prepare(`
    SELECT * FROM items
    WHERE active = 1 AND inventory > 0
    ORDER BY sort_order ASC, name COLLATE NOCASE ASC
  `);

  const homeItemsStmt = db.prepare(`
    SELECT * FROM items
    ORDER BY active DESC, sort_order ASC, name COLLATE NOCASE ASC
  `);

  const insertTransactionStmt = db.prepare(`
    INSERT INTO transactions (student_id, type, reason, amount_shekels, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  router.get('/', (req, res) => {
    const students = listStudentsStmt.all();
    const items = homeItemsStmt.all();
    res.render('pages/index', { students, items });
  });

  router.get('/scan', (req, res) => {
    res.render('pages/scan');
  });

  router.get('/s/:qr_id', (req, res) => {
    const student = studentByQrStmt.get(req.params.qr_id);
    if (!student) {
      return res.status(404).render('pages/not-found');
    }
    ensureTalentsRow(student.id);

    const economy = getEconomySettings();
    const rawItems = activeItemsStmt.all();
    const transactions = recentTransactionsStmt.all(student.id);
    const items = rawItems.map((item) => {
      const rarity = normalizeRarity(item.rarity);
      const rarityTokens = getRarityTokens(rarity);
      const rarityBorderSoft = rarityTokens ? hexToRgba(rarityTokens.border, 0.25) : null;
      const price = Number.parseInt(item.price_shekels, 10) || 0;
      const canAfford = student.balance >= price;
      const soldOut = item.inventory <= 0;
      const canBuy = canAfford && !soldOut;
      return {
        ...item,
        rarity,
        rarityTokens,
        rarityBorderSoft,
        canAfford,
        soldOut,
        canBuy
      };
    });

    const purchasedId = Number.parseInt(req.query.purchased, 10);
    let purchaseNotice = null;
    if (Number.isFinite(purchasedId)) {
      const purchasedItem = db.prepare('SELECT name, price_shekels FROM items WHERE id = ?').get(purchasedId);
      if (purchasedItem) {
        purchaseNotice = {
          name: purchasedItem.name,
          price: purchasedItem.price_shekels
        };
      }
    }

    return res.render('pages/student', {
      student,
      economy,
      items,
      transactions,
      purchaseNotice
    });
  });

  router.post('/s/:qr_id/earn', (req, res) => {
    const student = studentByQrStmt.get(req.params.qr_id);
    if (!student) {
      return res.status(404).render('pages/not-found');
    }

    const economy = getEconomySettings();
    const type = req.body.type || '';

    const earnMap = {
      attendance: {
        amount: economy.attendance_shekels,
        reason: 'Attendance'
      },
      participation: {
        amount: economy.participation_shekels,
        reason: 'Participation'
      },
      memory: {
        amount: economy.memory_verse_shekels,
        reason: 'Memory Verse'
      },
      bonus: {
        amount: null,
        reason: 'Bonus'
      }
    };

    if (!earnMap[type]) {
      return res.status(400).render('pages/error', { message: 'Invalid earn action.' });
    }

    let amount = earnMap[type].amount;
    if (type === 'bonus') {
      const min = Number.parseInt(economy.bonus_min, 10);
      const max = Number.parseInt(economy.bonus_max, 10);
      const safeMin = Number.isNaN(min) ? 0 : min;
      const safeMax = Number.isNaN(max) ? safeMin : max;
      const range = Math.max(safeMax - safeMin, 0);
      amount = safeMin + Math.floor(Math.random() * (range + 1));
    }

    insertTransactionStmt.run(student.id, 'earn', earnMap[type].reason, amount, nowIso());
    return res.redirect(`/s/${student.qr_id}`);
  });

  router.post('/s/:qr_id/buy', (req, res) => {
    const student = studentByQrStmt.get(req.params.qr_id);
    if (!student) {
      return res.status(404).render('pages/not-found');
    }

    const itemId = Number.parseInt(req.body.item_id, 10);
    if (!itemId) {
      return res.status(400).render('pages/error', { message: 'Invalid item selection.' });
    }

    const purchase = db.transaction(() => {
      const item = db.prepare('SELECT * FROM items WHERE id = ? AND active = 1').get(itemId);
      if (!item) {
        return { error: 'Item is not available.' };
      }
      if (item.inventory <= 0) {
        return { error: 'Item is out of stock.' };
      }
      const balanceRow = db.prepare(`
        SELECT COALESCE(SUM(amount_shekels), 0) AS balance
        FROM transactions
        WHERE student_id = ?
      `).get(student.id);
      if (balanceRow.balance < item.price_shekels) {
        return { error: 'Not enough Shekels.' };
      }

      db.prepare('UPDATE items SET inventory = inventory - 1 WHERE id = ?').run(itemId);
      const amount = -Math.abs(Number.parseInt(item.price_shekels, 10));
      insertTransactionStmt.run(student.id, 'spend', item.name, amount, nowIso());
      return { success: true };
    });

    const result = purchase();
    if (result.error) {
      return res.status(400).render('pages/error', { message: result.error });
    }

    return res.redirect(`/s/${student.qr_id}?purchased=${itemId}`);
  });

  router.get('/qr/:qr_id.png', async (req, res) => {
    const qrId = req.params.qr_id;
    const fullUrl = `${req.protocol}://${req.get('host')}/s/${qrId}`;
    const qrText = req.query.full === '0' ? qrId : fullUrl;

    try {
      const buffer = await QRCode.toBuffer(qrText, { type: 'png', margin: 1, scale: 6 });
      if (req.query.download === '1') {
        res.setHeader('Content-Disposition', `attachment; filename=storehouse-${qrId}.png`);
      }
      res.type('png').send(buffer);
    } catch (err) {
      res.status(500).send('QR code error');
    }
  });

  return router;
}

module.exports = publicRoutes;
