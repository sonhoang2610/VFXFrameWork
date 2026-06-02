/**
 * Unified Asset Routes -- GUID-based asset storage
 *
 * All asset types (textures, materials, meshes, shaders) are stored under
 * a single endpoint keyed by Unity GUID (from .meta files).
 *
 * Storage layout:
 *   storage/assets/{guid}.bin        — binary file (image, shader source, mesh JSON)
 *   storage/assets/{guid}.meta.json  — metadata sidecar
 *
 * Materials have no binary file; all data lives in meta.json.
 */

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const { getStorageRoot, ensureDir } = require('../services/storage');

const router = express.Router();

// Multer with memory storage for binary uploads (textures, shaders, meshes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB
  },
});

const VALID_TYPES = ['texture', 'material', 'mesh', 'shader'];

function getAssetsDir() {
  return path.join(getStorageRoot(), 'assets');
}

function binPath(dir, guid) {
  return path.join(dir, guid + '.bin');
}

function metaPath(dir, guid) {
  return path.join(dir, guid + '.meta.json');
}

/**
 * GET /api/assets — list all assets
 * Optional query: ?type=texture | material | mesh | shader
 */
router.get('/', async (req, res) => {
  var dir = getAssetsDir();
  try {
    await ensureDir(dir);
    var files = await fs.readdir(dir);
    var assets = [];
    var typeFilter = req.query.type || null;

    for (var i = 0; i < files.length; i++) {
      if (!files[i].endsWith('.meta.json')) continue;
      var guid = files[i].replace('.meta.json', '');
      try {
        var content = JSON.parse(await fs.readFile(path.join(dir, files[i]), 'utf-8'));
        if (typeFilter && content.type !== typeFilter) continue;
        assets.push({
          guid: content.guid || guid,
          name: content.name || guid,
          type: content.type || 'unknown',
          assetPath: content.assetPath || '',
        });
      } catch (e) {
        // Skip corrupted meta files
      }
    }
    res.json({ assets: assets });
  } catch (err) {
    res.json({ assets: [] });
  }
});

/**
 * GET /api/assets/:guid/meta — get metadata JSON
 * (Must be registered before /:guid to avoid being swallowed by it)
 */
router.get('/:guid/meta', async (req, res) => {
  var mp = metaPath(getAssetsDir(), req.params.guid);
  try {
    var data = await fs.readFile(mp, 'utf-8');
    res.set('Content-Type', 'application/json');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(data);
  } catch (err) {
    res.status(404).json({ error: 'Asset metadata not found: ' + req.params.guid });
  }
});

/**
 * GET /api/assets/:guid — download binary file
 *
 * For materials (no binary), returns the full metadata as JSON.
 * For textures, returns the image with appropriate Content-Type.
 * For shaders, returns source as text/plain.
 * For meshes, returns mesh JSON as application/json.
 */
router.get('/:guid', async (req, res) => {
  var dir = getAssetsDir();
  var mp = metaPath(dir, req.params.guid);
  var bp = binPath(dir, req.params.guid);

  try {
    var metaRaw = await fs.readFile(mp, 'utf-8');
    var meta = JSON.parse(metaRaw);

    // Materials have no binary file — return metadata as the payload
    if (meta.type === 'material') {
      res.set('Content-Type', 'application/json');
      res.set('Access-Control-Allow-Origin', '*');
      return res.send(metaRaw);
    }

    var data = await fs.readFile(bp);

    // Set Content-Type based on asset type
    var contentType = 'application/octet-stream';
    if (meta.type === 'texture') {
      var ext = path.extname(meta.fileName || '').toLowerCase();
      var imageTypes = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.tga': 'image/tga',
      };
      contentType = imageTypes[ext] || 'image/png';
    } else if (meta.type === 'shader') {
      contentType = 'text/plain';
    } else if (meta.type === 'mesh') {
      contentType = 'application/json';
    }

    res.set('Content-Type', contentType);
    res.set('Access-Control-Allow-Origin', '*');
    res.send(data);
  } catch (err) {
    res.status(404).json({ error: 'Asset not found: ' + req.params.guid });
  }
});

/**
 * POST /api/assets/:guid — upload/upsert asset (multipart)
 *
 * Multipart form fields:
 *   file     — binary file (required for texture/mesh/shader, absent for material)
 *   metadata — JSON string with asset metadata
 *
 * GUID comes from the URL parameter (assigned by Unity from .meta files).
 */
router.post('/:guid', upload.single('file'), async (req, res) => {
  var dir = getAssetsDir();
  await ensureDir(dir);
  var guid = req.params.guid;

  // Parse metadata
  var meta = {};
  if (req.body && req.body.metadata) {
    try {
      meta = JSON.parse(req.body.metadata);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid metadata JSON' });
    }
  }

  // Validate type
  var assetType = meta.type;
  if (!assetType || VALID_TYPES.indexOf(assetType) === -1) {
    return res.status(400).json({ error: 'metadata.type is required and must be one of: ' + VALID_TYPES.join(', ') });
  }

  // For non-material types, a file is required
  if (assetType !== 'material' && !req.file) {
    return res.status(400).json({ error: 'file is required for type: ' + assetType });
  }

  // Save binary file (if present)
  if (req.file) {
    await fs.writeFile(binPath(dir, guid), req.file.buffer);
  }

  // Build and save metadata sidecar
  var metaData = Object.assign({}, meta, {
    guid: guid,
    uploadedAt: new Date().toISOString(),
  });
  // Ensure core fields are present
  if (!metaData.name) metaData.name = (req.file && req.file.originalname) || guid;
  if (!metaData.fileName && req.file) metaData.fileName = req.file.originalname || '';
  if (req.file) metaData.fileSize = req.file.buffer.length;

  await fs.writeFile(metaPath(dir, guid), JSON.stringify(metaData, null, 2), 'utf-8');

  res.json({ message: 'Asset saved', guid: guid, type: assetType });
});

/**
 * HEAD /api/assets/:guid — check if asset exists
 */
router.head('/:guid', async (req, res) => {
  var mp = metaPath(getAssetsDir(), req.params.guid);
  try {
    await fs.access(mp);
    res.status(200).end();
  } catch {
    res.status(404).end();
  }
});

/**
 * DELETE /api/assets/:guid — delete asset (binary + metadata)
 */
router.delete('/:guid', async (req, res) => {
  var dir = getAssetsDir();
  var mp = metaPath(dir, req.params.guid);
  var bp = binPath(dir, req.params.guid);

  try {
    await fs.access(mp);
  } catch {
    return res.status(404).json({ error: 'Asset not found: ' + req.params.guid });
  }

  // Delete binary file (may not exist for materials)
  try { await fs.unlink(bp); } catch { /* ok — materials have no .bin */ }
  // Delete metadata
  await fs.unlink(mp);

  res.json({ message: 'Deleted', guid: req.params.guid });
});

module.exports = router;
