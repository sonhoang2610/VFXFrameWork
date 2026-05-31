/**
 * Texture Routes -- standalone texture storage
 *
 * Textures are stored as binary image files in storage/textures/{id}.{ext}
 * alongside a metadata sidecar at storage/textures/{id}.meta.json.
 * ID = MD5 hash of file content (or client-provided).
 * Enables texture sharing across multiple VFX packages.
 */

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const multer = require('multer');
const { getStorageRoot, ensureDir } = require('../services/storage');

const router = express.Router();

// Configure multer with memory storage for texture uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB per texture
  },
});

function getTextureDir() {
  return path.join(getStorageRoot(), 'textures');
}

/** Determine file extension from mimetype or original filename. */
function getExtension(file) {
  if (file.originalname) {
    var ext = path.extname(file.originalname).toLowerCase();
    if (ext) return ext; // includes the dot, e.g. ".png"
  }
  // Fallback based on mimetype
  var mimeMap = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/tga': '.tga',
  };
  return mimeMap[file.mimetype] || '.png';
}

/**
 * GET /api/textures -- list all texture IDs
 */
router.get('/', async (req, res) => {
  var dir = getTextureDir();
  try {
    await ensureDir(dir);
    var files = await fs.readdir(dir);
    var textures = files
      .filter(function (f) { return f.endsWith('.meta.json'); })
      .map(function (f) { return f.replace('.meta.json', ''); });
    res.json({ textures: textures });
  } catch (err) {
    res.json({ textures: [] });
  }
});

/**
 * GET /api/textures/:id -- download texture file (binary)
 */
router.get('/:id', async (req, res) => {
  var dir = getTextureDir();
  var metaPath = path.join(dir, req.params.id + '.meta.json');
  try {
    var metaRaw = await fs.readFile(metaPath, 'utf-8');
    var meta = JSON.parse(metaRaw);
    var ext = meta.extension || '.png';
    var filePath = path.join(dir, req.params.id + ext);
    var data = await fs.readFile(filePath);

    // Determine content type from extension
    var contentTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.tga': 'image/tga',
    };
    res.set('Content-Type', contentTypes[ext] || 'application/octet-stream');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(data);
  } catch (err) {
    res.status(404).json({ error: 'Texture not found: ' + req.params.id });
  }
});

/**
 * GET /api/textures/:id/meta -- get texture metadata
 */
router.get('/:id/meta', async (req, res) => {
  var metaPath = path.join(getTextureDir(), req.params.id + '.meta.json');
  try {
    var data = await fs.readFile(metaPath, 'utf-8');
    res.set('Content-Type', 'application/json');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(data);
  } catch (err) {
    res.status(404).json({ error: 'Texture metadata not found: ' + req.params.id });
  }
});

/**
 * POST /api/textures -- upload texture (multipart)
 * Fields:
 *   file     — the texture image binary
 *   metadata — JSON string with { id?, name, width, height, sprites[] }
 *
 * ID defaults to MD5 of file content if not supplied in metadata.
 */
router.post('/', upload.single('file'), async (req, res) => {
  var dir = getTextureDir();
  await ensureDir(dir);

  if (!req.file) {
    return res.status(400).json({ error: 'file is required' });
  }

  // Parse metadata (sent as JSON string in multipart form)
  var meta = {};
  if (req.body && req.body.metadata) {
    try {
      meta = JSON.parse(req.body.metadata);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid metadata JSON' });
    }
  }

  // Compute or use provided ID
  var id = meta.id;
  if (!id) {
    id = 'tex_' + crypto.createHash('md5').update(req.file.buffer).digest('hex').substring(0, 12);
  }

  var ext = getExtension(req.file);
  var filePath = path.join(dir, id + ext);
  var metaPath = path.join(dir, id + '.meta.json');

  // Skip if already exists (same texture content)
  try {
    await fs.access(filePath);
    return res.json({ message: 'Texture already exists', id: id });
  } catch {}

  // Save the image file
  await fs.writeFile(filePath, req.file.buffer);

  // Save metadata sidecar
  var metaData = {
    id: id,
    name: meta.name || req.file.originalname || id,
    extension: ext,
    width: meta.width || null,
    height: meta.height || null,
    sprites: meta.sprites || [],
    size: req.file.buffer.length,
    uploadedAt: new Date().toISOString(),
  };
  await fs.writeFile(metaPath, JSON.stringify(metaData), 'utf-8');

  res.json({ message: 'Texture saved', id: id });
});

/**
 * HEAD /api/textures/:id -- check if texture exists
 */
router.head('/:id', async (req, res) => {
  var metaPath = path.join(getTextureDir(), req.params.id + '.meta.json');
  try {
    await fs.access(metaPath);
    res.status(200).end();
  } catch {
    res.status(404).end();
  }
});

module.exports = router;
