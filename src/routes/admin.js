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

function nowIso() {
  return new Date().toISOString();
}

function makeQrId() {
  return crypto.randomBytes(16).toString('base64url');
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

  router.get('/students/new', requireAdmin, (req, res) => {
    res.render('pages/admin/student-new', { error: null });
  });

  router.post('/students/new', requireAdmin, (req, res) => {
    const name = (req.body.name || '').trim();
    const notes = (req.body.notes || '').trim();
    const active = req.body.active === 'on' ? 1 : 0;

    if (!name) {
      return res.status(400).render('pages/admin/student-new', {
        error: 'Name is required.'
      });
    }

    const qrId = makeQrId();
    const createdAt = nowIso();

    const result = db.prepare(`
      INSERT INTO students (name, qr_id, active, notes, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, qrId, active, notes || null, createdAt);

    ensureTalentsRow(result.lastInsertRowid);

    return res.render('pages/admin/student-created', {
      student: {
        id: result.lastInsertRowid,
        name,
        qr_id: qrId
      }
    });
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

    res.render('pages/admin/student-detail', { student, transactions });
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

  router.post('/items', requireAdmin, (req, res) => {
    const name = (req.body.name || '').trim();
    const price = Number.parseInt(req.body.price_shekels, 10);
    const category = (req.body.category || 'snack').trim();
    const active = req.body.active === 'on' ? 1 : 0;
    const sortOrder = Number.parseInt(req.body.sort_order, 10) || 0;
    const inventory = Number.parseInt(req.body.inventory, 10);

    if (!name || !Number.isFinite(price) || price < 0 || !Number.isFinite(inventory) || inventory < 0) {
      const items = db.prepare('SELECT * FROM items ORDER BY sort_order ASC, name COLLATE NOCASE ASC').all();
      return res.status(400).render('pages/admin/items', {
        items,
        error: 'Name, non-negative price, and non-negative inventory are required.'
      });
    }

    db.prepare(`
      INSERT INTO items (name, price_shekels, inventory, active, sort_order, category, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(name, price, inventory, active, sortOrder, category || 'snack', nowIso());

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
    const sortOrder = Number.parseInt(req.body.sort_order, 10) || 0;
    const inventory = Number.parseInt(req.body.inventory, 10);

    if (!name || !Number.isFinite(price) || price < 0 || !Number.isFinite(inventory) || inventory < 0) {
      return res.status(400).render('pages/admin/item-edit', {
        item: { id: itemId, name, price_shekels: price, inventory, category, active, sort_order: sortOrder },
        error: 'Name, non-negative price, and non-negative inventory are required.'
      });
    }

    db.prepare(`
      UPDATE items
      SET name = ?, price_shekels = ?, inventory = ?, category = ?, active = ?, sort_order = ?
      WHERE id = ?
    `).run(name, price, inventory, category || 'snack', active, sortOrder, itemId);

    res.redirect('/admin/items');
  });

  router.post('/items/:id/delete', requireAdmin, (req, res) => {
    const itemId = Number.parseInt(req.params.id, 10);
    db.prepare('DELETE FROM items WHERE id = ?').run(itemId);
    res.redirect('/admin/items');
  });

  router.get('/settings', requireAdmin, (req, res) => {
    const economy = getEconomySettings();
    const labels = getCurrencyLabels();
    res.render('pages/admin/settings', { economy, labels, error: null, saved: false });
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
        saved: false
      });
    }

    if (economy.bonus_max < economy.bonus_min) {
      return res.status(400).render('pages/admin/settings', {
        economy,
        labels,
        error: 'Bonus max must be greater than or equal to bonus min.',
        saved: false
      });
    }

    setEconomySettings(economy);
    setCurrencyLabels(labels);

    res.render('pages/admin/settings', {
      economy,
      labels,
      error: null,
      saved: true
    });
  });

  return router;
}

module.exports = adminRoutes;
