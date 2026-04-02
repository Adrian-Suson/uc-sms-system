const db = require('../config/db');

// Phone normalization shared logic
function normalize(raw) {
  if (!raw) return raw;
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if ((c >= '0' && c <= '9') || (c === '+' && out.length === 0)) out += c;
  }
  if (out.startsWith('0') && out.length >= 10) {
    out = '+63' + out.substring(1);
  } else if (out.startsWith('63')) {
    out = '+' + out;
  }
  return out;
}

// CREATE parent
exports.createParent = (req, res) => {
  let { first_name, last_name, phone_number, email, relationship } = req.body;
  if (!first_name || !last_name || !phone_number)
    return res.status(400).json({ error: 'First name, last name, and phone number are required' });

  // Normalize phone: remove non-digits except leading +; convert local 09... to +63...
  phone_number = normalize(phone_number);

  db.query(
    'INSERT INTO parents (first_name, last_name, phone_number, email, relationship) VALUES (?, ?, ?, ?, ?)',
    [first_name, last_name, phone_number, email, relationship],
    (err, result) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.status(201).json({ parent_id: result.insertId, first_name, last_name, phone_number, email, relationship });
    }
  );
};

// READ ALL parents (exclude soft-deleted)
exports.getAllParents = (req, res) => {
  db.query('SELECT * FROM parents WHERE IFNULL(is_deleted, 0) = 0', (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
};

// READ ALL soft-deleted parents
exports.getDeletedParents = (req, res) => {
  db.query('SELECT * FROM parents WHERE IFNULL(is_deleted, 0) = 1', (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
};

// READ parent by phone number (normalized)
exports.getParentByPhone = (req, res) => {
  const { number } = req.query;
  if (!number) return res.status(400).json({ error: 'number query param is required' });
  const normalized = normalize(number);
  db.query('SELECT * FROM parents WHERE phone_number = ? AND IFNULL(is_deleted, 0) = 0 LIMIT 1', [normalized], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (results.length === 0) return res.status(404).json({ error: 'Parent not found' });
    res.json(results[0]);
  });
};

// READ SINGLE parent
exports.getParentById = (req, res) => {
  const { id } = req.params;
  db.query('SELECT * FROM parents WHERE parent_id = ? AND IFNULL(is_deleted, 0) = 0', [id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (results.length === 0)
      return res.status(404).json({ error: 'Parent not found' });
    res.json(results[0]);
  });
};

// UPDATE parent
exports.updateParent = (req, res) => {
  const { id } = req.params;
  let { first_name, last_name, phone_number, email, relationship } = req.body;

  let fields = [];
  let values = [];

  if (first_name) {
    fields.push('first_name = ?');
    values.push(first_name);
  }
  if (last_name) {
    fields.push('last_name = ?');
    values.push(last_name);
  }
  if (phone_number) {
    // same normalization as create
    phone_number = normalize(phone_number);
    fields.push('phone_number = ?');
    values.push(phone_number);
  }
  if (email) {
    fields.push('email = ?');
    values.push(email);
  }
  if (relationship) {
    fields.push('relationship = ?');
    values.push(relationship);
  }

  if (fields.length === 0)
    return res.status(400).json({ error: 'No fields to update' });

  values.push(id);

  db.query(
    `UPDATE parents SET ${fields.join(', ')} WHERE parent_id = ?`,
    values,
    (err, result) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (result.affectedRows === 0)
        return res.status(404).json({ error: 'Parent not found' });
      res.json({ message: 'Parent updated' });
    }
  );
};

// SOFT DELETE parent
exports.deleteParent = (req, res) => {
  const { id } = req.params;
  db.beginTransaction((err) => {
    if (err) return res.status(500).json({ error: 'Database error' });

    // Get all linked children (do not unlink)
    db.query('SELECT student_id FROM student_parents WHERE parent_id = ?', [id], (err, rows) => {
      if (err) return db.rollback(() => res.status(500).json({ error: 'Database error' }));

      const studentIds = (rows || []).map(r => r.student_id);

      const softDeleteChildren = (cb) => {
        if (!studentIds.length) return cb();
        db.query('UPDATE students SET is_deleted = 1, deleted_at = NOW() WHERE student_id IN (?)', [studentIds], (err) => cb(err));
      };

      // 1) Soft-delete linked children
      softDeleteChildren((err) => {
        if (err) return db.rollback(() => res.status(500).json({ error: 'Database error' }));
        // 2) Soft-delete the parent
        db.query('UPDATE parents SET is_deleted = 1, deleted_at = NOW() WHERE parent_id = ?', [id], (err, result) => {
          if (err) return db.rollback(() => res.status(500).json({ error: 'Database error' }));
          if (result.affectedRows === 0) return db.rollback(() => res.status(404).json({ error: 'Parent not found' }));

          db.commit((err) => {
            if (err) return db.rollback(() => res.status(500).json({ error: 'Database error' }));
            res.json({ message: 'Parent and linked children soft-deleted (relationships preserved)' });
          });
        });
      });
    });
  });
};

// RESTORE parent and linked children (soft-undelete without changing relationships)
exports.restoreParent = (req, res) => {
  const { id } = req.params;
  db.beginTransaction((err) => {
    if (err) return res.status(500).json({ error: 'Database error' });

    // 1) Restore parent
    db.query('UPDATE parents SET is_deleted = 0, deleted_at = NULL WHERE parent_id = ?', [id], (err, result) => {
      if (err) return db.rollback(() => res.status(500).json({ error: 'Database error' }));
      if (result.affectedRows === 0) return db.rollback(() => res.status(404).json({ error: 'Parent not found' }));

      // 2) Restore all linked children
      const sql = `UPDATE students s
                   JOIN student_parents sp ON sp.student_id = s.student_id
                   SET s.is_deleted = 0, s.deleted_at = NULL
                   WHERE sp.parent_id = ?`;
      db.query(sql, [id], (err) => {
        if (err) return db.rollback(() => res.status(500).json({ error: 'Database error' }));

        db.commit((err) => {
          if (err) return db.rollback(() => res.status(500).json({ error: 'Database error' }));
          res.json({ message: 'Parent and linked children restored' });
        });
      });
    });
  });
};