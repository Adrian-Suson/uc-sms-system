const db = require('../config/db');

// CREATE student-parent relationship
exports.createStudentParent = (req, res) => {
  const { student_id, parent_id } = req.body;
  if (!student_id || !parent_id)
    return res.status(400).json({ error: 'student_id and parent_id are required' });

  db.query(
    'INSERT INTO student_parents (student_id, parent_id) VALUES (?, ?)',
    [student_id, parent_id],
    (err, result) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.status(201).json({ id: result.insertId, student_id, parent_id });
    }
  );
};

// READ ALL relationships (ignore links to soft-deleted records)
exports.getAllStudentParents = (req, res) => {
  db.query('SELECT sp.* FROM student_parents sp JOIN parents p ON p.parent_id = sp.parent_id JOIN students s ON s.student_id = sp.student_id WHERE IFNULL(p.is_deleted, 0) = 0 AND IFNULL(s.is_deleted, 0) = 0', (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
};

// READ relationships for a student
exports.getParentsByStudent = (req, res) => {
  const { student_id } = req.params;
  db.query(
    'SELECT p.* FROM parents p JOIN student_parents sp ON p.parent_id = sp.parent_id WHERE sp.student_id = ? AND IFNULL(p.is_deleted, 0) = 0',
    [student_id],
    (err, results) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(results);
    }
  );
};

// READ relationships for a parent
exports.getStudentsByParent = (req, res) => {
  const { parent_id } = req.params;
  db.query(
    'SELECT s.* FROM students s JOIN student_parents sp ON s.student_id = sp.student_id WHERE sp.parent_id = ? AND IFNULL(s.is_deleted, 0) = 0',
    [parent_id],
    (err, results) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(results);
    }
  );
};

// DELETE relationship
exports.deleteStudentParent = (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM student_parents WHERE id = ?', [id], (err, result) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Relationship not found' });
    res.json({ message: 'Relationship deleted' });
  });
};
