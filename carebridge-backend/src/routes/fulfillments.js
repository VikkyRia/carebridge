const router = require('express').Router();
const { pool } = require('../config/db');
const { authenticate, authorise } = require('../middleware/auth');

// GET /api/fulfillments — impact gallery, public
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT fl.*, n.title AS need_title, n.children_count, n.cash_equivalent,
             f.name AS facility_name, f.city, f.country
      FROM fulfillments fl
      JOIN needs n ON fl.need_id = n.id
      JOIN facilities f ON n.facility_id = f.id
      WHERE fl.verified = true
      ORDER BY fl.submitted_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/fulfillments — facility submits proof
router.post('/', authenticate, authorise('facility', 'admin'), async (req, res) => {
  const { need_id, photo_url, caption } = req.body;
  if (!need_id || !photo_url)
    return res.status(400).json({ error: 'need_id and photo_url are required' });

  try {
    const result = await pool.query(
      `INSERT INTO fulfillments (need_id, photo_url, caption)
       VALUES ($1, $2, $3)
       ON CONFLICT (need_id) DO UPDATE SET photo_url = $2, caption = $3
       RETURNING *`,
      [need_id, photo_url, caption]
    );

    await pool.query(
      `UPDATE needs SET status = 'fulfilled' WHERE id = $1`, [need_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/fulfillments/:id/verify — admin only
router.patch('/:id/verify', authenticate, authorise('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE fulfillments SET verified = true WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json({ message: 'Fulfillment verified', fulfillment: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;