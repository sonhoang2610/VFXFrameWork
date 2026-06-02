/**
 * IKAME VFX Hub Server
 *
 * Express server for managing VFX asset packages.
 * Provides upload, catalog, download, and deletion of VFX packages.
 * Authenticates users via Google OAuth (company accounts).
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { ensureDir } = require('./src/services/storage');

const vfxRoutes = require('./src/routes/vfx');
const authRoutes = require('./src/routes/auth');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

// ── Middleware ───────────────────────────────────────────────────────────────

// Enable CORS for all origins (internal LAN tool)
app.use(cors());

// Parse JSON request bodies
app.use(express.json());

// Parse URL-encoded request bodies
app.use(express.urlencoded({ extended: true }));

// Session middleware (required by passport for OAuth handshake)
app.use(
  session({
    secret: process.env.JWT_SECRET || 'ikame-vfx-hub-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }, // Set to true if behind HTTPS reverse proxy
  })
);

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// ── Passport Configuration ─────────────────────────────────────────────────

// Serialize/deserialize user for session (minimal — we use JWT, not sessions)
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

// Configure Google OAuth 2.0 strategy
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (googleClientId && googleClientSecret) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: googleClientId,
        clientSecret: googleClientSecret,
        callbackURL: '/auth/google/callback',
      },
      (accessToken, refreshToken, profile, done) => {
        // Extract user info from Google profile
        const user = {
          name: profile.displayName,
          email:
            profile.emails && profile.emails.length > 0
              ? profile.emails[0].value
              : '',
          picture:
            profile.photos && profile.photos.length > 0
              ? profile.photos[0].value
              : '',
        };
        done(null, user);
      }
    )
  );
  console.log('Google OAuth strategy configured.');
} else {
  console.warn(
    'WARNING: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set. Google OAuth login will not work.'
  );
}

// Serve VFXHub frontend (sibling directory)
app.use(express.static(path.join(__dirname, '..', 'VFXHub')));

// Serve WebGL viewer build
app.use('/webgl', express.static(path.join(__dirname, 'webgl-build')));

// ── Routes ──────────────────────────────────────────────────────────────────

app.use('/api/vfx', vfxRoutes);
app.use('/api/assets', require('./src/routes/assets'));

// Legacy routes — kept for backward compatibility
app.use('/api/meshes', require('./src/routes/meshes'));
app.use('/api/shaders', require('./src/routes/shaders'));
app.use('/api/materials', require('./src/routes/materials'));
app.use('/api/textures', require('./src/routes/textures'));

// Auth routes are mounted at /auth (not /api/auth) so the OAuth redirect URLs are clean
app.use('/auth', authRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Serve VFXHub HTML for root and non-API/non-auth routes (SPA fallback)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'VFXHub', 'VFX Hub.html'));
});

// ── Error Handling ──────────────────────────────────────────────────────────

// 404 handler for API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);

  // Handle multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large' });
  }
  if (err.code && err.code.startsWith('LIMIT_')) {
    return res.status(400).json({ error: err.message });
  }

  res.status(500).json({ error: 'Internal server error' });
});

// ── Start Server ────────────────────────────────────────────────────────────

async function start() {
  // Ensure storage directory exists
  const storagePath = path.resolve(process.env.STORAGE_PATH || './storage');
  await ensureDir(storagePath);

  app.listen(PORT, () => {
    console.log(`IKAME VFX Hub Server listening on port ${PORT}`);
    console.log(`Storage path: ${storagePath}`);
    console.log(`Static files: ${path.join(__dirname, '..', 'VFXHub')}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
