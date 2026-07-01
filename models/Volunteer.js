const mongoose = require('mongoose');

/**
 * Volunteer — MongoDB mirror of SQLite volunteers table.
 * SQLite is source of truth; this enables rich querying by city, role, status.
 */
const volunteerSchema = new mongoose.Schema({
  sqliteId:     { type: Number, default: null },
  userId:       { type: Number, default: null },

  fullName:     { type: String, required: true, trim: true },
  email:        { type: String, required: true, lowercase: true, trim: true },
  phone:        { type: String, required: true, trim: true },
  city:         { type: String, required: true, trim: true },
  country:      { type: String, default: 'India', trim: true },
  roleInterest: { type: String, default: 'volunteer',
                  enum: ['volunteer', 'chapter_lead', 'campus_ambassador', 'fundraiser'] },
  availability: { type: String, default: 'weekends',
                  enum: ['weekends', 'weekdays', 'flexible', 'remote'] },
  skills:       { type: String, default: '' },
  motivation:   { type: String, default: '' },
  status:       { type: String, default: 'pending',
                  enum: ['pending', 'approved', 'rejected', 'on_hold'] },
}, { timestamps: true });

volunteerSchema.index({ city: 1, status: 1 });
volunteerSchema.index({ email: 1 }, { unique: true, sparse: true });

module.exports = mongoose.models.Volunteer || mongoose.model('Volunteer', volunteerSchema);
