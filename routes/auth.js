// routes/auth.js
const express = require('express');
const bcrypt  = require('bcrypt');
const db      = require('../db');
const router  = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const [rows] = await db.query(
      'SELECT * FROM users WHERE username = ?', [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Store user in session
    req.session.user = { id: user.user_id, username: user.username, userType: user.user_type };
    res.json({ success: true, username: user.username, userType: user.user_type });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// GET /api/auth/me — check if logged in
router.get('/me', (req, res) => {
  if (req.session.user) {
    res.json({ loggedIn: true, username: req.session.user.username, userType: req.session.user.userType || null });
  } else {
    res.json({ loggedIn: false });
  }
});

// POST /api/auth/user-type — set user type
router.post('/user-type', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  const { userType } = req.body;
  if (!['personal', 'business'].includes(userType)) {
    return res.status(400).json({ error: 'Invalid user type' });
  }
  try {
    await db.query('UPDATE users SET user_type = ? WHERE user_id = ?', [userType, req.session.user.id]);
    req.session.user.userType = userType;
    res.json({ success: true, userType });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/register — register a new user
router.post('/register', async (req, res) => {
  const { username, password, userType } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const trimmedUsername = username.trim();
  if (trimmedUsername.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters long' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters long' });
  }

  try {
    // Check if username already exists
    const [existing] = await db.query(
      'SELECT user_id FROM users WHERE username = ?', [trimmedUsername]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Save user
    const finalUserType = ['personal', 'business'].includes(userType) ? userType : null;
    const [result] = await db.query(
      'INSERT INTO users (username, password, user_type) VALUES (?, ?, ?)',
      [trimmedUsername, hashedPassword, finalUserType]
    );

    const newUserId = result.insertId;

    // Log the user in by setting the session
    req.session.user = { id: newUserId, username: trimmedUsername, userType: finalUserType };

    res.status(201).json({
      success: true,
      username: trimmedUsername,
      userType: finalUserType
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/auth/account — delete current user account
router.delete('/account', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });

  const userId = req.session.user.id;

  try {
    // Delete the user (relying on cascade deletes in other tables)
    await db.query('DELETE FROM users WHERE user_id = ?', [userId]);

    // Destroy the session
    req.session.destroy((err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error logging out after account deletion' });
      }
      res.json({ success: true, message: 'Account deleted successfully' });
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error deleting account' });
  }
});

module.exports = router;
