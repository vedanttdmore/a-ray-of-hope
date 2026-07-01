const mongoose = require('mongoose');

/**
 * Donation — MongoDB mirror of SQLite donations table.
 *
 * Why both SQLite AND MongoDB?
 * - SQLite is the source of truth for payment records (fast, local, no network dep)
 * - MongoDB copy enables analytics queries, dashboards, and future BI tooling
 *   without touching the transactional DB
 *
 * Sync happens in routes/donate.js after every successful payment verification.
 */
const donationSchema = new mongoose.Schema({
  // Link back to SQLite row id for reconciliation
  sqliteId:         { type: Number, default: null },

  // User
  userId:           { type: Number, default: null },   // SQLite user id
  donorName:        { type: String, default: 'Anonymous' },
  donorEmail:       { type: String, default: '' },

  // Payment
  amount:           { type: Number, required: true },
  currency:         { type: String, default: 'INR', enum: ['INR', 'USD'] },
  method:           { type: String, default: 'razorpay',
                      enum: ['razorpay', 'upi_manual', 'card', 'netbanking', 'wallet'] },
  frequency:        { type: String, default: 'once', enum: ['once', 'month'] },
  anonymous:        { type: Boolean, default: false },
  message:          { type: String, default: '' },

  // Razorpay fields
  razorpayOrderId:  { type: String, default: '' },
  razorpayPaymentId:{ type: String, default: '' },
  razorpaySignature:{ type: String, default: '' },

  // Status
  status:           { type: String, default: 'pending',
                      enum: ['pending', 'paid', 'failed', 'refunded', 'pending_verification'] },

  // Timestamps
  paidAt:           { type: Date, default: null },
}, { timestamps: true });

// Index for dashboard queries
donationSchema.index({ status: 1, createdAt: -1 });
donationSchema.index({ userId: 1 });
donationSchema.index({ razorpayOrderId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.models.Donation || mongoose.model('Donation', donationSchema);
