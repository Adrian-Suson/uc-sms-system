const db = require('../config/db');

// Get all templates
exports.getAllTemplates = (req, res) => {
    const query = 'SELECT * FROM message_templates ORDER BY created_at DESC';

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching templates:', err);
            return res.status(500).json({ error: 'Failed to fetch templates' });
        }
        res.json(results);
    });
};

// Get template by ID
exports.getTemplateById = (req, res) => {
    const { id } = req.params;
    const query = 'SELECT * FROM message_templates WHERE template_id = ?';

    db.query(query, [id], (err, results) => {
        if (err) {
            console.error('Error fetching template:', err);
            return res.status(500).json({ error: 'Failed to fetch template' });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: 'Template not found' });
        }
        res.json(results[0]);
    });
};

// Create new template
exports.createTemplate = (req, res) => {
    const { template_name, template_text } = req.body;
    const created_by = req.user.user_id; // Assuming user info is attached to req by auth middleware

    if (!template_name || !template_text) {
        return res.status(400).json({ error: 'Template name and text are required' });
    }

    const query = 'INSERT INTO message_templates (template_name, template_text, created_by) VALUES (?, ?, ?)';

    db.query(query, [template_name, template_text, created_by], (err, result) => {
        if (err) {
            console.error('Error creating template:', err);
            return res.status(500).json({ error: 'Failed to create template' });
        }
        res.status(201).json({
            template_id: result.insertId,
            template_name,
            template_text,
            created_by
        });
    });
};

// Update template
exports.updateTemplate = (req, res) => {
    const { id } = req.params;
    const { template_name, template_text } = req.body;

    if (!template_name && !template_text) {
        return res.status(400).json({ error: 'Template name or text must be provided' });
    }

    let query = 'UPDATE message_templates SET ';
    const updates = [];
    const values = [];

    if (template_name) {
        updates.push('template_name = ?');
        values.push(template_name);
    }
    if (template_text) {
        updates.push('template_text = ?');
        values.push(template_text);
    }

    query += updates.join(', ');
    query += ' WHERE template_id = ?';
    values.push(id);

    db.query(query, values, (err, result) => {
        if (err) {
            console.error('Error updating template:', err);
            return res.status(500).json({ error: 'Failed to update template' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Template not found' });
        }
        res.json({ message: 'Template updated successfully' });
    });
};

// Delete template
exports.deleteTemplate = (req, res) => {
    const { id } = req.params;
    const query = 'DELETE FROM message_templates WHERE template_id = ?';

    db.query(query, [id], (err, result) => {
        if (err) {
            console.error('Error deleting template:', err);
            return res.status(500).json({ error: 'Failed to delete template' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Template not found' });
        }
        res.json({ message: 'Template deleted successfully' });
    });
};