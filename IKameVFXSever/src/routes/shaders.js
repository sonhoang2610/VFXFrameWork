/**
 * Shader Routes -- shared shader library
 *
 * Shaders are stored as raw .shader files in storage/shaders/{id}.shader
 * ID = shader name with '/' replaced by '__' (e.g., "IKame/Add_CenterGlow" -> "IKame__Add_CenterGlow").
 * Built-in shaders (AB/ADD) don't need storage -- only custom shaders.
 */

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { getStorageRoot, ensureDir } = require('../services/storage');

const router = express.Router();

function getShaderDir() {
  return path.join(getStorageRoot(), 'shaders');
}

/** Convert a shader name (Unity path) to a safe filename segment. */
function toFilename(shaderName) {
  return shaderName.replace(/\//g, '__');
}

/**
 * GET /api/shaders -- list all shader IDs
 */
router.get('/', async (req, res) => {
  var dir = getShaderDir();
  try {
    await ensureDir(dir);
    var files = await fs.readdir(dir);
    var shaders = files
      .filter(function (f) { return f.endsWith('.shader'); })
      .map(function (f) { return f.replace('.shader', ''); });
    res.json({ shaders: shaders });
  } catch (err) {
    res.json({ shaders: [] });
  }
});

/**
 * GET /api/shaders/:id -- download shader file (raw text)
 */
router.get('/:id', async (req, res) => {
  var filePath = path.join(getShaderDir(), req.params.id + '.shader');
  try {
    var data = await fs.readFile(filePath, 'utf-8');
    res.set('Content-Type', 'text/plain');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(data);
  } catch (err) {
    res.status(404).json({ error: 'Shader not found: ' + req.params.id });
  }
});

/**
 * POST /api/shaders -- upload shader
 * Body: { id: "IKame__Add_CenterGlow", content: "shader source code..." }
 *        or { name: "IKame/Add_CenterGlow", content: "shader source code..." }
 */
router.post('/', async (req, res) => {
  var dir = getShaderDir();
  await ensureDir(dir);
  var data = req.body;

  if (!data || !data.content) {
    return res.status(400).json({ error: 'content is required' });
  }

  // Derive ID: use explicit id, or convert name (Unity path) to filename-safe id
  var id = data.id;
  if (!id) {
    if (!data.name) {
      return res.status(400).json({ error: 'id or name is required' });
    }
    id = toFilename(data.name);
  }

  var filePath = path.join(dir, id + '.shader');

  // Skip if already exists (same shader)
  try {
    await fs.access(filePath);
    return res.json({ message: 'Shader already exists', id: id });
  } catch {}

  await fs.writeFile(filePath, data.content, 'utf-8');
  res.json({ message: 'Shader saved', id: id });
});

/**
 * HEAD /api/shaders/:id -- check if shader exists
 */
router.head('/:id', async (req, res) => {
  var filePath = path.join(getShaderDir(), req.params.id + '.shader');
  try {
    await fs.access(filePath);
    res.status(200).end();
  } catch {
    res.status(404).end();
  }
});

module.exports = router;
