const express = require('express');
const router = express.Router();
const { ingestInbox, listInbox, deleteInbox } = require('../controller/inboxController');
const { authenticateToken } = require('../middleware/auth');

// Ingest endpoint requires auth (device uses Bearer token too)
router.post('/', authenticateToken, ingestInbox);

// List and delete also require auth
router.get('/', authenticateToken, listInbox);
router.delete('/:id', authenticateToken, deleteInbox);

module.exports = router;
