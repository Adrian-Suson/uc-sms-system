const express = require('express');
const router = express.Router();
const pendingController = require('../controller/pendingController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

// Protect all pending routes
router.use(authenticateToken);

// Count pending messages
router.get('/count', pendingController.countPendingMessages);

// Get pending messages for ESP32
router.get('/esp', pendingController.getPendingForESP);

// Get all pending messages (for frontend)
router.get('/', pendingController.getAllPendingMessages);

// Update message status (for ESP32)
router.patch('/:id/status', pendingController.updateMessageStatus);

module.exports = router;