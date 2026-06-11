/**
 * Material Routes -- shared material library
 *
 * Materials are stored as JSON files in storage/materials/{id}.json
 * ID = client-provided or hash from properties + shaderName.
 * Built-in AB/ADD materials don't need storage -- only custom materials.
 */

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { getStorageRoot, ensureDir } = require('../services/storage');

const router = express.Router();

function getMaterialDir() {
  return path.join(getStorageRoot(), 'materials');
}

/**
 * GET /api/materials -- list all material IDs
 */
router.get('/', async (req, res) => {
  var dir = getMaterialDir();
  try {
    await ensureDir(dir);
    var files = await fs.readdir(dir);
    var materials = [];
    for (var i = 0; i < files.length; i++) {
      if (!files[i].endsWith('.json')) continue;
      var id = files[i].replace('.json', '');
      try {
        var content = JSON.parse(await fs.readFile(path.join(dir, files[i]), 'utf-8'));
        materials.push({ id: id, name: content.name || id, shaderName: content.shaderName || '' });
      } catch (e) {
        materials.push({ id: id, name: id, shaderName: '' });
      }
    }
    res.json({ materials: materials });
  } catch (err) {
    res.json({ materials: [] });
  }
});

/**
 * GET /api/materials/:id -- get material JSON
 */
router.get('/:id', async (req, res) => {
  var filePath = path.join(getMaterialDir(), req.params.id + '.json');
  try {
    var data = await fs.readFile(filePath, 'utf-8');
    res.set('Content-Type', 'application/json');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(data);
  } catch (err) {
    res.status(404).json({ error: 'Material not found: ' + req.params.id });
  }
});

/**
 * POST /api/materials -- upload material JSON, returns hash ID
 * Body: { name, shaderName, shaderId, blendMode, properties: { floats, colors, textures } }
 * If body has `id`, use it. Otherwise compute hash from properties + shaderName.
 */
router.post('/', async (req, res) => {
  var dir = getMaterialDir();
  await ensureDir(dir);
  var data = req.body;

  if (!data || !data.shaderName) {
    return res.status(400).json({ error: 'shaderName is required' });
  }

  // Use ID from client or generate from hash
  var id = data.id;
  if (!id) {
    var hashInput = JSON.stringify(data.properties || {}) + data.shaderName;
    id = 'mat_' + crypto.createHash('md5').update(hashInput).digest('hex').substring(0, 12);
    data.id = id;
  }

  var filePath = path.join(dir, id + '.json');

  // Always overwrite — upsert behavior

  data.id = id;
  await fs.writeFile(filePath, JSON.stringify(data), 'utf-8');
  res.json({ message: 'Material saved', id: id });
});

/**
 * HEAD /api/materials/:id -- check if material exists
 */
router.head('/:id', async (req, res) => {
  var filePath = path.join(getMaterialDir(), req.params.id + '.json');
  try {
    await fs.access(filePath);
    res.status(200).end();
  } catch {
    res.status(404).end();
  }
});

router.delete('/:id', async (req, res) => {
  var filePath = path.join(getMaterialDir(), req.params.id + '.json');
  try { await fs.unlink(filePath); res.json({ message: 'Deleted', id: req.params.id }); }
  catch { res.status(404).json({ error: 'Material not found' }); }
});

module.exports = router;
