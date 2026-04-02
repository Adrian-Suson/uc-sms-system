const express = require('express');
const router = express.Router();
const studentParentController = require('../controller/studentParentController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

// Protect all routes
router.use(authenticateToken);

// Create relationship
router.post('/', authorizeRole('admin', 'teacher'), studentParentController.createStudentParent);
// Get all relationships
router.get('/', studentParentController.getAllStudentParents);
// Get parents by student
router.get('/student/:student_id', studentParentController.getParentsByStudent);
// Get students by parent
router.get('/parent/:parent_id', studentParentController.getStudentsByParent);
// Delete relationship
router.delete('/:id', studentParentController.deleteStudentParent);

module.exports = router;
