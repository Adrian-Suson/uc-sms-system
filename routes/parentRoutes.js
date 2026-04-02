const express = require('express');
const router = express.Router();
const parentController = require('../controller/parentController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

// Protect all routes
router.use(authenticateToken);

// CRUD routes for parents
router.post('/', authorizeRole('admin', 'teacher'), parentController.createParent);
router.get('/', parentController.getAllParents);
// Get soft-deleted parents
router.get('/deleted', authorizeRole('admin', 'teacher'), parentController.getDeletedParents);
// Lookup by phone (must be declared before dynamic ':id' route)
router.get('/by-phone', parentController.getParentByPhone);
router.get('/:id', parentController.getParentById);
router.put('/:id', parentController.updateParent);
router.delete('/:id', parentController.deleteParent);
// Restore a soft-deleted parent and its linked children
router.post('/:id/restore', authorizeRole('admin', 'teacher'), parentController.restoreParent);

module.exports = router; 