const db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// LOGIN
exports.login = (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  db.query(
    'SELECT * FROM users WHERE username = ?',
    [username],
    async (err, results) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (results.length === 0)
        return res.status(401).json({ error: 'Invalid credentials' });

      const user = results[0];
      const match = await bcrypt.compare(password, user.password_hash);
      if (!match)
        return res.status(401).json({ error: 'Invalid credentials' });

      // Generate JWT token
      const token = jwt.sign(
        { user_id: user.user_id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '1h' }
      );
      res.json({ token });
    }
  );
};

// CREATE USER
exports.createUser = async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  const password_hash = await bcrypt.hash(password, 10);

  db.query(
    'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
    [username, password_hash, role || 'staff'],
    (err, result) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ error: 'Username already exists' });
        }
        return res.status(500).json({ error: 'Database error' });
      }
      res.status(201).json({ user_id: result.insertId, username, role: role || 'staff' });
    }
  );
};

// READ ALL USERS
exports.getAllUsers = (req, res) => {
  db.query('SELECT user_id, username, role, created_at FROM users', (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
};

// READ SINGLE USER
exports.getUserById = (req, res) => {
  const { id } = req.params;
  db.query(
    'SELECT user_id, username, role, created_at FROM users WHERE user_id = ?',
    [id],
    (err, results) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (results.length === 0)
        return res.status(404).json({ error: 'User not found' });
      res.json(results[0]);
    }
  );
};

// UPDATE USER
exports.updateUser = async (req, res) => {
  const { id } = req.params;
  const { username, password, role } = req.body;

  let fields = [];
  let values = [];

  if (username) {
    fields.push('username = ?');
    values.push(username);
  }
  if (password) {
    const password_hash = await bcrypt.hash(password, 10);
    fields.push('password_hash = ?');
    values.push(password_hash);
  }
  if (role) {
    fields.push('role = ?');
    values.push(role);
  }

  if (fields.length === 0)
    return res.status(400).json({ error: 'No fields to update' });

  values.push(id);

  db.query(
    `UPDATE users SET ${fields.join(', ')} WHERE user_id = ?`,
    values,
    (err, result) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (result.affectedRows === 0)
        return res.status(404).json({ error: 'User not found' });
      res.json({ message: 'User updated' });
    }
  );
};

// DELETE USER
exports.deleteUser = (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM users WHERE user_id = ?', [id], (err, result) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deleted' });
  });
};

// GET CURRENT (ME) USER
exports.getMe = (req, res) => {
  // Requires authenticateToken middleware to set req.user
  if (!req.user || !req.user.user_id) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const uid = req.user.user_id;
  db.query(
    'SELECT user_id, username, role, created_at FROM users WHERE user_id = ? LIMIT 1',
    [uid],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!rows || rows.length === 0) return res.status(404).json({ error: 'User not found' });
      return res.json(rows[0]);
    }
  );
};