/**
 * Matching Engine Proxy Route
 *
 * The data science team's engine (https://github.com/Gracey244/CAREBRIDGE-OVC-V1)
 * is not yet deployed. This file does two things:
 *
 * 1. When engine IS deployed: calls it via HTTP and stores the results
 * 2. Right now (pre-deployment): runs a simple fallback scoring algorithm
 *    so the feature already works end-to-end before they deploy
 *
 * When the DS team deploys their engine, just set ENGINE_URL in .env
 * and the proxy will automatically switch over.
 *
 * Integration point — call this after creating a new need:
 *   const matches = await runMatchingEngine(need_id);
 */

const router = require('express').Router();
const https = require('https');
const { pool } = require('../config/db');
const { authenticate, authorise } = require('../middleware/auth');

const ENGINE_URL = process.env.MATCHING_ENGINE_URL; // set when DS team deploys

// ─── Fallback in-process matching (used until DS engine is deployed) ──────────
function computePriorityScore(need) {
  let score = 0;
  if (need.urgency === 'critical') score += 30;
  else if (need.urgency === 'high') score += 20;
  else if (need.urgency === 'medium') score += 10;

  const hoursSince = Math.floor(
    (Date.now() - new Date(need.created_at).getTime()) / 36e5
  );
  score += Math.min(hoursSince * 0.5, 15); // age bonus, max 15

  if (need.category === 'medical') score += 5;

  return Math.round(score);
}

function computeRankScore(donor) {
  let score = 0;
  score += Math.min(donor.donation_count * 2, 20); // experience
  if (donor.last_donation_days > 30) score += 10; // not recently overused
  score += Math.random() * 5; // tie-breaking
  return Math.max(0, Math.round(score)); // never negative
}

async function fallbackMatchingEngine(need_id) {
  // Fetch the need
  const needRes = await pool.query(
    `SELECT n.*, f.country, f.city FROM needs n
     JOIN facilities f ON n.facility_id = f.id
     WHERE n.id = $1`,
    [need_id]
  );
  const need = needRes.rows[0];
  if (!need) return null;

  const priority_score = computePriorityScore(need);

  // Fetch potential donors (users with role=donor)
  // In production, donors_df would come from a separate donors table
  // For now we use the users table as a proxy
  const donorRes = await pool.query(`
    SELECT u.id AS donor_id, u.full_name AS donor_name, u.email,
           COUNT(d.id) AS donation_count,
           COALESCE(MAX(EXTRACT(DAY FROM NOW() - d.created_at)), 999) AS last_donation_days
    FROM users u
    LEFT JOIN donations d ON d.user_id = u.id AND d.status = 'confirmed'
    WHERE u.role = 'donor'
    GROUP BY u.id, u.full_name, u.email
    LIMIT 20
  `);

  const donors = donorRes.rows;

  // Fairness: exclude donors used more than 3 times this week
  const busyRes = await pool.query(`
    SELECT user_id, COUNT(*) as cnt
    FROM donations
    WHERE created_at > NOW() - INTERVAL '7 days'
    GROUP BY user_id
    HAVING COUNT(*) > 3
  `);
  const busyDonors = new Set(busyRes.rows.map((r) => r.user_id));

  const ranked = donors
    .filter((d) => !busyDonors.has(d.donor_id))
    .map((d) => ({
      donor_id: d.donor_id,
      donor_name: d.donor_name,
      rank_score: computeRankScore(d),
    }))
    .sort((a, b) => b.rank_score - a.rank_score)
    .slice(0, 5);

  return {
    request_id: `N${need_id}`,
    need_id,
    priority_score,
    matched_donors: ranked,
    engine: 'fallback',
  };
}

// ─── Call the real DS engine when deployed ────────────────────────────────────
async function callExternalEngine(payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(ENGINE_URL);
    const body = JSON.stringify(payload);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid engine response')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Main function — called by other routes after creating a need
async function runMatchingEngine(need_id) {
  if (ENGINE_URL) {
    try {
      // Build the DataFrames the DS engine expects
      const needsRes = await pool.query(`
        SELECT n.id AS request_id, n.facility_id, n.category,
               n.title AS need_type, n.urgency AS urgency_level,
               f.city AS location, n.cash_equivalent,
               n.status,
               EXTRACT(EPOCH FROM (NOW() - n.created_at))/3600 AS hours_since_posted,
               0 AS facility_fulfilment_rate,
               false AS is_duplicate
        FROM needs n JOIN facilities f ON n.facility_id = f.id
        WHERE n.status = 'open'
      `);

      const donorsRes = await pool.query(`
        SELECT u.id AS donor_id, u.full_name AS donor_name,
               'general' AS preferred_category, 'any' AS preferred_type,
               'Nigeria' AS location,
               0 AS budget,
               COUNT(d.id) AS donation_count,
               COALESCE(MAX(EXTRACT(DAY FROM NOW() - d.created_at)), 999) AS last_donation_days
        FROM users u
        LEFT JOIN donations d ON d.user_id = u.id
        WHERE u.role = 'donor'
        GROUP BY u.id, u.full_name
      `);

      const donationsRes = await pool.query(`
        SELECT id AS donation_id, user_id AS donor_id,
               need_id AS request_id, status
        FROM donations
        WHERE status IN ('pending', 'confirmed')
      `);

      const result = await callExternalEngine({
        requests: needsRes.rows,
        donors: donorsRes.rows,
        donations: donationsRes.rows,
      });

      // Find the specific need's match in the response array
      if (Array.isArray(result)) {
        return result.find((r) => String(r.request_id) === String(need_id)) || null;
      }
      return result;
    } catch (err) {
      console.warn('External engine failed, using fallback:', err.message);
      return fallbackMatchingEngine(need_id);
    }
  }

  return fallbackMatchingEngine(need_id);
}

// ─── API Routes ───────────────────────────────────────────────────────────────

// POST /api/matching/run/:need_id — admin or facility triggers matching manually
router.post('/run/:need_id', authenticate, authorise('admin', 'facility'), async (req, res) => {
  try {
    const result = await runMatchingEngine(req.params.need_id);
    if (!result) return res.status(404).json({ error: 'Need not found' });

    // Store the priority score back on the need
    await pool.query(
      'UPDATE needs SET priority_score = $1 WHERE id = $2',
      [result.priority_score, req.params.need_id]
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/matching/results/:need_id — get stored match results for a need
router.get('/results/:need_id', authenticate, authorise('admin', 'facility'), async (req, res) => {
  try {
    const result = await runMatchingEngine(req.params.need_id);
    if (!result) return res.status(404).json({ error: 'Need not found or no matches' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/matching/priority — ranked list of all open needs by priority score
router.get('/priority', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT n.*, f.name AS facility_name, f.city, f.country,
             COALESCE(n.priority_score, 0) AS priority_score
      FROM needs n
      JOIN facilities f ON n.facility_id = f.id
      WHERE n.status = 'open' AND f.status = 'verified'
      ORDER BY priority_score DESC, n.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, runMatchingEngine };