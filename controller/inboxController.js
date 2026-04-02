const db = require('../config/db');

// Normalize phone similar to parentController
function normalizePhone(raw) {
    if (!raw) return '';
    let s = String(raw).trim();
    // keep leading +, strip non-digits
    let out = '';
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if ((c >= '0' && c <= '9') || (c === '+' && out.length === 0)) out += c;
    }
    if (out.startsWith('0') && out.length >= 10) {
        out = '+63' + out.slice(1);
    } else if (out.startsWith('63')) {
        out = '+' + out;
    }
    return out;
}

// POST /api/inbox  { from, text, receivedAt?, device?, rawHeader? }
exports.ingestInbox = (req, res) => {
    const { from, text, receivedAt, device, rawHeader } = req.body || {};
    if (!from || !text) return res.status(400).json({ error: 'from and text are required' });
    const sender = normalizePhone(from);
    let recv = receivedAt ? new Date(receivedAt) : new Date();
    if (isNaN(recv.getTime())) {
        // Fallback if modem timestamp isn't ISO format
        recv = new Date();
    }
    db.query(
        'INSERT INTO sms_inbox (sender, message_text, received_at, device, raw_header) VALUES (?,?,?,?,?)',
        [sender, text, recv, device || null, rawHeader || null],
        (err, result) => {
            if (err) {
                console.error('Inbox insert error:', err.message);
                return res.status(500).json({ error: 'Database error' });
            }
            const row = { id: result.insertId, sender, text, received_at: recv, device: device || null };
            // Emit real-time event to clients
            try {
                const io = global.getIO && global.getIO();
                if (io) io.emit('inbox:new', row);
            } catch { }
            res.status(201).json(row);
        }
    );
};

// GET /api/inbox?limit=100&sender=+63...
exports.listInbox = (req, res) => {
    let { limit, sender } = req.query;
    limit = Math.min(parseInt(limit || '100', 10) || 100, 1000);
    const params = [];
    let sql = 'SELECT id, sender, message_text, received_at, device, raw_header, created_at FROM sms_inbox';
    if (sender) {
        sql += ' WHERE sender = ?';
        params.push(normalizePhone(sender));
    }
    sql += ' ORDER BY received_at DESC LIMIT ?';
    params.push(limit);
    db.query(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(rows);
    });
};

// DELETE /api/inbox/:id
exports.deleteInbox = (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM sms_inbox WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
        res.json({ message: 'Deleted' });
    });
};
