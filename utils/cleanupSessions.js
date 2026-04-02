// Utility script to clean up old/expired/revoked sessions
// Run manually or via a scheduled job (e.g., daily)
require('dotenv').config();
const db = require('../config/db');

// Delete sessions expired more than 7 days ago OR revoked more than 7 days ago
const sql = `DELETE FROM sessions 
WHERE (expires_at IS NOT NULL AND expires_at < DATE_SUB(NOW(), INTERVAL 7 DAY))
   OR (revoked = 1 AND revoked_at IS NOT NULL AND revoked_at < DATE_SUB(NOW(), INTERVAL 7 DAY))`;

console.log('[cleanupSessions] Starting cleanup...');

db.query(sql, (err, result) => {
    if (err) {
        console.error('[cleanupSessions] Error deleting old sessions:', err.message);
    } else {
        console.log(`[cleanupSessions] Removed ${result.affectedRows} stale sessions.`);
    }
    process.exit(0);
});
