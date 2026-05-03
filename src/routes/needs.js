const router = require('express').Router();
const { pool } = require('../config/db');
const { authenticate, authorise } = require('../middleware/auth');

// GET /api/needs
router.get('/', async (req, res) => {
  const { category, urgency, country, search } = req.query;
  let query = `
    SELECT n.*, f.name AS facility_name, f.city, f.country, 
           f.status AS facility_status
    FROM needs n
    JOIN facilities f ON n.facility_id = f.id
    WHERE n.status = 'open' AND f.status = 'verified'
  `;
  const params = [];
  let i = 1;

  if (category) { query += ` AND n.category = $${i++}`; params.push(category); }
  if (urgency)  { query += ` AND n.urgency = $${i++}`;  params.push(urgency); }
  if (country)  { query += ` AND LOWER(f.country) LIKE $${i++}`; params.push(`%${country.toLowerCase()}%`); }
  if (search)   {
    query += ` AND (LOWER(n.title) LIKE $${i} OR LOWER(f.name) LIKE $${i})`;
    params.push(`%${search.toLowerCase()}%`);
    i++;
  }

  query += ' ORDER BY n.created_at DESC';

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/needs/urgent — homepage
router.get('/urgent', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT n.*, f.name AS facility_name, f.city, f.country
      FROM needs n
      JOIN facilities f ON n.facility_id = f.id
      WHERE n.status = 'open'
        AND f.status = 'verified'
        AND n.urgency IN ('critical', 'high')
      ORDER BY
        CASE n.urgency WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,
        n.created_at DESC
      LIMIT 6
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/needs/:id
router.get('/:id', async (req, res) => {
  try {
    const need = await pool.query(`
      SELECT n.*, f.name AS facility_name, f.city, f.country, f.contact_email
      FROM needs n
      JOIN facilities f ON n.facility_id = f.id
      WHERE n.id = $1
    `, [req.params.id]);

    if (!need.rows.length)
      return res.status(404).json({ error: 'Need not found' });

    const fulfillment = await pool.query(
      'SELECT * FROM fulfillments WHERE need_id = $1', [req.params.id]
    );

    const totalDonated = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total 
       FROM donations WHERE need_id = $1 AND status = 'confirmed'`,
      [req.params.id]
    );

    res.json({
      ...need.rows[0],
      fulfillment: fulfillment.rows[0] || null,
      total_donated: totalDonated.rows[0].total
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/needs — facility or admin
router.post('/', authenticate, authorise('facility', 'admin'), async (req, res) => {
  const {
    facility_id, title, description,
    category, urgency, children_count,
    cash_equivalent, items
  } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO needs 
        (facility_id, title, description, category, urgency, children_count, cash_equivalent, items)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [facility_id, title, description, category, urgency,
       children_count, cash_equivalent, JSON.stringify(items || [])]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/needs/:id — facility or admin
router.patch('/:id', authenticate, authorise('facility', 'admin'), async (req, res) => {
  const { status, urgency } = req.body;
  try {
    const result = await pool.query(
      `UPDATE needs 
       SET status = COALESCE($1, status), urgency = COALESCE($2, urgency)
       WHERE id = $3 RETURNING *`,
      [status, urgency, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;