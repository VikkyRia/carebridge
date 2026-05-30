const router = require('express').Router();
const { pool } = require('../config/db');
const { authenticate } = require('../middleware/auth');

// POST /api/donations — must be logged in
router.post('/', authenticate, async (req, res) => {
  const { need_id, amount, payment_method, transaction_ref } = req.body;

  if (!need_id || !amount)
    return res.status(400).json({ error: 'need_id and amount are required' });

  try {
    // Get donor details from their account — no manual input needed
    const userResult = await pool.query(
      'SELECT full_name, email FROM users WHERE id = $1',
      [req.user.id]
    );
    const { full_name, email } = userResult.rows[0];

    const result = await pool.query(
      `INSERT INTO donations 
        (need_id, user_id, donor_name, donor_email, amount, payment_method, status, transaction_ref)
       VALUES ($1,$2,$3,$4,$5,$6,'confirmed',$7) RETURNING *`,
      [need_id, req.user.id, full_name, email, amount,
       payment_method || 'card', transaction_ref || null]
    );

    res.status(201).json({
      message: 'Donation recorded. Thank you!',
      donation: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/donations/my — logged in donor
router.get('/my', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT d.*, n.title AS need_title, f.name AS facility_name
      FROM donations d
      JOIN needs n ON d.need_id = n.id
      JOIN facilities f ON n.facility_id = f.id
      WHERE d.user_id = $1
      ORDER BY d.created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/donations — admin only
router.get('/', authenticate, async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: 'Admins only' });

  try {
    const result = await pool.query(`
      SELECT d.*, n.title AS need_title, f.name AS facility_name
      FROM donations d
      JOIN needs n ON d.need_id = n.id
      JOIN facilities f ON n.facility_id = f.id
      ORDER BY d.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;