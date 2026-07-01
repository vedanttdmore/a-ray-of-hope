const mongoose = require('mongoose');

/**
 * Testimonial — replaces the hardcoded placeholder array in index.ejs
 * Once MongoDB is live, index.ejs pulls from GET /api/testimonials
 */
const testimonialSchema = new mongoose.Schema({
  name:       { type: String, required: true, trim: true },
  city:       { type: String, required: true, trim: true },
  occupation: { type: String, default: '' },
  avatarUrl:  { type: String, default: '' },
  rating:     { type: Number, default: 5, min: 1, max: 5 },
  text:       { type: String, required: true },
  approved:   { type: Boolean, default: false }, // admin must approve before showing
  featured:   { type: Boolean, default: false },
}, { timestamps: true });

testimonialSchema.index({ approved: 1, featured: -1, createdAt: -1 });

module.exports = mongoose.models.Testimonial || mongoose.model('Testimonial', testimonialSchema);
