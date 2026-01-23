const express = require('express');
const crypto = require('crypto');
const requireAdmin = require('../middleware/requireAdmin');
const {
  db,
  getEconomySettings,
  setEconomySettings,
  getCurrencyLabels,
  setCurrencyLabels,
  ensureTalentsRow
} = require('../db');
const { normalizeRarity, getRarityTokens } = require('../lib/rarity');
const { exportStorehouseData, importStorehouseData } = require('../lib/dataTransfer');
const { generateStudentCardsPdf } = require('../lib/studentCardsPdf');

function nowIso() {
  return new Date().toISOString();
}

function makeQrId() {
  return crypto.randomBytes(16).toString('base64url');
}

function createFormToken() {
  return crypto.randomBytes(16).toString('hex');
}

function adminRoutes({ verifyPasscode }) {
  const router = express.Router();

  const insertTransactionStmt = db.prepare(`
    INSERT INTO transactions (student_id, type, reason, amount_shekels, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  router.get('/', requireAdmin, (req, res) => {
    res.redirect('/admin/students');
  });

  router.get('/login', (req, res) => {
    res.render('pages/admin/login', {
      error: null,
      returnTo: req.query.returnTo || '/admin'
    });
  });

  router.post('/login', (req, res) => {
    const passcode = req.body.passcode || '';
    const returnTo = req.body.returnTo || '/admin';

    if (!verifyPasscode(passcode)) {
      return res.status(401).render('pages/admin/login', {
        error: 'Incorrect passcode. Please try again.',
        returnTo
      });
    }

    req.session.isAdmin = true;
    return res.redirect(returnTo);
  });

  router.post('/logout', requireAdmin, (req, res) => {
    req.session.destroy(() => {
      res.redirect('/');
    });
  });

  router.get('/students', requireAdmin, (req, res) => {
    const filter = req.query.filter || 'active';
    let where = '';
    if (filter === 'inactive') {
      where = 'WHERE s.active = 0';
    } else if (filter === 'all') {
      where = '';
    } else {
      where = 'WHERE s.active = 1';
    }

    const students = db.prepare(`
      SELECT s.*, COALESCE(SUM(t.amount_shekels), 0) AS balance, COALESCE(l.talents, 0) AS talents
      FROM students s
      LEFT JOIN transactions t ON t.student_id = s.id
      LEFT JOIN talents_ledger l ON l.student_id = s.id
      ${where}
      GROUP BY s.id
      ORDER BY s.name COLLATE NOCASE
    `).all();

    res.render('pages/admin/students', { students, filter });
  });

  router.post('/students/cards.pdf', requireAdmin, async (req, res) => {
    const rawIds = req.body.studentIds;
    const ids = Array.isArray(rawIds) ? rawIds : rawIds ? [rawIds] : [];
    const studentIds = ids
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value));

    if (studentIds.length === 0) {
      return res.status(400).send('No students selected.');
    }

    const placeholders = studentIds.map(() => '?').join(',');
    const students = db
      .prepare(
        `SELECT id, name, qr_id FROM students WHERE id IN (${placeholders}) ORDER BY name COLLATE NOCASE`
      )
      .all(...studentIds);

    if (!students.length) {
      return res.status(404).send('No matching students found.');
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    try {
      const pdfBytes = await generateStudentCardsPdf({ students, baseUrl });
      const now = new Date();
      const stamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
      ].join('-');
      const filename = `storehouse-student-cards-${stamp}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      return res.send(Buffer.from(pdfBytes));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to generate student cards PDF', error);
      return res.status(500).send('Failed to generate PDF.');
    }
  });

  router.get('/students/new', requireAdmin, (req, res) => {
    const formToken = createFormToken();
    req.session.newStudentToken = formToken;
    res.render('pages/admin/student-new', { error: null, formToken });
  });

  router.post('/students/new', requireAdmin, (req, res) => {
    const formToken = (req.body.form_token || '').trim();
    const sessionToken = req.session.newStudentToken || '';
    const lastToken = req.session.lastStudentToken || '';
    const lastStudent = req.session.lastStudentCreated || null;

    if (!formToken || !sessionToken || formToken !== sessionToken) {
      if (formToken && lastStudent && formToken === lastToken) {
        return res.render('pages/admin/student-created', { student: lastStudent });
      }
      const nextToken = createFormToken();
      req.session.newStudentToken = nextToken;
      return res.status(409).render('pages/admin/student-new', {
        error: 'This form was already submitted. Please try again.',
        formToken: nextToken
      });
    }

    const name = (req.body.name || '').trim();
    const notes = (req.body.notes || '').trim();
    const active = req.body.active === 'on' ? 1 : 0;

    if (!name) {
      return res.status(400).render('pages/admin/student-new', {
        error: 'Name is required.',
        formToken
      });
    }

    const qrId = makeQrId();
    const createdAt = nowIso();

    const result = db.prepare(`
      INSERT INTO students (name, qr_id, active, notes, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, qrId, active, notes || null, createdAt);

    ensureTalentsRow(result.lastInsertRowid);

    const student = {
      id: result.lastInsertRowid,
      name,
      qr_id: qrId
    };

    req.session.lastStudentCreated = student;
    req.session.lastStudentToken = formToken;
    req.session.newStudentToken = null;

    return res.render('pages/admin/student-created', { student });
  });

  router.get('/students/:id', requireAdmin, (req, res) => {
    const studentId = Number.parseInt(req.params.id, 10);
    const student = db.prepare(`
      SELECT s.*, COALESCE(SUM(t.amount_shekels), 0) AS balance, COALESCE(l.talents, 0) AS talents
      FROM students s
      LEFT JOIN transactions t ON t.student_id = s.id
      LEFT JOIN talents_ledger l ON l.student_id = s.id
      WHERE s.id = ?
      GROUP BY s.id
    `).get(studentId);

    if (!student) {
      return res.status(404).render('pages/not-found');
    }

    ensureTalentsRow(student.id);

    const transactions = db.prepare(`
      SELECT * FROM transactions
      WHERE student_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 25
    `).all(studentId);

    const economy = getEconomySettings();
    res.render('pages/admin/student-detail', { student, transactions, economy });
  });

  router.get('/students/:id/edit', requireAdmin, (req, res) => {
    const studentId = Number.parseInt(req.params.id, 10);
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
    if (!student) {
      return res.status(404).render('pages/not-found');
    }
    res.render('pages/admin/student-edit', { student, error: null });
  });

  router.post('/students/:id/edit', requireAdmin, (req, res) => {
    const studentId = Number.parseInt(req.params.id, 10);
    const name = (req.body.name || '').trim();
    const notes = (req.body.notes || '').trim();
    const active = req.body.active === 'on' ? 1 : 0;

    if (!name) {
      return res.status(400).render('pages/admin/student-edit', {
        student: { id: studentId, name, notes, active },
        error: 'Name is required.'
      });
    }

    db.prepare(`
      UPDATE students
      SET name = ?, notes = ?, active = ?
      WHERE id = ?
    `).run(name, notes || null, active, studentId);

    res.redirect(`/admin/students/${studentId}`);
  });

  router.post('/students/:id/delete', requireAdmin, (req, res) => {
    const studentId = Number.parseInt(req.params.id, 10);
    const student = db.prepare('SELECT id FROM students WHERE id = ?').get(studentId);
    if (!student) {
      return res.status(404).render('pages/not-found');
    }

    const deleteStudent = db.transaction((id) => {
      db.prepare('DELETE FROM transactions WHERE student_id = ?').run(id);
      db.prepare('DELETE FROM talents_ledger WHERE student_id = ?').run(id);
      db.prepare('DELETE FROM students WHERE id = ?').run(id);
    });

    deleteStudent(studentId);

    res.redirect('/admin/students');
  });

  router.post('/students/:id/regenerate', requireAdmin, (req, res) => {
    const studentId = Number.parseInt(req.params.id, 10);
    const newQrId = makeQrId();

    db.prepare('UPDATE students SET qr_id = ? WHERE id = ?').run(newQrId, studentId);

    res.redirect(`/admin/students/${studentId}`);
  });

  router.post('/students/:id/adjust', requireAdmin, (req, res) => {
    const studentId = Number.parseInt(req.params.id, 10);
    const amount = Number.parseInt(req.body.amount, 10);
    const reason = (req.body.reason || '').trim();

    if (!Number.isFinite(amount) || !reason) {
      return res.status(400).render('pages/error', {
        message: 'Amount and reason are required for manual adjustments.'
      });
    }

    insertTransactionStmt.run(studentId, 'adjust', reason, amount, nowIso());
    const qrId = req.body.qr_id || db.prepare('SELECT qr_id FROM students WHERE id = ?').get(studentId)?.qr_id;
    res.redirect(qrId ? `/s/${qrId}` : `/admin/students/${studentId}`);
  });

  router.post('/students/:id/undo', requireAdmin, (req, res) => {
    const studentId = Number.parseInt(req.params.id, 10);
    const last = db.prepare(`
      SELECT * FROM transactions
      WHERE student_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `).get(studentId);

    if (!last) {
      return res.status(400).render('pages/error', { message: 'No transactions to undo.' });
    }

    insertTransactionStmt.run(
      studentId,
      'adjust',
      `Undo: ${last.reason || 'Transaction'}`,
      -last.amount_shekels,
      nowIso()
    );

    const qrId = req.body.qr_id || db.prepare('SELECT qr_id FROM students WHERE id = ?').get(studentId)?.qr_id;
    res.redirect(qrId ? `/s/${qrId}` : `/admin/students/${studentId}`);
  });

  router.post('/students/:id/convert', requireAdmin, (req, res) => {
    const studentId = Number.parseInt(req.params.id, 10);
    const economy = getEconomySettings();
    const shekelsPerTalent = Number.parseInt(economy.shekels_per_talent, 10);

    const balanceRow = db.prepare(`
      SELECT COALESCE(SUM(amount_shekels), 0) AS balance
      FROM transactions
      WHERE student_id = ?
    `).get(studentId);

    if (balanceRow.balance < shekelsPerTalent) {
      return res.status(400).render('pages/error', {
        message: 'Not enough Shekels to convert to a Talent.'
      });
    }

    insertTransactionStmt.run(
      studentId,
      'adjust',
      'Converted to Talent',
      -shekelsPerTalent,
      nowIso()
    );

    db.prepare(`
      INSERT INTO talents_ledger (student_id, talents)
      VALUES (?, 1)
      ON CONFLICT(student_id) DO UPDATE SET talents = talents + 1
    `).run(studentId);

    insertTransactionStmt.run(
      studentId,
      'convert',
      'Talent +1',
      0,
      nowIso()
    );

    const qrId = req.body.qr_id || db.prepare('SELECT qr_id FROM students WHERE id = ?').get(studentId)?.qr_id;
    res.redirect(qrId ? `/s/${qrId}` : `/admin/students/${studentId}`);
  });

  router.get('/items', requireAdmin, (req, res) => {
    const items = db.prepare(`
      SELECT * FROM items
      ORDER BY sort_order ASC, name COLLATE NOCASE ASC
    `).all();
    res.render('pages/admin/items', { items, error: null });
  });

  router.get('/items/menu', requireAdmin, (req, res) => {
    const items = db.prepare(`
      SELECT * FROM items
      WHERE active = 1
      ORDER BY sort_order ASC, name COLLATE NOCASE ASC
    `).all();

    const menuItems = items.map((item) => {
      const rarity = normalizeRarity(item.rarity);
      return {
        ...item,
        rarity,
        rarityTokens: getRarityTokens(rarity)
      };
    });

    const autoprint = req.query.autoprint === '1';
    res.render('pages/admin/items-menu', { items: menuItems, autoprint, page: 'menu-print' });
  });

  router.post('/items', requireAdmin, (req, res) => {
    const name = (req.body.name || '').trim();
    const price = Number.parseInt(req.body.price_shekels, 10);
    const category = (req.body.category || 'snack').trim();
    const active = req.body.active === 'on' ? 1 : 0;
    const inventory = Number.parseInt(req.body.inventory, 10);
    const rarity = normalizeRarity(req.body.rarity);
    const type = (req.body.type || 'standard').toString().trim().toLowerCase();
    const goalAmount = Number.parseInt(req.body.goal_amount, 10);
    const buyInCost = Number.parseInt(req.body.buy_in_cost, 10);
    const progressAmount = Number.parseInt(req.body.progress_amount, 10);

    const isGroupBuy = type === 'group_buy';
    const normalizedType = isGroupBuy ? 'group_buy' : 'standard';
    const safeProgress = Number.isFinite(progressAmount) && progressAmount >= 0 ? progressAmount : 0;
    const completedAt = isGroupBuy && Number.isFinite(goalAmount) && safeProgress >= goalAmount ? nowIso() : null;

    if (!name) {
      const items = db.prepare('SELECT * FROM items ORDER BY sort_order ASC, name COLLATE NOCASE ASC').all();
      return res.status(400).render('pages/admin/items', {
        items,
        error: 'Name is required.'
      });
    }

    if (isGroupBuy) {
      if (!Number.isFinite(goalAmount) || goalAmount <= 0 || !Number.isFinite(buyInCost) || buyInCost <= 0) {
        const items = db.prepare('SELECT * FROM items ORDER BY sort_order ASC, name COLLATE NOCASE ASC').all();
        return res.status(400).render('pages/admin/items', {
          items,
          error: 'Group buy items require a goal amount and buy-in cost greater than 0.'
        });
      }
    } else if (!Number.isFinite(price) || price < 0 || !Number.isFinite(inventory) || inventory < 0) {
      const items = db.prepare('SELECT * FROM items ORDER BY sort_order ASC, name COLLATE NOCASE ASC').all();
      return res.status(400).render('pages/admin/items', {
        items,
        error: 'Standard items require a non-negative price and inventory.'
      });
    }

    const minOrderRow = db.prepare('SELECT MIN(sort_order) AS minOrder FROM items').get();
    const nextSortOrder = Number.isFinite(minOrderRow?.minOrder) ? minOrderRow.minOrder - 1 : 0;

    db.prepare(`
      INSERT INTO items (
        name, price_shekels, inventory, active, sort_order, category, rarity,
        type, goal_amount, buy_in_cost, progress_amount, completed_at, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      isGroupBuy ? buyInCost : price,
      isGroupBuy ? 0 : inventory,
      active,
      nextSortOrder,
      category || 'snack',
      rarity,
      normalizedType,
      isGroupBuy ? goalAmount : null,
      isGroupBuy ? buyInCost : null,
      isGroupBuy ? safeProgress : 0,
      completedAt,
      nowIso()
    );

    res.redirect('/admin/items');
  });

  router.get('/items/:id/edit', requireAdmin, (req, res) => {
    const itemId = Number.parseInt(req.params.id, 10);
    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
    if (!item) {
      return res.status(404).render('pages/not-found');
    }
    res.render('pages/admin/item-edit', { item, error: null });
  });

  router.post('/items/:id/edit', requireAdmin, (req, res) => {
    const itemId = Number.parseInt(req.params.id, 10);
    const name = (req.body.name || '').trim();
    const price = Number.parseInt(req.body.price_shekels, 10);
    const category = (req.body.category || 'snack').trim();
    const active = req.body.active === 'on' ? 1 : 0;
    const inventory = Number.parseInt(req.body.inventory, 10);
    const rarity = normalizeRarity(req.body.rarity);
    const type = (req.body.type || 'standard').toString().trim().toLowerCase();
    const goalAmount = Number.parseInt(req.body.goal_amount, 10);
    const buyInCost = Number.parseInt(req.body.buy_in_cost, 10);
    const progressAmount = Number.parseInt(req.body.progress_amount, 10);

    const isGroupBuy = type === 'group_buy';
    const normalizedType = isGroupBuy ? 'group_buy' : 'standard';
    const safeProgress = Number.isFinite(progressAmount) && progressAmount >= 0 ? progressAmount : 0;
    const completedAt = isGroupBuy && Number.isFinite(goalAmount) && safeProgress >= goalAmount ? nowIso() : null;

    if (!name) {
      return res.status(400).render('pages/admin/item-edit', {
        item: {
          id: itemId,
          name,
          price_shekels: isGroupBuy ? buyInCost : price,
          inventory: isGroupBuy ? 0 : inventory,
          category,
          rarity,
          active,
          type: normalizedType,
          goal_amount: isGroupBuy ? goalAmount : null,
          buy_in_cost: isGroupBuy ? buyInCost : null,
          progress_amount: isGroupBuy ? safeProgress : 0,
          completed_at: completedAt
        },
        error: 'Name is required.'
      });
    }

    if (isGroupBuy) {
      if (!Number.isFinite(goalAmount) || goalAmount <= 0 || !Number.isFinite(buyInCost) || buyInCost <= 0) {
        return res.status(400).render('pages/admin/item-edit', {
        item: {
          id: itemId,
          name,
          price_shekels: buyInCost,
          inventory: 0,
          category,
          rarity,
          active,
          type: normalizedType,
          goal_amount: goalAmount,
          buy_in_cost: buyInCost,
          progress_amount: safeProgress,
          completed_at: completedAt
          },
          error: 'Group buy items require a goal amount and buy-in cost greater than 0.'
        });
      }
    } else if (!Number.isFinite(price) || price < 0 || !Number.isFinite(inventory) || inventory < 0) {
      return res.status(400).render('pages/admin/item-edit', {
        item: {
          id: itemId,
          name,
          price_shekels: price,
          inventory,
          category,
          rarity,
          active,
          type: normalizedType,
          goal_amount: null,
          buy_in_cost: null,
          progress_amount: 0,
          completed_at: null
        },
        error: 'Standard items require a non-negative price and inventory.'
      });
    }

    db.prepare(`
      UPDATE items
      SET name = ?, price_shekels = ?, inventory = ?, category = ?, rarity = ?, active = ?,
          type = ?, goal_amount = ?, buy_in_cost = ?, progress_amount = ?, completed_at = ?
      WHERE id = ?
    `).run(
      name,
      isGroupBuy ? buyInCost : price,
      isGroupBuy ? 0 : inventory,
      category || 'snack',
      rarity,
      active,
      normalizedType,
      isGroupBuy ? goalAmount : null,
      isGroupBuy ? buyInCost : null,
      isGroupBuy ? safeProgress : 0,
      completedAt,
      itemId
    );

    res.redirect('/admin/items');
  });

  router.post('/items/:id/delete', requireAdmin, (req, res) => {
    const itemId = Number.parseInt(req.params.id, 10);
    db.prepare('DELETE FROM items WHERE id = ?').run(itemId);
    res.redirect('/admin/items');
  });

  router.post('/items/:id/move', requireAdmin, (req, res) => {
    const itemId = Number.parseInt(req.params.id, 10);
    const direction = (req.body.direction || '').toLowerCase();
    if (!itemId || !['up', 'down'].includes(direction)) {
      return res.redirect('/admin/items');
    }

    const reorder = db.transaction(() => {
      const items = db.prepare(`
        SELECT id
        FROM items
        ORDER BY sort_order ASC, name COLLATE NOCASE ASC
      `).all();
      const index = items.findIndex((item) => item.id === itemId);
      if (index === -1) {
        return false;
      }
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= items.length) {
        return false;
      }

      const orderedIds = items.map((item) => item.id);
      [orderedIds[index], orderedIds[targetIndex]] = [orderedIds[targetIndex], orderedIds[index]];

      const update = db.prepare('UPDATE items SET sort_order = ? WHERE id = ?');
      orderedIds.forEach((id, order) => {
        update.run(order, id);
      });

      return true;
    });

    reorder();
    return res.redirect('/admin/items');
  });

  router.get('/bulk', requireAdmin, (req, res) => {
    const economy = getEconomySettings();
    const labels = getCurrencyLabels();
    const actions = [
      {
        key: 'attendance',
        label: `Attendance (+${economy.attendance_shekels} ${labels.shekels_label})`
      },
      {
        key: 'participation',
        label: `Participation (+${economy.participation_shekels} ${labels.shekels_label})`
      },
      {
        key: 'memory',
        label: `Memory Verse (+${economy.memory_verse_shekels} ${labels.shekels_label})`
      },
      {
        key: 'brought_bible',
        label: `Brought Bible (+1 ${labels.shekels_label})`
      },
      {
        key: 'brought_friend',
        label: `Brought Friend (+3 ${labels.shekels_label})`
      },
      {
        key: 'bonus',
        label: `Bonus (+${economy.bonus_min}-${economy.bonus_max} ${labels.shekels_label})`
      },
      {
        key: 'add_one_shekel',
        label: 'Add one shekel'
      },
      {
        key: 'remove_one_shekel',
        label: 'Remove one shekel'
      }
    ];

    const actionKeys = new Set(actions.map((item) => item.key));
    const activeAction = actionKeys.has(req.query.action) ? req.query.action : 'attendance';

    const students = db.prepare(`
      SELECT s.id, s.name
      FROM students s
      WHERE s.active = 1
      ORDER BY s.name COLLATE NOCASE
    `).all();

    const lastId = Number.parseInt(req.query.last, 10);
    const lastStudent = Number.isFinite(lastId) ? students.find((student) => student.id === lastId) : null;

    res.render('pages/admin/bulk', {
      actions,
      activeAction,
      students,
      lastStudent,
      page: 'bulk'
    });
  });

  router.post('/bulk', requireAdmin, (req, res) => {
    const studentId = Number.parseInt(req.body.student_id, 10);
    const action = req.body.action || '';

    if (!Number.isFinite(studentId)) {
      return res.status(400).render('pages/error', { message: 'Select a student to continue.' });
    }

    const student = db.prepare('SELECT id FROM students WHERE id = ? AND active = 1').get(studentId);
    if (!student) {
      return res.status(404).render('pages/not-found');
    }

    const economy = getEconomySettings();
    const actionMap = {
      attendance: {
        amount: economy.attendance_shekels,
        reason: 'Attendance',
        type: 'earn'
      },
      participation: {
        amount: economy.participation_shekels,
        reason: 'Participation',
        type: 'earn'
      },
      memory: {
        amount: economy.memory_verse_shekels,
        reason: 'Memory Verse',
        type: 'earn'
      },
      brought_bible: {
        amount: 1,
        reason: 'Brought Bible',
        type: 'earn'
      },
      brought_friend: {
        amount: 3,
        reason: 'Brought Friend',
        type: 'earn'
      },
      bonus: {
        amount: null,
        reason: 'Bonus',
        type: 'earn'
      },
      add_one_shekel: {
        amount: 1,
        reason: 'Add one shekel',
        type: 'adjust'
      },
      remove_one_shekel: {
        amount: -1,
        reason: 'Remove one shekel',
        type: 'adjust'
      }
    };

    if (!actionMap[action]) {
      return res.status(400).render('pages/error', { message: 'Invalid bulk action.' });
    }

    let amount = actionMap[action].amount;
    if (action === 'bonus') {
      const min = Number.parseInt(economy.bonus_min, 10);
      const max = Number.parseInt(economy.bonus_max, 10);
      const safeMin = Number.isNaN(min) ? 0 : min;
      const safeMax = Number.isNaN(max) ? safeMin : max;
      const range = Math.max(safeMax - safeMin, 0);
      amount = safeMin + Math.floor(Math.random() * (range + 1));
    }

    insertTransactionStmt.run(studentId, actionMap[action].type, actionMap[action].reason, amount, nowIso());
    res.redirect(`/admin/bulk?action=${encodeURIComponent(action)}&last=${studentId}`);
  });

  router.get('/settings', requireAdmin, (req, res) => {
    const economy = getEconomySettings();
    const labels = getCurrencyLabels();
    const imported = req.query.imported === '1';
    const importError = req.query.import_error ? decodeURIComponent(req.query.import_error) : null;
    res.render('pages/admin/settings', {
      economy,
      labels,
      error: null,
      saved: false,
      imported,
      importError
    });
  });

  router.post('/settings', requireAdmin, (req, res) => {
    const economy = {
      attendance_shekels: Number.parseInt(req.body.attendance_shekels, 10),
      participation_shekels: Number.parseInt(req.body.participation_shekels, 10),
      memory_verse_shekels: Number.parseInt(req.body.memory_verse_shekels, 10),
      bonus_min: Number.parseInt(req.body.bonus_min, 10),
      bonus_max: Number.parseInt(req.body.bonus_max, 10),
      shekels_per_talent: Number.parseInt(req.body.shekels_per_talent, 10)
    };

    const labels = {
      shekels_label: (req.body.shekels_label || 'Shekels').trim() || 'Shekels',
      talents_label: (req.body.talents_label || 'Talents').trim() || 'Talents'
    };

    const values = Object.values(economy);
    if (values.some((val) => !Number.isFinite(val) || val < 0)) {
      return res.status(400).render('pages/admin/settings', {
        economy,
        labels,
        error: 'All economy values must be zero or higher.',
        saved: false,
        imported: false,
        importError: null
      });
    }

    if (economy.bonus_max < economy.bonus_min) {
      return res.status(400).render('pages/admin/settings', {
        economy,
        labels,
        error: 'Bonus max must be greater than or equal to bonus min.',
        saved: false,
        imported: false,
        importError: null
      });
    }

    setEconomySettings(economy);
    setCurrencyLabels(labels);

    res.render('pages/admin/settings', {
      economy,
      labels,
      error: null,
      saved: true,
      imported: false,
      importError: null
    });
  });

  router.get('/transfer/export', requireAdmin, (req, res) => {
    const payload = exportStorehouseData();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=storehouse-export-${stamp}.json`);
    res.send(JSON.stringify(payload, null, 2));
  });

  router.post('/transfer/import', requireAdmin, (req, res) => {
    const payload = (req.body.payload || '').trim();
    if (!payload) {
      return res.redirect('/admin/settings?import_error=Missing%20JSON%20payload');
    }

    try {
      const data = JSON.parse(payload);
      importStorehouseData(data);
    } catch (error) {
      const message = encodeURIComponent(error.message || 'Invalid JSON payload');
      return res.redirect(`/admin/settings?import_error=${message}`);
    }

    return res.redirect('/admin/settings?imported=1');
  });

  return router;
}

module.exports = adminRoutes;
