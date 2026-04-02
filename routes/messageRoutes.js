const express = require('express');
const router = express.Router();
const messageController = require('../controller/messageController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

// protect all message routes
router.use(authenticateToken);

// Normal CRUD
router.post('/', authorizeRole('admin', 'teacher', 'staff'), messageController.createMessage);
router.get('/', messageController.getAllMessages);
router.get('/by-parent/:id', messageController.getMessagesByParent);
router.get('/:id', messageController.getMessageById);
router.put('/:id', messageController.updateMessage);
router.delete('/:id', messageController.deleteMessage);

module.exports = router;
