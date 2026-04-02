const bcrypt = require('bcrypt');
const { generateToken } = require('../middleware/auth');
const db = require('../config/db');
const crypto = require('crypto');

exports.login = (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    const query = 'SELECT * FROM users WHERE username = ?';

    db.query(query, [username], async (err, results) => {
        if (err) {
            console.error('Error during login:', err);
            return res.status(500).json({ error: 'Login failed' });
        }

        if (results.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = results[0];

        try {
            const validPassword = await bcrypt.compare(password, user.password_hash);

            if (!validPassword) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            // Generate JWT token
            const token = generateToken(user);

            // Store session (hash the token so DB not holding raw JWT)
            const crypto = require('crypto');
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            const insertSessionSql = `INSERT INTO sessions (user_id, token_hash, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 DAY))`;
            const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
            const userAgent = req.headers['user-agent'] || '';

            db.query(insertSessionSql, [user.user_id, tokenHash, ip, userAgent], (sessErr, sessResult) => {
                if (sessErr) {
                    console.error('Failed to record session:', sessErr.message);
                    // We still continue; session tracking is additive
                }

                const sessionId = sessResult ? sessResult.insertId : null;

                // Send response without password
                const { password_hash, ...userWithoutPassword } = user;
                res.json({
                    user: userWithoutPassword,
                    token,
                    session: sessionId ? { id: sessionId, expires_in_hours: 24 } : null
                });
            });
        } catch (err) {
            console.error('Error comparing passwords:', err);
            res.status(500).json({ error: 'Login failed' });
        }
    });
};

exports.register = async (req, res) => {
    const { username, password, role = 'staff' } = req.body;

    // Only allow admin to create admin users
    if (role === 'admin' && (!req.user || req.user.role !== 'admin')) {
        return res.status(403).json({ error: 'Only admins can create admin users' });
    }

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        // Hash password
        const password_hash = await bcrypt.hash(password, 10);

        const query = 'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)';

        db.query(query, [username, password_hash, role], (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ error: 'Username already exists' });
                }
                console.error('Error registering user:', err);
                return res.status(500).json({ error: 'Registration failed' });
            }

            const user = {
                user_id: result.insertId,
                username,
                role
            };

            // Generate token for immediate login
            const token = generateToken(user);

            res.status(201).json({
                user,
                token
            });
        });
    } catch (err) {
        console.error('Error hashing password:', err);
        res.status(500).json({ error: 'Registration failed' });
    }
};

exports.changePassword = async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.user_id;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current and new passwords are required' });
    }

    const query = 'SELECT password_hash FROM users WHERE user_id = ?';

    db.query(query, [userId], async (err, results) => {
        if (err) {
            console.error('Error fetching user:', err);
            return res.status(500).json({ error: 'Password change failed' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        try {
            const validPassword = await bcrypt.compare(currentPassword, results[0].password_hash);

            if (!validPassword) {
                return res.status(401).json({ error: 'Current password is incorrect' });
            }

            const newPasswordHash = await bcrypt.hash(newPassword, 10);

            const updateQuery = 'UPDATE users SET password_hash = ? WHERE user_id = ?';

            db.query(updateQuery, [newPasswordHash, userId], (err) => {
                if (err) {
                    console.error('Error updating password:', err);
                    return res.status(500).json({ error: 'Password change failed' });
                }

                res.json({ message: 'Password updated successfully' });
            });
        } catch (err) {
            console.error('Error changing password:', err);
            res.status(500).json({ error: 'Password change failed' });
        }
    });
};

// Helper to hash token consistently
function hashToken(rawToken) {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
}

// Logout (revoke current session)
exports.logout = (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(400).json({ error: 'Token required' });
    const tokenHash = hashToken(token);
    const sql = 'UPDATE sessions SET revoked = 1, revoked_at = NOW() WHERE token_hash = ? AND user_id = ? AND revoked = 0';
    db.query(sql, [tokenHash, req.user.user_id], (err, result) => {
        if (err) {
            console.error('Logout error:', err.message);
            return res.status(500).json({ error: 'Logout failed' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Active session not found' });
        }
        res.json({ message: 'Logged out', revoked: true });
    });
};

// List user sessions (admin can list any user via query param user_id)
exports.listSessions = (req, res) => {
    const targetUserId = req.user.role === 'admin' && req.query.user_id ? parseInt(req.query.user_id) : req.user.user_id;
    const sql = 'SELECT session_id, created_at, expires_at, revoked, revoked_at, ip_address, user_agent FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100';
    db.query(sql, [targetUserId], (err, rows) => {
        if (err) {
            console.error('List sessions error:', err.message);
            return res.status(500).json({ error: 'Could not retrieve sessions' });
        }
        res.json({ sessions: rows });
    });
};

// Revoke a specific session by id (self or admin)
exports.revokeSession = (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Session id required' });

    // Ensure ownership unless admin
    const selectSql = 'SELECT user_id, revoked FROM sessions WHERE session_id = ?';
    db.query(selectSql, [id], (err, rows) => {
        if (err) {
            console.error('Revoke lookup error:', err.message);
            return res.status(500).json({ error: 'Lookup failed' });
        }
        if (rows.length === 0) return res.status(404).json({ error: 'Session not found' });
        const session = rows[0];
        if (session.user_id !== req.user.user_id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized to revoke this session' });
        }
        if (session.revoked) return res.json({ message: 'Already revoked' });
        const updateSql = 'UPDATE sessions SET revoked = 1, revoked_at = NOW() WHERE session_id = ?';
        db.query(updateSql, [id], (uErr) => {
            if (uErr) {
                console.error('Revoke update error:', uErr.message);
                return res.status(500).json({ error: 'Revoke failed' });
            }
            res.json({ message: 'Session revoked' });
        });
    });
};