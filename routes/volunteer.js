const express  = require('express');
const router   = express.Router();
const validator = require('validator');
const db       = require('../database/init');
const { isMongConnected } = require('../database/mongo');
const VolunteerModel = require('../models/Volunteer');
const ContactMessage = require('../models/ContactMessage');

// GET /volunteer
router.get('/volunteer', (req, res) => {
  const cities = db.prepare('SELECT name FROM cities ORDER BY name ASC').all();
  const volunteerCount = db.prepare('SELECT COUNT(*) as c FROM volunteers').get();
  res.render('volunteer', {
    title: 'Volunteer — A Ray of Hope',
    cities: cities.map(c => c.name),
    volunteerCount: volunteerCount.c + 1190,
    page: 'volunteer',
    metaDesc: 'Volunteer with A Ray of Hope. Start a chapter, join food drives, or become a campus ambassador. Real impact, real cities, real change.',
    error: req.flash('error'),
    success: req.flash('success')
  });
});

// POST /volunteer/apply
router.post('/volunteer/apply', (req, res) => {
  try {
    const { full_name, email, phone, city, country, role_interest, availability, skills, motivation } = req.body;
    if (!full_name || !email || !phone || !city) {
      req.flash('error', 'Please fill in all required fields.');
      return res.redirect('/volunteer');
    }
    const userId = req.session?.userId || null;
    const result = db.prepare(
      'INSERT INTO volunteers (user_id, full_name, email, phone, city, country, role_interest, availability, skills, motivation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(userId, full_name, email, phone, city, country || 'India', role_interest || 'volunteer', availability || 'weekends', skills || '', motivation || '');

    // Sync to MongoDB (non-fatal)
    if (isMongConnected()) {
      VolunteerModel.findOneAndUpdate(
        { email: email.toLowerCase() },
        { sqliteId: result.lastInsertRowid, userId, fullName: full_name, email: email.toLowerCase(),
          phone, city, country: country || 'India', roleInterest: role_interest || 'volunteer',
          availability: availability || 'weekends', skills: skills || '', motivation: motivation || '' },
        { upsert: true, new: true }
      ).catch(err => console.warn('MongoDB volunteer sync failed:', err.message));
    }

    // Also add city to cities if not exists
    const exists = db.prepare('SELECT id FROM cities WHERE LOWER(name) = LOWER(?)').get(city);
    if (!exists) {
      db.prepare('INSERT INTO cities (name, added_by) VALUES (?, ?)').run(city, userId);
    }

    req.flash('success', 'Your volunteer application has been submitted! We will reach out within 48 hours.');
    res.redirect('/volunteer#success');
  } catch (err) {
    console.error('Volunteer apply error:', err);
    req.flash('error', 'Something went wrong. Please try again.');
    res.redirect('/volunteer');
  }
});

// POST /volunteer/pin-city
router.post('/volunteer/pin-city', express.json(), (req, res) => {
  try {
    const { city } = req.body;
    if (!city) return res.status(400).json({ error: 'City name required' });
    const exists = db.prepare('SELECT id FROM cities WHERE LOWER(name) = LOWER(?)').get(city.trim());
    if (!exists) {
      const userId = req.session?.userId || null;
      db.prepare('INSERT INTO cities (name, added_by) VALUES (?, ?)').run(city.trim(), userId);
    }
    const cities = db.prepare('SELECT name FROM cities ORDER BY id DESC LIMIT 50').all();
    const count = db.prepare('SELECT COUNT(*) as c FROM cities').get();
    res.json({ cities: cities.map(c => c.name), count: count.c });
  } catch (err) {
    res.status(500).json({ error: 'Could not add city' });
  }
});

// GET cities list API
router.get('/volunteer/cities', (req, res) => {
  const cities = db.prepare('SELECT name FROM cities ORDER BY id DESC LIMIT 50').all();
  const count = db.prepare('SELECT COUNT(*) as c FROM cities').get();
  res.json({ cities: cities.map(c => c.name), count: count.c });
});

// POST /contact
router.post('/contact', (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !message) {
      req.flash('error', 'Please fill in all required fields.');
      return res.redirect('/#contact');
    }
    db.prepare('INSERT INTO contact_messages (name, email, subject, message) VALUES (?, ?, ?, ?)').run(name, email, subject || '', message);

    // Sync to MongoDB
    if (isMongConnected()) {
      ContactMessage.create({ name, email, subject: subject || '', message })
        .catch(err => console.warn('MongoDB contact sync failed:', err.message));
    }
    req.flash('success', 'Message sent! We will get back to you soon.');
    res.redirect('/#contact');
  } catch (err) {
    req.flash('error', 'Could not send message.');
    res.redirect('/#contact');
  }
});

module.exports = router;
