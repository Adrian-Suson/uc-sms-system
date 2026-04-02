const express = require('express');
const router = express.Router();
const {
    getAllTemplates,
    getTemplateById,
    createTemplate,
    updateTemplate,
    deleteTemplate
} = require('../controller/templateController');
const { authenticateToken } = require('../middleware/auth'); // Assuming you have auth middleware

// All routes are protected and require authentication
router.use(authenticateToken);

// Get all templates
router.get('/', getAllTemplates);

// Get template by ID
router.get('/:id', getTemplateById);

// Create new template
router.post('/', createTemplate);

// Update template
router.put('/:id', updateTemplate);

// Delete template
router.delete('/:id', deleteTemplate);

module.exports = router;