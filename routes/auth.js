const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const db = require('../database/init');
const { isAuthenticated, isGuest } = require('../middleware/auth');

// GET /signup
router.get('/signup', isGuest, (req, res) => {
  res.render('signup', {
    title: 'Create Account — A Ray of Hope',
    error: req.flash('error'),
    success: req.flash('success')
  });
});

// POST /signup
router.post('/signup', isGuest, async (req, res) => {
  try {
    const { full_name, email, phone, password, confirm_password, city, country } = req.body;

    if (!full_name || !email || !password) {
      req.flash('error', 'Name, email and password are required.');
      return res.redirect('/signup');
    }
    if (password.length < 6) {
      req.flash('error', 'Password must be at least 6 characters.');
      return res.redirect('/signup');
    }
    if (password !== confirm_password) {
      req.flash('error', 'Passwords do not match.');
      return res.redirect('/signup');
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      req.flash('error', 'An account with that email already exists.');
      return res.redirect('/signup');
    }

    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare(
      'INSERT INTO users (full_name, email, phone, password, city, country) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(full_name, email, phone || '', hash, city || '', country || 'India');

    req.session.userId = result.lastInsertRowid;
    req.flash('success', 'Welcome to A Ray of Hope!');
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Signup error:', err);
    req.flash('error', 'Something went wrong. Please try again.');
    res.redirect('/signup');
  }
});

// GET /login
router.get('/login', isGuest, (req, res) => {
  res.render('login', {
    title: 'Log In — A Ray of Hope',
    error: req.flash('error'),
    success: req.flash('success')
  });
});

// POST /login
router.post('/login', isGuest, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      req.flash('error', 'Email and password are required.');
      return res.redirect('/login');
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      req.flash('error', 'No account found with that email.');
      return res.redirect('/login');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      req.flash('error', 'Incorrect password.');
      return res.redirect('/login');
    }

    req.session.userId = user.id;
    req.flash('success', `Welcome back, ${user.full_name}!`);
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Login error:', err);
    req.flash('error', 'Something went wrong. Please try again.');
    res.redirect('/login');
  }
});

// GET /logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// GET /dashboard
router.get('/dashboard', isAuthenticated, (req, res) => {
  const user = res.locals.user;
  const donations = db.prepare(
    'SELECT * FROM donations WHERE user_id = ? ORDER BY created_at DESC LIMIT 10'
  ).all(user.id);
  const volunteer = db.prepare(
    'SELECT * FROM volunteers WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(user.id);
  const totalDonated = db.prepare(
    "SELECT COALESCE(SUM(amount), 0) as total FROM donations WHERE user_id = ? AND status = 'paid'"
  ).get(user.id);

  res.render('dashboard', {
    title: 'My Dashboard — A Ray of Hope',
    user,
    donations,
    volunteer,
    totalDonated: totalDonated.total,
    error: req.flash('error'),
    success: req.flash('success')
  });
});

// POST /profile/update
router.post('/profile/update', isAuthenticated, async (req, res) => {
  try {
    const { full_name, phone, city, country } = req.body;
    db.prepare(
      'UPDATE users SET full_name = ?, phone = ?, city = ?, country = ? WHERE id = ?'
    ).run(full_name, phone || '', city || '', country || '', res.locals.user.id);
    req.flash('success', 'Profile updated successfully.');
    res.redirect('/dashboard');
  } catch (err) {
    req.flash('error', 'Could not update profile.');
    res.redirect('/dashboard');
  }
});

module.exports = router;
