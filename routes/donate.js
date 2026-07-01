const express  = require('express');
const router   = express.Router();
const crypto   = require('crypto');
const validator = require('validator');
const db       = require('../database/init');
const { isMongConnected } = require('../database/mongo');
const Donation = require('../models/Donation');

// ─── Razorpay singleton ───────────────────────────────────────────────────────
let _rzp = null;
function getRazorpay() {
  if (_rzp) return _rzp;
  const keyId     = process.env.RAZORPAY_KEY_ID     || '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
  if (!keyId || keyId.includes('XXXX')) {
    throw new Error('Razorpay keys not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env');
  }
  const Razorpay = require('razorpay');
  _rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return _rzp;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function verifySignature(orderId, paymentId, signature) {
  const body     = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');
  // Constant-time comparison — prevents timing attacks
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

async function syncToMongo(sqliteRow, donorInfo = {}) {
  if (!isMongConnected()) return;
  try {
    await Donation.findOneAndUpdate(
      { razorpayOrderId: sqliteRow.razorpay_order_id || `manual_${sqliteRow.id}` },
      {
        sqliteId:          sqliteRow.id,
        userId:            sqliteRow.user_id,
        donorName:         donorInfo.name  || 'Anonymous',
        donorEmail:        donorInfo.email || '',
        amount:            sqliteRow.amount,
        currency:          sqliteRow.currency,
        method:            sqliteRow.method,
        frequency:         sqliteRow.frequency,
        anonymous:         !!sqliteRow.anonymous,
        message:           sqliteRow.message,
        razorpayOrderId:   sqliteRow.razorpay_order_id   || '',
        razorpayPaymentId: sqliteRow.razorpay_payment_id || '',
        razorpaySignature: sqliteRow.razorpay_signature  || '',
        status:            sqliteRow.status,
        paidAt:            sqliteRow.status === 'paid' ? new Date() : null,
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.warn('MongoDB sync failed (non-fatal):', err.message);
  }
}

// ─── GET /donate ──────────────────────────────────────────────────────────────
router.get('/donate', (req, res) => {
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  const isTestMode = keyId.startsWith('rzp_test_');
  res.render('donate', {
    title:       'Donate — A Ray of Hope',
    razorpayKey: keyId,
    upiId:       process.env.UPI_ID || 'arayofhope@upi',
    isTestMode,
    page:        'donate',
    metaDesc:    'Donate to A Ray of Hope. Every rupee feeds a child, funds education, and builds futures.',
    error:       req.flash('error'),
    success:     req.flash('success'),
  });
});

// ─── POST /donate/create-order ────────────────────────────────────────────────
router.post('/donate/create-order', express.json(), async (req, res) => {
  try {
    let { amount, currency, frequency, message, anonymous } = req.body;

    // --- Validate ---
    amount = parseFloat(amount);
    if (!amount || isNaN(amount) || amount < 1 || amount > 1_000_000) {
      return res.status(400).json({ error: 'Amount must be between ₹1 and ₹10,00,000.' });
    }
    currency  = ['INR', 'USD'].includes(currency) ? currency : 'INR';
    frequency = ['once', 'month'].includes(frequency) ? frequency : 'once';
    message   = typeof message === 'string' ? validator.escape(message.slice(0, 200)) : '';

    // --- Create Razorpay order ---
    const rzp   = getRazorpay();
    const order = await rzp.orders.create({
      amount:   Math.round(amount * 100), // paise
      currency,
      receipt:  `aroh_${Date.now()}`,
      notes:    { frequency, anonymous: anonymous ? 'yes' : 'no' },
    });

    // --- Persist to SQLite (pending) ---
    const userId = req.session?.userId || null;
    const result = db.prepare(
      `INSERT INTO donations
         (user_id, amount, currency, method, razorpay_order_id, frequency, message, anonymous, status)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(userId, amount, currency, 'razorpay', order.id, frequency, message, anonymous ? 1 : 0, 'pending');

    res.json({
      orderId:  order.id,
      amount:   order.amount,
      currency: order.currency,
      key:      process.env.RAZORPAY_KEY_ID,
    });

    // Async MongoDB sync (don't await — don't block response)
    const user = userId ? db.prepare('SELECT full_name, email FROM users WHERE id=?').get(userId) : null;
    const row  = db.prepare('SELECT * FROM donations WHERE id=?').get(result.lastInsertRowid);
    syncToMongo(row, user ? { name: user.full_name, email: user.email } : {});

  } catch (err) {
    const isKeyError = err.message?.includes('not configured');
    console.error('create-order error:', err.message);
    res.status(isKeyError ? 503 : 500).json({
      error: isKeyError
        ? 'Payment system not configured. Add your Razorpay test keys to .env'
        : 'Could not create order. Please try again.',
    });
  }
});

// ─── POST /donate/verify ──────────────────────────────────────────────────────
router.post('/donate/verify', express.json(), (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    // All three fields required
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment fields.' });
    }

    // Check order exists in our DB (prevent replay attacks)
    const existing = db.prepare(
      "SELECT * FROM donations WHERE razorpay_order_id=? AND status='pending'"
    ).get(razorpay_order_id);

    if (!existing) {
      return res.status(400).json({ success: false, message: 'Order not found or already processed.' });
    }

    // Verify HMAC signature
    const valid = verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);

    if (valid) {
      db.prepare(
        `UPDATE donations
         SET razorpay_payment_id=?, razorpay_signature=?, status='paid'
         WHERE razorpay_order_id=?`
      ).run(razorpay_payment_id, razorpay_signature, razorpay_order_id);

      const updated = db.prepare('SELECT * FROM donations WHERE razorpay_order_id=?').get(razorpay_order_id);
      const user    = updated.user_id
        ? db.prepare('SELECT full_name, email FROM users WHERE id=?').get(updated.user_id)
        : null;
      syncToMongo(updated, user ? { name: user.full_name, email: user.email } : {});

      return res.json({ success: true, message: 'Payment verified! Thank you 🧡' });
    } else {
      db.prepare("UPDATE donations SET status='failed' WHERE razorpay_order_id=?").run(razorpay_order_id);
      return res.status(400).json({ success: false, message: 'Signature mismatch — payment rejected.' });
    }
  } catch (err) {
    console.error('verify error:', err);
    res.status(500).json({ success: false, message: 'Verification error. Contact support.' });
  }
});

// ─── POST /donate/webhook ─────────────────────────────────────────────────────
// Razorpay server-to-server webhook (backup verification).
// Set Webhook URL in Razorpay Dashboard → Settings → Webhooks → https://yourdomain.com/donate/webhook
// Add the Webhook Secret there and set RAZORPAY_WEBHOOK_SECRET in .env
router.post(
  '/donate/webhook',
  express.raw({ type: 'application/json' }), // raw body for signature check
  (req, res) => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) return res.status(200).send('ok'); // webhook not configured yet

    try {
      const receivedSig = req.headers['x-razorpay-signature'] || '';
      const expectedSig = crypto
        .createHmac('sha256', webhookSecret)
        .update(req.body)
        .digest('hex');

      if (!crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(receivedSig))) {
        console.warn('Webhook signature mismatch');
        return res.status(400).send('Invalid signature');
      }

      const event   = JSON.parse(req.body.toString());
      const payload = event.payload?.payment?.entity || {};

      if (event.event === 'payment.captured') {
        const orderId = payload.order_id;
        if (orderId) {
          db.prepare(
            `UPDATE donations SET status='paid', razorpay_payment_id=? WHERE razorpay_order_id=? AND status='pending'`
          ).run(payload.id, orderId);
          console.log(`✓ Webhook: payment.captured for order ${orderId}`);
        }
      }

      res.status(200).send('ok');
    } catch (err) {
      console.error('Webhook error:', err);
      res.status(200).send('ok'); // always 200 to Razorpay so they don't retry
    }
  }
);

// ─── POST /donate/upi-manual ──────────────────────────────────────────────────
router.post('/donate/upi-manual', express.json(), (req, res) => {
  try {
    let { amount, transaction_id, message, anonymous } = req.body;

    amount         = parseFloat(amount);
    transaction_id = typeof transaction_id === 'string'
      ? validator.escape(transaction_id.trim().slice(0, 50)) : '';
    message        = typeof message === 'string' ? validator.escape(message.slice(0, 200)) : '';

    if (!amount || isNaN(amount) || amount < 1) {
      return res.status(400).json({ success: false, message: 'Enter a valid amount.' });
    }
    if (!transaction_id) {
      return res.status(400).json({ success: false, message: 'Transaction ID is required.' });
    }

    const userId = req.session?.userId || null;
    const result = db.prepare(
      `INSERT INTO donations
         (user_id, amount, currency, method, razorpay_payment_id, frequency, message, anonymous, status)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(userId, amount, 'INR', 'upi_manual', transaction_id, 'once', message, anonymous ? 1 : 0, 'pending_verification');

    const row  = db.prepare('SELECT * FROM donations WHERE id=?').get(result.lastInsertRowid);
    const user = userId ? db.prepare('SELECT full_name, email FROM users WHERE id=?').get(userId) : null;
    syncToMongo(row, user ? { name: user.full_name, email: user.email } : {});

    res.json({ success: true, message: 'Payment recorded! We\'ll verify and confirm within 24 hours.' });
  } catch (err) {
    console.error('upi-manual error:', err);
    res.status(500).json({ success: false, message: 'Could not record payment.' });
  }
});

// ─── GET /donate/recent ───────────────────────────────────────────────────────
router.get('/donate/recent', (req, res) => {
  const recent = db.prepare(
    `SELECT d.amount, d.currency, d.created_at,
            CASE WHEN d.anonymous=1 THEN 'Anonymous' ELSE COALESCE(u.full_name,'Supporter') END AS donor_name
     FROM donations d
     LEFT JOIN users u ON d.user_id = u.id
     WHERE d.status = 'paid'
     ORDER BY d.created_at DESC
     LIMIT 8`
  ).all();
  res.json(recent);
});

module.exports = router;
