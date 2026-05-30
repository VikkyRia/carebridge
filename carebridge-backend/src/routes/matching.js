/**
 * Matching Engine — integrated with DS team's live engine
 * Base URL: https://carebridge-ovc-v1.onrender.com
 */

const router = require('express').Router();
const https = require('https');
const { pool } = require('../config/db');
const { authenticate, authorise } = require('../middleware/auth');

const ENGINE_BASE = process.env.MATCHING_ENGINE_URL || 'https://carebridge-ovc-v1.onrender.com';

// ── Helper: call the DS engine ─────────────────────────────────────────────
function enginePost(path, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const url = new URL(ENGINE_BASE);
    const options = {
      hostname: url.hostname,
      port: 443,
      path,
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

// ── Build the payload the DS engine expects from our DB ───────────────────
async function buildEnginePayload() {
  const needsRes = await pool.query(`
    SELECT
      n.id::text            AS request_id,
      n.facility_id::text   AS facility_id,
      n.category,
      n.urgency             AS urgency_level,
      n.status,
      ROUND(EXTRACT(EPOCH FROM (NOW() - n.created_at))/3600)::int AS hours_since_posted,
      false                 AS is_duplicate,
      0.6                   AS fulfillment_rate
    FROM needs n
    WHERE n.status = 'open'
  `);

  const donorsRes = await pool.query(`
    SELECT
      u.id::text            AS donor_id,
      'General'             AS preferred_category,
      'Either'              AS need_type,
      'Nigeria'             AS location,
      COUNT(d.id)::int      AS total_donations,
      COALESCE(
        MAX(EXTRACT(DAY FROM NOW() - d.created_at)::int), 999
      )                     AS last_donation_days_ago
    FROM users u
    LEFT JOIN donations d ON d.user_id = u.id AND d.status = 'confirmed'
    WHERE u.role = 'donor'
    GROUP BY u.id
  `);

  const donationsRes = await pool.query(`
    SELECT
      id::text              AS donation_id,
      user_id::text         AS donor_id,
      need_id::text         AS request_id,
      status
    FROM donations
    WHERE status IN ('pending', 'confirmed')
  `);

  return {
    requests:  needsRes.rows,
    donors:    donorsRes.rows,
    donations: donationsRes.rows,
  };
}

// ── Main function called by needs.js after creating a need ────────────────
async function runMatchingEngine(need_id) {
  try {
    const payload = await buildEnginePayload();

    if (!payload.requests.length) return null;

    // Use single-request endpoint if we have a specific need_id
    const response = await enginePost(
      `/match/single-request?request_id=${need_id}`,
      payload
    );

    if (response.status === 'no_matches') {
      return { need_id, priority_score: 0, matched_donors: [], engine: 'external' };
    }

    return {
      need_id,
      request_id: response.request_id,
      priority_score: response.priority_score,
      matched_donors: response.matched_donors,
      engine: 'external',
    };
  } catch (err) {
    console.warn('DS engine error, using fallback:', err.message);
    return fallbackMatchingEngine(need_id);
  }
}

// ── Fallback (only used if DS engine is down) ─────────────────────────────
function computePriorityScore(need) {
  let score = 0;
  if (need.urgency === 'critical') score += 30;
  else if (need.urgency === 'high') score += 20;
  else if (need.urgency === 'medium') score += 10;
  const hoursSince = Math.floor((Date.now() - new Date(need.created_at).getTime()) / 36e5);
  score += Math.min(hoursSince * 0.5, 15);
  if (need.category === 'medical') score += 5;
  return Math.round(score);
}

async function fallbackMatchingEngine(need_id) {
  const needRes = await pool.query(
    'SELECT * FROM needs WHERE id = $1', [need_id]
  );
  const need = needRes.rows[0];
  if (!need) return null;

  return {
    need_id,
    priority_score: computePriorityScore(need),
    matched_donors: [],
    engine: 'fallback',
  };
}

// ── API Routes ────────────────────────────────────────────────────────────

// GET /api/matching/health — check if DS engine is alive
router.get('/health', async (req, res) => {
  try {
    const url = new URL(ENGINE_BASE);
    const response = await new Promise((resolve, reject) => {
      const req = https.request(
        { hostname: url.hostname, port: 443, path: '/health', method: 'GET' },
        (r) => {
          let data = '';
          r.on('data', (c) => (data += c));
          r.on('end', () => resolve(JSON.parse(data)));
        }
      );
      req.on('error', reject);
      req.end();
    });
    res.json({ engine_status: response.status, engine_url: ENGINE_BASE });
  } catch (err) {
    res.json({ engine_status: 'unreachable', fallback: 'active', error: err.message });
  }
});

// GET /api/matching/priority — all needs ranked by priority
router.get('/priority', async (req, res) => {
  try {
    const payload = await buildEnginePayload();

    let rankedIds = [];

    if (payload.requests.length) {
      const response = await enginePost('/match', payload).catch(() => null);
      if (response && response.status === 'success') {
        // results are already sorted by priority_score descending
        rankedIds = response.results.map((r) => ({
          id: r.request_id,
          priority_score: r.priority_score,
        }));

        // Save priority scores back to DB
        for (const r of rankedIds) {
          await pool.query(
            'UPDATE needs SET priority_score = $1 WHERE id = $2',
            [r.priority_score, r.id]
          ).catch(() => {});
        }
      }
    }

    // Return full need details sorted by priority
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

// GET /api/matching/stats — DS engine stats dashboard
router.get('/stats', authenticate, authorise('admin'), async (req, res) => {
  try {
    const payload = await buildEnginePayload();
    const response = await enginePost('/stats', payload);
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/matching/run/:need_id — manually re-run matching for a need
router.post('/run/:need_id', authenticate, authorise('admin', 'facility'), async (req, res) => {
  try {
    const result = await runMatchingEngine(req.params.need_id);
    if (!result) return res.status(404).json({ error: 'Need not found or no active requests' });

    await pool.query(
      'UPDATE needs SET priority_score = $1 WHERE id = $2',
      [result.priority_score, req.params.need_id]
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/matching/results/:need_id — get match result for one need
router.get('/results/:need_id', authenticate, authorise('admin', 'facility'), async (req, res) => {
  try {
    const result = await runMatchingEngine(req.params.need_id);
    if (!result) return res.status(404).json({ error: 'Need not found or no matches' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, runMatchingEngine };