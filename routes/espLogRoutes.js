const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { ingestLogs, getLogs, clearLogs } = require('../controller/espLogController');

const router = express.Router();

// POST /api/esp/logs  { device, logs: [{ t, lvl, msg }] }
router.post('/', authenticateToken, ingestLogs);
// GET /api/esp/logs?limit=100&device=esp32-01
router.get('/', authenticateToken, getLogs);
// DELETE /api/esp/logs?confirm=yes
router.delete('/', authenticateToken, clearLogs);

module.exports = router;
