const mongoose = require('mongoose');

let isConnected = false;

async function connectMongo() {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('⚠  MONGODB_URI not set — MongoDB features disabled. Set it in .env to enable.');
    return;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log('✓  MongoDB connected:', mongoose.connection.host);
  } catch (err) {
    console.warn('⚠  MongoDB connection failed (app still runs on SQLite):', err.message);
    // Non-fatal — SQLite handles critical data (auth, donations, volunteers)
    // MongoDB is used for: testimonials, gallery, team, events, newsletter, blog
  }
}

function isMongConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

module.exports = { connectMongo, isMongConnected };
