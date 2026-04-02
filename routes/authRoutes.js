const express = require('express');
const router = express.Router();
const { login, register, changePassword, logout, listSessions, revokeSession } = require('../controller/authController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

// Public routes
router.post('/login', login);

// Protected routes
router.post('/register', authenticateToken, authorizeRole('admin'), register);
router.post('/change-password', authenticateToken, changePassword);
router.post('/logout', authenticateToken, logout);
router.get('/sessions', authenticateToken, listSessions);
router.post('/sessions/:id/revoke', authenticateToken, revokeSession);

module.exports = router;