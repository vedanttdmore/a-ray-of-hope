require('dotenv').config();
const express      = require('express');
const session      = require('express-session');
const flash        = require('connect-flash');
const cookieParser = require('cookie-parser');
const path         = require('path');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');

const { connectMongo, isMongConnected } = require('./database/mongo');
const db = require('./database/init'); // SQLite — always-on source of truth

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Security headers (Helmet) ────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", 'checkout.razorpay.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com'],
      styleSrc:    ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
      fontSrc:     ["'self'", 'fonts.gstatic.com'],
      imgSrc:      ["'self'", 'data:', 'https://images.unsplash.com', 'https://api.qrserver.com', 'https://chart.googleapis.com'],
      connectSrc:  ["'self'", 'api.razorpay.com', 'checkout.razorpay.com', 'lumberjack.razorpay.com'],
      frameSrc:    ['api.razorpay.com', 'checkout.razorpay.com'],
      objectSrc:   ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false, // needed for Razorpay iframes
}));

// ─── Rate limiters ────────────────────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // max 30 payment attempts per 15 min per IP
  message: { error: 'Too many payment attempts. Please wait a few minutes.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // max 20 login/signup attempts per 15 min
  message: 'Too many attempts. Please try again in 15 minutes.',
});

app.use(generalLimiter);

// ─── View engine ──────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ─── Core middleware ──────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
app.use(mongoSanitize()); // strips $ and . from req.body, req.params, req.query

// ─── Session ──────────────────────────────────────────────────────────────────
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  name: 'aroh.sid', // don't expose default 'connect.sid' name
  cookie: {
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,                      // JS can't read cookie
    sameSite: 'lax',
    secure:   process.env.NODE_ENV === 'production', // HTTPS only in prod
  },
};

// In production, store sessions in MongoDB so they survive server restarts
if (process.env.NODE_ENV === 'production' && process.env.MONGODB_URI) {
  const MongoStore = require('connect-mongo');
  sessionConfig.store = MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions',
    ttl: 7 * 24 * 60 * 60, // 7 days in seconds
  });
}

app.use(session(sessionConfig));
app.use(flash());

// ─── Auth user context ────────────────────────────────────────────────────────
const { attachUser } = require('./middleware/auth');
app.use(attachUser);

// ─── Flash + MongoDB status in all views ─────────────────────────────────────
app.use((req, res, next) => {
  res.locals.flashError    = req.flash('error');
  res.locals.flashSuccess  = req.flash('success');
  res.locals.mongoLive     = isMongConnected(); // views can show live-data badge
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/', authLimiter,    require('./routes/auth'));
app.use('/', paymentLimiter, require('./routes/donate'));
app.use('/',                 require('./routes/volunteer'));
app.use('/api',              require('./routes/api'));    // new: JSON API endpoints

// ─── Home page ────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  const stats = {
    meals:      db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM donations WHERE status='paid'").get().t,
    cities:     db.prepare('SELECT COUNT(*) as c FROM cities').get().c,
    volunteers: db.prepare('SELECT COUNT(*) as c FROM volunteers').get().c + 1190,
    donations:  db.prepare("SELECT COUNT(*) as c FROM donations WHERE status='paid'").get().c,
  };
  const cities = db.prepare('SELECT name FROM cities ORDER BY id DESC LIMIT 30').all();
  res.render('index', {
    title:    'A Ray of Hope — Every Child Deserves a Tomorrow',
    stats,
    cities:   cities.map(c => c.name),
    page:     'home',
    metaDesc: 'A Ray of Hope — a child-first movement fighting hunger, poverty and child labour across India. Donate, volunteer, or start a chapter in your city.',
    error:    req.flash('error'),
    success:  req.flash('success'),
  });
});

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found — A Ray of Hope' });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  const status = err.status || 500;
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(status).json({ error: 'Something went wrong.' });
  }
  res.status(status).render('404', { title: 'Something went wrong — A Ray of Hope' });
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  // Connect MongoDB (non-fatal if unavailable)
  await connectMongo();

  app.listen(PORT, () => {
    console.log(`
  ╔═══════════════════════════════════════════════╗
  ║                                               ║
  ║   ☀  A RAY OF HOPE — Server Running          ║
  ║                                               ║
  ║   Local :  http://localhost:${PORT}               ║
  ║   SQLite:  ✓ always-on                        ║
  ║   MongoDB: ${isMongConnected() ? '✓ connected' : '○ not connected (set MONGODB_URI)'}            ║
  ║                                               ║
  ╚═══════════════════════════════════════════════╝
    `);
  });
}

boot();
