// Authentication middleware

function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  req.flash('error', 'Please log in to continue.');
  res.redirect('/login');
}

function isGuest(req, res, next) {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  next();
}

function attachUser(req, res, next) {
  res.locals.user = null;
  res.locals.isLoggedIn = false;
  if (req.session && req.session.userId) {
    const db = require('../database/init');
    const user = db.prepare('SELECT id, full_name, email, phone, city, country, role, avatar_url, created_at FROM users WHERE id = ?').get(req.session.userId);
    if (user) {
      res.locals.user = user;
      res.locals.isLoggedIn = true;
    }
  }
  next();
}

module.exports = { isAuthenticated, isGuest, attachUser };
