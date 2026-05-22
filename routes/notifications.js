const express = require('express');
const db      = require('../db');
const { generateNotifications } = require('../services/notificationRules');
const router  = express.Router();

function auth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  next();
}

// GET /api/notifications — paginated list of alerts for current user
router.get('/', auth, async (req, res) => {
  const userId = req.session.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  try {
    // Run notification generator rules to ensure fresh alerts
    await generateNotifications(userId);

    // Count query
    const [[{ total }]] = await db.query(
      'SELECT COUNT(*) AS total FROM notifications WHERE user_id = ?',
      [userId]
    );

    // Get alerts
    const [rows] = await db.query(
      `SELECT id, type, message, reference_id AS referenceId, is_read AS isRead, created_at AS createdAt
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );

    // Unread count
    const [[{ unreadCount }]] = await db.query(
      'SELECT COUNT(*) AS unreadCount FROM notifications WHERE user_id = ? AND is_read = 0',
      [userId]
    );

    res.json({
      data: rows,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      unreadCount
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/notifications/read-all — mark all alerts as read
router.post('/read-all', auth, async (req, res) => {
  const userId = req.session.user.id;
  try {
    await db.query(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ?',
      [userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/notifications/:id/read — mark single alert as read
router.put('/:id/read', auth, async (req, res) => {
  const userId = req.session.user.id;
  try {
    await db.query(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [req.params.id, userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/notifications/:id — dismiss (delete) alert
router.delete('/:id', auth, async (req, res) => {
  const userId = req.session.user.id;
  try {
    await db.query(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?',
      [req.params.id, userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
