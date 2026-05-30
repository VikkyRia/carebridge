const express = require('express');
const router = express.Router();
const https = require('https');
const crypto = require('crypto');
const { pool } = require('../config/db');
const { authenticate } = require('../middleware/auth');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

// Helper: make Paystack API call
function paystackRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path,
      method,
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid Paystack response')); }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// POST /api/payments/initialize
router.post('/initialize', authenticate, async (req, res) => {
  const { need_id, amount } = req.body;

  if (!need_id || !amount)
    return res.status(400).json({ error: 'need_id and amount are required' });

  if (amount < 100)
    return res.status(400).json({ error: 'Minimum donation is ₦100' });

  try {
    const userResult = await pool.query(
      'SELECT full_name, email FROM users WHERE id = $1',
      [req.user.id]
    );
    const { full_name, email } = userResult.rows[0];

    const needResult = await pool.query(
      'SELECT title FROM needs WHERE id = $1',
      [need_id]
    );
    if (!needResult.rows.length)
      return res.status(404).json({ error: 'Need not found' });

    const amountInKobo = Math.round(amount * 100);

    const payload = {
      email,
      amount: amountInKobo,
      currency: 'NGN',
      metadata: {
        need_id,
        user_id: req.user.id,
        donor_name: full_name,
        need_title: needResult.rows[0].title,
        custom_fields: [
          { display_name: 'Donor Name', variable_name: 'donor_name', value: full_name },
          { display_name: 'Need', variable_name: 'need_title', value: needResult.rows[0].title },
        ],
      },
    };

    const response = await paystackRequest('POST', '/transaction/initialize', payload);

    if (!response.status)
      return res.status(400).json({ error: response.message || 'Paystack error' });

    res.json({
      authorization_url: response.data.authorization_url,
      access_code: response.data.access_code,
      reference: response.data.reference,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payments/verify
router.post('/verify', authenticate, async (req, res) => {
  const { reference } = req.body;

  if (!reference)
    return res.status(400).json({ error: 'reference is required' });

  try {
    const existing = await pool.query(
      'SELECT id FROM donations WHERE transaction_ref = $1',
      [reference]
    );
    if (existing.rows.length)
      return res.status(409).json({ error: 'This transaction has already been recorded' });

    const response = await paystackRequest('GET', `/transaction/verify/${reference}`);

    if (!response.status || response.data.status !== 'success')
      return res.status(400).json({ error: 'Payment not successful' });

    const { amount, metadata } = response.data;
    const amountInNaira = amount / 100;
    const { need_id } = metadata;

    const userResult = await pool.query(
      'SELECT full_name, email FROM users WHERE id = $1',
      [req.user.id]
    );
    const { full_name, email } = userResult.rows[0];

    const result = await pool.query(
      `INSERT INTO donations
        (need_id, user_id, donor_name, donor_email, amount, payment_method, status, transaction_ref)
       VALUES ($1,$2,$3,$4,$5,'paystack','confirmed',$6) RETURNING *`,
      [need_id, req.user.id, full_name, email, amountInNaira, reference]
    );

    res.status(201).json({
      message: '🎉 Payment confirmed! Thank you for your donation.',
      donation: result.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payments/webhook — Paystack posts here automatically
router.post('/webhook', async (req, res) => {
  const hash = crypto
    .createHmac('sha512', PAYSTACK_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (hash !== req.headers['x-paystack-signature'])
    return res.status(401).send('Unauthorized');

  const event = req.body;

  if (event.event === 'charge.success') {
    const { reference, amount, metadata } = event.data;

    try {
      const existing = await pool.query(
        'SELECT id FROM donations WHERE transaction_ref = $1',
        [reference]
      );
      if (existing.rows.length) return res.sendStatus(200);

      const { need_id, user_id } = metadata;
      const amountInNaira = amount / 100;

      const userResult = await pool.query(
        'SELECT full_name, email FROM users WHERE id = $1',
        [user_id]
      );

      if (userResult.rows.length) {
        const { full_name, email } = userResult.rows[0];
        await pool.query(
          `INSERT INTO donations
            (need_id, user_id, donor_name, donor_email, amount, payment_method, status, transaction_ref)
           VALUES ($1,$2,$3,$4,$5,'paystack','confirmed',$6)`,
          [need_id, user_id, full_name, email, amountInNaira, reference]
        );
      }
    } catch (err) {
      console.error('Webhook error:', err.message);
    }
  }

  res.sendStatus(200);
});

module.exports = router;