const router = require('express').Router();
const { pool } = require('../config/db');
const { authenticate, authorise } = require('../middleware/auth');

// GET /api/facilities — list all verified
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM facilities WHERE status = 'verified' ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/facilities/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM facilities WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Facility not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/facilities/register — anyone can register
router.post('/register', async (req, res) => {
  const { name, city, country, address, contact_email, contact_phone, description } = req.body;
  if (!name || !contact_email) return res.status(400).json({ error: 'Name and email required' });

  try {
    const result = await pool.query(
      `INSERT INTO facilities (name, city, country, address, contact_email, contact_phone, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, city, country, address, contact_email, contact_phone, description]
    );
    res.status(201).json({ message: 'Registration submitted, pending verification', facility: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/facilities/:id/verify — admin only
router.patch('/:id/verify', authenticate, authorise('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE facilities SET status = 'verified' WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Facility not found' });
    res.json({ message: 'Facility verified', facility: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;