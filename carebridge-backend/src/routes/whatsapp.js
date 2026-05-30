/**
 * WhatsApp Donation Bot — powered by Twilio
 *
 * How it works:
 *  1. User sends "Hi" or "donate" to your Twilio WhatsApp number
 *  2. Bot replies with a menu of urgent needs
 *  3. User picks a need by number
 *  4. Bot sends a Paystack payment link
 *  5. User pays → Paystack webhook confirms → donation recorded
 *
 * Setup:
 *  - Create a free Twilio account at https://www.twilio.com
 *  - Enable WhatsApp Sandbox: twilio.com/console/sms/whatsapp/sandbox
 *  - Set webhook URL to: https://carebridge-dxrd.onrender.com/api/whatsapp/incoming
 *  - Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM to .env
 */

const router = require('express').Router();
const { pool } = require('../config/db');
const https = require('https');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM_NUMBER = process.env.TWILIO_WHATSAPP_FROM; // e.g. whatsapp:+14155238886

// In-memory session store (resets on server restart — good enough for MVP)
// Key: phone number  Value: { step, selectedNeed }
const sessions = {};

// Send WhatsApp message via Twilio REST API
function sendWhatsApp(to, body) {
  const params = new URLSearchParams({
    From: FROM_NUMBER,
    To: to,
    Body: body,
  }).toString();

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.twilio.com',
      port: 443,
      path: `/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(params),
        Authorization:
          'Basic ' +
          Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(params);
    req.end();
  });
}

// Initialize a Paystack payment link for WhatsApp users
// WhatsApp users are treated as "guest donors" — we create a temp payment link
async function createPaystackLink(email, amount, need_id, need_title, phone) {
  const amountInKobo = Math.round(amount * 100);

  const payload = {
    email,
    amount: amountInKobo,
    currency: 'NGN',
    metadata: {
      need_id,
      need_title,
      source: 'whatsapp',
      phone,
    },
    callback_url: `https://carebridge-dxrd.onrender.com/api/payments/whatsapp-callback`,
  };

  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path: '/transaction/initialize',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// POST /api/whatsapp/incoming — Twilio posts here on every incoming message
router.post('/incoming', async (req, res) => {
  // Twilio sends form-encoded body
  const from = req.body.From; // e.g. "whatsapp:+2348012345678"
  const msgBody = (req.body.Body || '').trim().toLowerCase();

  if (!from) return res.sendStatus(400);

  // Initialize session for new users
  if (!sessions[from]) sessions[from] = { step: 'start' };
  const session = sessions[from];

  try {
    // STEP: START — show greeting + menu
    if (
      session.step === 'start' ||
      ['hi', 'hello', 'donate', 'start', 'menu', '0'].includes(msgBody)
    ) {
      const result = await pool.query(`
        SELECT n.id, n.title, n.urgency, n.cash_equivalent, f.name AS facility
        FROM needs n
        JOIN facilities f ON n.facility_id = f.id
        WHERE n.status = 'open' AND f.status = 'verified'
          AND n.urgency IN ('critical', 'high')
        ORDER BY
          CASE n.urgency WHEN 'critical' THEN 1 ELSE 2 END,
          n.created_at DESC
        LIMIT 5
      `);

      const needs = result.rows;
      if (!needs.length) {
        await sendWhatsApp(from, '🙏 No urgent needs right now. Check back soon!\n\nhttps://carebridge-dxrd.onrender.com');
        return res.sendStatus(200);
      }

      let menu = `👋 Welcome to *CareBridge*!\n\nHere are the most urgent needs right now:\n\n`;
      needs.forEach((n, i) => {
        const urgencyEmoji = n.urgency === 'critical' ? '🔴' : '🟠';
        menu += `*${i + 1}.* ${urgencyEmoji} ${n.title}\n`;
        menu += `    📍 ${n.facility}\n`;
        if (n.cash_equivalent) menu += `    💰 ₦${Number(n.cash_equivalent).toLocaleString()} needed\n`;
        menu += '\n';
      });
      menu += `Reply with the *number* (1-${needs.length}) to donate to that need.\nOr visit: https://carebridge-dxrd.onrender.com`;

      // Store needs in session for next step
      session.step = 'pick_need';
      session.needs = needs;

      await sendWhatsApp(from, menu);
      return res.sendStatus(200);
    }

    // STEP: PICK_NEED — user picks a number
    if (session.step === 'pick_need') {
      const choice = parseInt(msgBody);
      if (!choice || choice < 1 || choice > (session.needs || []).length) {
        await sendWhatsApp(
          from,
          `Please reply with a number between 1 and ${(session.needs || []).length}.\nSend *menu* to start over.`
        );
        return res.sendStatus(200);
      }

      const need = session.needs[choice - 1];
      session.selectedNeed = need;
      session.step = 'pick_amount';

      await sendWhatsApp(
        from,
        `You selected:\n*${need.title}*\n📍 ${need.facility}\n\nHow much would you like to donate? (in Naira ₦)\n\nExamples: *500*, *1000*, *5000*\n\nSend *menu* to go back.`
      );
      return res.sendStatus(200);
    }

    // STEP: PICK_AMOUNT — user types an amount
    if (session.step === 'pick_amount') {
      const amount = parseFloat(msgBody.replace(/[^0-9.]/g, ''));
      if (!amount || amount < 100) {
        await sendWhatsApp(from, '❌ Minimum donation is ₦100. Please enter a valid amount.\n\nSend *menu* to go back.');
        return res.sendStatus(200);
      }

      session.step = 'get_email';
      session.amount = amount;

      await sendWhatsApp(
        from,
        `Great! You want to donate *₦${amount.toLocaleString()}* to:\n*${session.selectedNeed.title}*\n\nPlease send your *email address* to generate your payment link.`
      );
      return res.sendStatus(200);
    }

    // STEP: GET_EMAIL — user provides email, generate payment link
    if (session.step === 'get_email') {
      const email = msgBody.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        await sendWhatsApp(from, '❌ That does not look like a valid email. Please try again.\n\nSend *menu* to go back.');
        return res.sendStatus(200);
      }

      const { selectedNeed, amount } = session;

      // Create Paystack payment link
      const paystackRes = await createPaystackLink(
        email,
        amount,
        selectedNeed.id,
        selectedNeed.title,
        from
      );

      if (!paystackRes.status) {
        await sendWhatsApp(from, '⚠️ Could not generate payment link. Please try again later or visit our website.');
        sessions[from] = { step: 'start' };
        return res.sendStatus(200);
      }

      const link = paystackRes.data.authorization_url;

      await sendWhatsApp(
        from,
        `✅ Your payment link is ready!\n\n💳 Click to pay ₦${amount.toLocaleString()} securely:\n${link}\n\n🔒 Powered by Paystack\n\nAfter payment, your donation will be recorded automatically.\n\nSend *menu* to donate again. Thank you! 🙏`
      );

      // Reset session for next interaction
      sessions[from] = { step: 'start' };
      return res.sendStatus(200);
    }

    // Fallback for unrecognized messages
    await sendWhatsApp(
      from,
      `🤖 I did not understand that.\n\nSend *menu* or *hi* to see urgent needs and donate.\n\nOr visit: https://carebridge-dxrd.onrender.com`
    );
    res.sendStatus(200);
  } catch (err) {
    console.error('WhatsApp bot error:', err.message);
    await sendWhatsApp(from, '⚠️ Something went wrong. Please try again or visit our website.');
    res.sendStatus(200);
  }
});

// GET /api/whatsapp/status — for dashboard monitoring
router.get('/status', (req, res) => {
  res.json({
    active_sessions: Object.keys(sessions).length,
    twilio_number: FROM_NUMBER,
    bot_status: 'online',
  });
});

module.exports = router;