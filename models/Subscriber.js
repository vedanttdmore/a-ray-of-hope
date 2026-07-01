const mongoose = require('mongoose');

const subscriberSchema = new mongoose.Schema({
  email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
  active:      { type: Boolean, default: true },
  source:      { type: String, default: 'footer', enum: ['footer', 'donate', 'volunteer', 'popup'] },
  unsubscribedAt: { type: Date, default: null },
}, { timestamps: true });

subscriberSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.models.Subscriber || mongoose.model('Subscriber', subscriberSchema);
