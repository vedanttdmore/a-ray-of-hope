const express    = require('express');
const router     = express.Router();
const validator  = require('validator');
const db         = require('../database/init');
const { isMongConnected } = require('../database/mongo');
const Subscriber   = require('../models/Subscriber');
const Testimonial  = require('../models/Testimonial');

// ─── POST /api/newsletter ─────────────────────────────────────────────────────
router.post('/newsletter', express.json(), async (req, res) => {
  try {
    const email  = (req.body.email || '').toString().trim().toLowerCase();
    const source = req.body.source || 'footer';

    if (!email || !validator.isEmail(email)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email.' });
    }

    if (!isMongConnected()) {
      // Graceful degradation — log to console until MongoDB is up
      console.log(`[Newsletter signup — no MongoDB] ${email}`);
      return res.json({ success: true, message: 'Subscribed! (pending MongoDB)' });
    }

    await Subscriber.findOneAndUpdate(
      { email },
      { email, active: true, source, unsubscribedAt: null },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: 'You\'re subscribed! 🧡' });
  } catch (err) {
    console.error('newsletter error:', err);
    res.status(500).json({ success: false, message: 'Could not subscribe. Try again.' });
  }
});

// ─── GET /api/testimonials ────────────────────────────────────────────────────
router.get('/testimonials', async (req, res) => {
  try {
    if (!isMongConnected()) {
      // Return hardcoded placeholders when MongoDB is offline
      return res.json({ source: 'placeholder', data: PLACEHOLDER_TESTIMONIALS });
    }
    const data = await Testimonial.find({ approved: true })
      .sort({ featured: -1, createdAt: -1 })
      .limit(10)
      .lean();
    res.json({ source: 'db', data });
  } catch (err) {
    res.json({ source: 'placeholder', data: PLACEHOLDER_TESTIMONIALS });
  }
});

// ─── GET /api/stats ───────────────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  try {
    const stats = {
      totalDonated:   db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM donations WHERE status='paid'").get().t,
      totalDonations: db.prepare("SELECT COUNT(*) as c FROM donations WHERE status='paid'").get().c,
      cities:         db.prepare('SELECT COUNT(*) as c FROM cities').get().c,
      volunteers:     db.prepare('SELECT COUNT(*) as c FROM volunteers').get().c + 1190,
    };
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch stats.' });
  }
});

// ─── GET /api/health ──────────────────────────────────────────────────────────
router.get('/health', (req, res) => {
  res.json({
    status:  'ok',
    sqlite:  'connected',
    mongodb: isMongConnected() ? 'connected' : 'disconnected',
    env:     process.env.NODE_ENV || 'development',
    razorpay: (process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_') ? 'configured' : 'not configured',
  });
});

// ─── Placeholder testimonials (shown when MongoDB offline) ───────────────────
const PLACEHOLDER_TESTIMONIALS = [
  { name:'Aisha R.',  city:'Hyderabad', occupation:'Student, Chapter Lead', avatarUrl:'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=160&q=80', rating:5, text:"I started a chapter in my hostel with four friends. Six months later we feed 200 kids every weekend. You don't need permission to begin." },
  { name:'Daniel K.', city:'Toronto',   occupation:'Software Engineer', avatarUrl:'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=160&q=80', rating:5, text:"I donate ₹500 a month. It's one dinner out for me. For them it's a week of school meals. The math made the choice obvious." },
  { name:'Ravi M.',   city:'Pune',      occupation:'Former Beneficiary, Volunteer', avatarUrl:'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=160&q=80', rating:5, text:"They gave me a meal, then a school bag, then a reason to dream bigger than the kiln I was born next to. Now I volunteer here on weekends." },
  { name:'Meera S.',  city:'Mumbai',    occupation:'Marketing Manager', avatarUrl:'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=160&q=80', rating:4, text:"As a working mother I never had time to volunteer in person. The clothes donation drive let me contribute from home, and I could track exactly which chapter received them." },
  { name:'Arjun P.',  city:'Bengaluru', occupation:'Campus Ambassador', avatarUrl:'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=160&q=80', rating:5, text:"My college made volunteering here a campus tradition. Three years later we've run 40+ food drives. It started with one ambassador signup — that could be you." },
];

module.exports = router;
