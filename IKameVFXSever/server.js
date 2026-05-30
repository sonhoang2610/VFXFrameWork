/**
 * IKAME VFX Hub Server
 *
 * Express server for managing VFX asset packages.
 * Provides upload, catalog, download, and deletion of VFX packages.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
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

// Serve static files from public/ directory (for web frontend later)
app.use(express.static(path.join(__dirname, 'public')));

// ── Routes ──────────────────────────────────────────────────────────────────

app.use('/api/vfx', vfxRoutes);
app.use('/api/auth', authRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
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
    console.log(`Static files: ${path.join(__dirname, 'public')}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
