const jwt = require('jsonwebtoken');
require('dotenv').config();

// Verify JWT token middleware
const mysql = require('mysql2');
const db = require('../config/db');
const crypto = require('crypto');

function hashToken(raw) { return crypto.createHash('sha256').update(raw).digest('hex'); }

exports.authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN format

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    try {
        const user = jwt.verify(token, process.env.JWT_SECRET);
        const tokenHash = hashToken(token);
        // Verify session in DB
        const sql = 'SELECT revoked, expires_at FROM sessions WHERE token_hash = ? AND user_id = ? LIMIT 1';
        db.query(sql, [tokenHash, user.user_id], (err, rows) => {
            if (err) {
                console.error('Session lookup error:', err.message);
                return res.status(500).json({ error: 'Session validation failed' });
            }
            if (rows.length === 0) {
                return res.status(401).json({ error: 'Session not found or revoked' });
            }
            const session = rows[0];
            if (session.revoked) {
                return res.status(401).json({ error: 'Session revoked' });
            }
            if (session.expires_at && new Date(session.expires_at) < new Date()) {
                return res.status(401).json({ error: 'Session expired' });
            }
            req.user = user;
            next();
        });
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }
        return res.status(403).json({ error: 'Invalid token' });
    }
};

// Role-based authorization middleware
exports.authorizeRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: 'Access denied. Insufficient permissions.'
            });
        }

        next();
    };
};

// Optional: Middleware to check if user owns the resource
exports.checkOwnership = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' });
    }

    // Allow admins to bypass ownership check
    if (req.user.role === 'admin') {
        return next();
    }

    // The actual ownership check would depend on your resource structure
    // This is just an example:
    const resourceUserId = req.params.userId || req.body.userId;
    if (req.user.user_id !== parseInt(resourceUserId)) {
        return res.status(403).json({
            error: 'Access denied. You do not own this resource.'
        });
    }

    next();
};

// Generate JWT token
exports.generateToken = (user) => {
    // Remove sensitive data before creating token
    const tokenData = {
        user_id: user.user_id,
        username: user.username,
        role: user.role
    };

    return jwt.sign(
        tokenData,
        process.env.JWT_SECRET,
        { expiresIn: '24h' } // Token expires in 24 hours
    );
};

// Refresh token middleware (optional)
exports.refreshToken = (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Refresh token required' });
    }

    try {
        const user = jwt.verify(token, process.env.JWT_SECRET);
        // Generate new token
        const newToken = this.generateToken(user);
        res.json({ token: newToken });
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired. Please log in again.' });
        }
        return res.status(403).json({ error: 'Invalid token' });
    }
};