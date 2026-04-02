const db = require('../config/db');

// CREATE student
exports.createStudent = (req, res) => {
  const { first_name, last_name, course, year_level, section, birthdate } = req.body;
  if (!first_name || !last_name)
    return res.status(400).json({ error: 'First name and last name required' });

  db.query(
    'INSERT INTO students (first_name, last_name, course, year_level, section, birthdate) VALUES (?, ?, ?, ?, ?, ?)',
    [first_name, last_name, course, year_level, section, birthdate],
    (err, result) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.status(201).json({ student_id: result.insertId, first_name, last_name, course, year_level, section, birthdate });
    }
  );
};

// READ ALL students (exclude soft-deleted)
exports.getAllStudents = (req, res) => {
  db.query('SELECT * FROM students WHERE IFNULL(is_deleted, 0) = 0', (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
};

// READ SINGLE student
exports.getStudentById = (req, res) => {
  const { id } = req.params;
  db.query('SELECT * FROM students WHERE student_id = ? AND IFNULL(is_deleted, 0) = 0', [id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (results.length === 0)
      return res.status(404).json({ error: 'Student not found' });
    res.json(results[0]);
  });
};

// UPDATE student
exports.updateStudent = (req, res) => {
  const { id } = req.params;
  const { first_name, last_name, course, year_level, section, birthdate } = req.body;

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
  if (course) {
    fields.push('course = ?');
    values.push(course);
  }
  if (year_level) {
    fields.push('year_level = ?');
    values.push(year_level);
  }
  if (section) {
    fields.push('section = ?');
    values.push(section);
  }
  if (birthdate) {
    fields.push('birthdate = ?');
    values.push(birthdate);
  }

  if (fields.length === 0)
    return res.status(400).json({ error: 'No fields to update' });

  values.push(id);

  db.query(
    `UPDATE students SET ${fields.join(', ')} WHERE student_id = ?`,
    values,
    (err, result) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (result.affectedRows === 0)
        return res.status(404).json({ error: 'Student not found' });
      res.json({ message: 'Student updated' });
    }
  );
};

// SOFT DELETE student
exports.deleteStudent = (req, res) => {
  const { id } = req.params;
  db.query('UPDATE students SET is_deleted = 1, deleted_at = NOW() WHERE student_id = ?', [id], (err, result) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Student not found' });
    res.json({ message: 'Student deleted (soft)' });
  });
};