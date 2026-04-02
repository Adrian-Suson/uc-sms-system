const db = require('../config/db');

// CREATE message
exports.createMessage = (req, res) => {
  const { student_id, parent_id, message_text, template_id, status, sent_at } = req.body;
  if (!message_text)
    return res.status(400).json({ error: 'message_text is required' });

  db.query(
    'INSERT INTO messages (student_id, parent_id, message_text, template_id, status, sent_at) VALUES (?, ?, ?, ?, ?, ?)',
    [student_id || null, parent_id || null, message_text, template_id || null, status || 'pending', sent_at || null],
    (err, result) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      const row = { message_id: result.insertId, student_id, parent_id, message_text, status: status || 'pending', sent_at };
      try {
        const io = global.getIO && global.getIO();
        if (io) io.emit('messages:new', row);
      } catch { }
      res.status(201).json(row);
    }
  );
};

// READ ALL messages
exports.getAllMessages = (req, res) => {
  const query = `
    SELECT 
      m.*,
      mt.template_name,
      mt.template_text,
      CONCAT(s.first_name, ' ', s.last_name) as student_name,
      CONCAT(p.first_name, ' ', p.last_name) as parent_name
    FROM messages m
    LEFT JOIN message_templates mt ON m.template_id = mt.template_id
    LEFT JOIN students s ON m.student_id = s.student_id
    LEFT JOIN parents p ON m.parent_id = p.parent_id
    ORDER BY m.created_at DESC
  `;

  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
};

// READ messages by parent_id (thread)
exports.getMessagesByParent = (req, res) => {
  const { id } = req.params;
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
    WHERE m.parent_id = ?
    ORDER BY m.created_at ASC
  `;

  db.query(query, [id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
};

// READ SINGLE message
exports.getMessageById = (req, res) => {
  const { id } = req.params;
  const query = `
    SELECT 
      m.*,
      mt.template_name,
      mt.template_text,
      CONCAT(s.first_name, ' ', s.last_name) as student_name,
      CONCAT(p.first_name, ' ', p.last_name) as parent_name
    FROM messages m
    LEFT JOIN message_templates mt ON m.template_id = mt.template_id
    LEFT JOIN students s ON m.student_id = s.student_id
    LEFT JOIN parents p ON m.parent_id = p.parent_id
    WHERE m.message_id = ?
  `;

  db.query(query, [id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (results.length === 0)
      return res.status(404).json({ error: 'Message not found' });
    res.json(results[0]);
  });
};

// UPDATE message
exports.updateMessage = (req, res) => {
  const { id } = req.params;
  const { student_id, parent_id, message_text, template_id, status, sent_at } = req.body;

  let fields = [];
  let values = [];

  if (student_id !== undefined) {
    fields.push('student_id = ?');
    values.push(student_id);
  }
  if (parent_id !== undefined) {
    fields.push('parent_id = ?');
    values.push(parent_id);
  }
  if (message_text) {
    fields.push('message_text = ?');
    values.push(message_text);
  }
  if (status) {
    fields.push('status = ?');
    values.push(status);
  }
  if (template_id !== undefined) {
    fields.push('template_id = ?');
    values.push(template_id);
  }
  if (sent_at !== undefined) {
    fields.push('sent_at = ?');
    values.push(sent_at);
  }

  if (fields.length === 0)
    return res.status(400).json({ error: 'No fields to update' });

  values.push(id);

  db.query(
    `UPDATE messages SET ${fields.join(', ')} WHERE message_id = ?`,
    values,
    (err, result) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (result.affectedRows === 0)
        return res.status(404).json({ error: 'Message not found' });
      try {
        const io = global.getIO && global.getIO();
        if (io) io.emit('messages:updated', { id, student_id, parent_id, message_text, template_id, status, sent_at });
      } catch { }
      res.json({ message: 'Message updated' });
    }
  );
};

// DELETE message
exports.deleteMessage = (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM messages WHERE message_id = ?', [id], (err, result) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Message not found' });
    try {
      const io = global.getIO && global.getIO();
      if (io) io.emit('messages:deleted', { id });
    } catch { }
    res.json({ message: 'Message deleted' });
  });
};



