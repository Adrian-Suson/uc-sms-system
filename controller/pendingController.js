const db = require('../config/db');

// COUNT pending messages
exports.countPendingMessages = (req, res) => {
    db.query('SELECT COUNT(*) AS pendingCount FROM messages WHERE status = "pending"', (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ pending: results[0].pendingCount });
    });
};

// GET pending messages for ESP (parent number, message text, status)
exports.getPendingForESP = (req, res) => {
    const query = `
    SELECT 
      m.message_id,
      m.message_text,
      m.status,
      m.created_at,
      p.phone_number,
      mt.template_name,
      CONCAT(s.first_name, ' ', s.last_name) as student_name,
      CONCAT(p.first_name, ' ', p.last_name) as parent_name
    FROM messages m
    JOIN parents p ON m.parent_id = p.parent_id
    LEFT JOIN message_templates mt ON m.template_id = mt.template_id
    LEFT JOIN students s ON m.student_id = s.student_id
    WHERE m.status = "pending"
    ORDER BY m.created_at ASC
  `;

    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (results.length === 0)
            return res.json([]); // return empty array instead of error
        res.json(results);
    });
};

// GET all pending messages with full details (for frontend)
exports.getAllPendingMessages = (req, res) => {
    const query = `
    SELECT 
      m.*,
      mt.template_name,
      mt.template_text,
      CONCAT(s.first_name, ' ', s.last_name) as student_name,
      CONCAT(p.first_name, ' ', p.last_name) as parent_name,
      p.phone_number
    FROM messages m
    LEFT JOIN message_templates mt ON m.template_id = mt.template_id
    LEFT JOIN students s ON m.student_id = s.student_id
    LEFT JOIN parents p ON m.parent_id = p.parent_id
    WHERE m.status = "pending"
    ORDER BY m.created_at DESC
  `;

    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
};

// UPDATE message status (for ESP status updates)
exports.updateMessageStatus = (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
        return res.status(400).json({ error: 'Status is required' });
    }

    // Set sent_at timestamp if status is 'sent'
    const sent_at = status === 'sent' ? new Date() : null;

    db.query(
        'UPDATE messages SET status = ?, sent_at = ? WHERE message_id = ?',
        [status, sent_at, id],
        (err, result) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (result.affectedRows === 0)
                return res.status(404).json({ error: 'Message not found' });
            try {
                const io = global.getIO && global.getIO();
                if (io) io.emit('pending:status', { id, status, sent_at });
            } catch { }
            res.json({ message: 'Message status updated', status, sent_at });
        }
    );
};