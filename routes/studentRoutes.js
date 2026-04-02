const express = require('express');
const router = express.Router();
const studentController = require('../controller/studentController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

// Protect all routes
router.use(authenticateToken);

// CRUD routes for students
router.post('/', authorizeRole('admin', 'teacher'), studentController.createStudent);
router.get('/', studentController.getAllStudents);
router.get('/:id', studentController.getStudentById);
router.put('/:id', studentController.updateStudent);
router.delete('/:id', studentController.deleteStudent);

module.exports = router;