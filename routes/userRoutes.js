const express = require('express');
const router = express.Router();
const userController = require('../controller/userController');
const { authenticateToken } = require('../middleware/auth');

// CRUD
router.post('/', userController.createUser);
router.get('/', userController.getAllUsers);
// Current user (me) should be BEFORE parameterized routes
router.get('/me', authenticateToken, userController.getMe);
router.get('/:id', userController.getUserById);
router.put('/:id', userController.updateUser);
router.delete('/:id', userController.deleteUser);

module.exports = router;