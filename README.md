# ☀️ A Ray of Hope — NGO Platform

Full-stack Node.js website. Ready to deploy to the internet for free.

---

## 🚀 Go Live in 4 Steps

### Step 1 — MongoDB Atlas (free database, 5 minutes)

1. Go to **https://mongodb.com/atlas** → Sign up free
2. Create a **free M0 cluster** → pick region **Mumbai (ap-south-1)**
3. **Database Access** → Add user → username + password → note them down
4. **Network Access** → Add IP → click **Allow Access from Anywhere** → `0.0.0.0/0`
5. **Connect** → **Drivers** → copy the URI, it looks like:
   ```
   mongodb+srv://youruser:yourpass@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. Add your database name: change `/?` to `/a-ray-of-hope?`:
   ```
   mongodb+srv://youruser:yourpass@cluster0.xxxxx.mongodb.net/a-ray-of-hope?retryWrites=true&w=majority
   ```
7. Keep this URI ready — you'll paste it in Step 3.

---

### Step 2 — Razorpay Test Keys (free, 3 minutes)

1. Go to **https://dashboard.razorpay.com** → Sign up free
2. Make sure **Test Mode** toggle is ON (top left)
3. **Settings → API Keys → Generate Test Key**
4. Save your `rzp_test_XXXXX` Key ID and Key Secret

**Test card numbers (for testing payments):**
| Field    | Value                  |
|----------|------------------------|
| Card No  | 4111 1111 1111 1111    |
| Expiry   | Any future date        |
| CVV      | Any 3 digits           |
| OTP      | 1234                   |

---

### Step 3 — Deploy to Render (free hosting, 5 minutes)

1. Push your code to **GitHub** (create repo → upload zip → or use git)
2. Go to **https://render.com** → Sign up (use GitHub login)
3. **New → Web Service** → Connect your GitHub repo
4. Render auto-detects `render.yaml` — settings are already configured
5. In **Environment** tab, add these variables:

| Key | Value |
|-----|-------|
| `MONGODB_URI` | Your Atlas URI from Step 1 |
| `RAZORPAY_KEY_ID` | Your `rzp_test_XXXXX` from Step 2 |
| `RAZORPAY_KEY_SECRET` | Your key secret from Step 2 |
| `UPI_ID` | Your UPI ID e.g. `yourname@okicici` |
| `SESSION_SECRET` | Click "Generate" — Render does this auto |

6. Click **Deploy** → wait 2–3 minutes
7. Your site is live at `https://a-ray-of-hope.onrender.com` 🎉

---

### Step 4 — Custom Domain (optional, free with Render)

1. Buy a domain e.g. `arayofhope.in` from GoDaddy/Namecheap (~₹600/year)
2. In Render → Settings → Custom Domains → Add domain
3. Follow the DNS instructions Render gives you
4. Done — your site runs on `https://arayofhope.in`

---

## 🧪 Run Locally

```bash
# Install
npm install

# Copy env file and fill in values
cp .env.example .env
# Edit .env — add MongoDB URI and Razorpay test keys

# Run
npm run dev          # auto-restarts on file changes
# OR
npm start            # production mode
```

Open **http://localhost:3000**

---

## ✅ Verify Everything Works

Visit **http://localhost:3000/api/health** — you should see:
```json
{
  "status": "ok",
  "sqlite": "connected",
  "mongodb": "connected",
  "env": "development",
  "razorpay": "configured"
}
```

---

## 📁 Project Structure

```
a-ray-of-hope/
├── server.js              # Express app + security + boot
├── render.yaml            # Render deployment config
├── package.json
├── .env.example           # Template — copy to .env
├── database/
│   ├── init.js            # SQLite schema (always-on)
│   └── mongo.js           # MongoDB connection helper
├── models/                # Mongoose schemas
│   ├── Donation.js
│   ├── Volunteer.js
│   ├── Subscriber.js
│   ├── Testimonial.js
│   └── ContactMessage.js
├── middleware/
│   └── auth.js
├── routes/
│   ├── auth.js            # Login, signup, dashboard
│   ├── donate.js          # Razorpay + UPI + webhook
│   ├── volunteer.js       # Applications + city pins
│   └── api.js             # Newsletter, stats, health
├── views/
│   ├── partials/
│   │   ├── header.ejs     # Nav + SEO meta + ARIA
│   │   └── footer.ejs     # Footer + cookie banner + JS
│   ├── index.ejs          # Homepage
│   ├── donate.ejs         # Donation page
│   ├── volunteer.ejs      # Volunteer page
│   ├── login.ejs
│   ├── signup.ejs
│   ├── dashboard.ejs
│   └── 404.ejs
└── public/
    ├── css/style.css      # Full theme
    ├── robots.txt
    └── sitemap.xml
```

---

## 🔐 Security Features Built In

- **Helmet** — HTTP security headers
- **Rate limiting** — 200 req/15min general, 30 payment/15min, 20 auth/15min
- **HMAC signature verification** — Razorpay payments cryptographically verified
- **Timing-safe comparison** — prevents timing attacks on signature checks
- **Razorpay Webhook** — server-side backup verification at `/donate/webhook`
- **MongoDB Sanitize** — strips NoSQL injection characters
- **Session hardening** — httpOnly, sameSite, secure in production
- **Input validation** — `validator` library on all user inputs
- **CSP headers** — restricts what scripts/resources can load

---

## 💳 Going Live with Real Payments

When you're ready to accept real money (after NGO registration):

1. Get a **current account** in the NGO's name at any bank
2. Complete **KYC on Razorpay** with NGO registration documents
3. In Razorpay dashboard, switch to **Live Mode**
4. Generate **live keys** (they start with `rzp_live_`)
5. Update `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in Render environment
6. Set up the **Webhook** in Razorpay → Settings → Webhooks:
   - URL: `https://yourdomain.com/donate/webhook`
   - Add `RAZORPAY_WEBHOOK_SECRET` to Render environment

---

## 📞 Contact

**Vedant More** — vedanttdmore@gmail.com ·   
