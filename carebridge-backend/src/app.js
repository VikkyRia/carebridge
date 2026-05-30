const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { initDB } = require('./config/db');
const authRoutes = require('./routes/auth');
const facilitiesRoutes = require('./routes/facilities');
const needsRoutes = require('./routes/needs');
const donationsRoutes = require('./routes/donations');
const fulfillmentsRoutes = require('./routes/fulfillments');
const paymentsRoutes = require('./routes/payments');
const whatsappRoutes = require('./routes/whatsapp');
const { router: matchingRoutes } = require('./routes/matching');

const app = express();

// Twilio sends webhook as application/x-www-form-urlencoded
// Paystack webhook needs raw body for signature verification
// So we handle raw before the global json parser
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use('/api/whatsapp/incoming', express.urlencoded({ extended: false }));

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/facilities', facilitiesRoutes);
app.use('/api/needs', needsRoutes);
app.use('/api/donations', donationsRoutes);
app.use('/api/fulfillments', fulfillmentsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/matching', matchingRoutes);

app.get('/', (req, res) => res.json({ message: '🚀 CareBridge API is running' }));

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

const PORT = process.env.PORT || 5000;

initDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
});