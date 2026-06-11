/**
 * Mesh Routes — shared mesh library
 *
 * Meshes are stored as JSON files in storage/meshes/{id}.json
 * Multiple VFX can reference the same mesh by ID.
 */

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { getStorageRoot, ensureDir } = require('../services/storage');

const router = express.Router();

function getMeshDir() {
  return path.join(getStorageRoot(), 'meshes');
}

/**
 * GET /api/meshes — list all available meshes
 */
router.get('/', async (req, res) => {
  var dir = getMeshDir();
  try {
    await ensureDir(dir);
    var files = await fs.readdir(dir);
    var meshes = [];
    for (var i = 0; i < files.length; i++) {
      if (!files[i].endsWith('.json')) continue;
      var id = files[i].replace('.json', '');
      try {
        var content = JSON.parse(await fs.readFile(path.join(dir, files[i]), 'utf-8'));
        meshes.push({ id: id, name: content.name || id });
      } catch (e) {
        meshes.push({ id: id, name: id });
      }
    }
    res.json({ meshes: meshes });
  } catch (err) {
    res.json({ meshes: [] });
  }
});

/**
 * GET /api/meshes/:id — get mesh data by ID
 */
router.get('/:id', async (req, res) => {
  var filePath = path.join(getMeshDir(), req.params.id + '.json');
  try {
    var data = await fs.readFile(filePath, 'utf-8');
    res.set('Content-Type', 'application/json');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(data);
  } catch (err) {
    res.status(404).json({ error: 'Mesh not found: ' + req.params.id });
  }
});

/**
 * POST /api/meshes — upload mesh data, returns hash-based ID
 * Body: { name: "MyMesh", vertices: [[x,y,z],...], triangles: [int,...], normals: [[x,y,z],...], uvs: [[u,v],...] }
 * ID is computed from hash of vertices+triangles — same mesh data = same ID
 */
router.post('/', async (req, res) => {
  var dir = getMeshDir();
  await ensureDir(dir);
  var data = req.body;

  if (!data || !data.vertices || !data.triangles) {
    return res.status(400).json({ error: 'vertices and triangles are required' });
  }

  // Use ID from client (computed by Unity exporter) or generate from hash
  var id = data.id;
  if (!id) {
    var crypto = require('crypto');
    var hashInput = JSON.stringify(data.vertices) + JSON.stringify(data.triangles);
    id = 'mesh_' + crypto.createHash('md5').update(hashInput).digest('hex').substring(0, 12);
    data.id = id;
  }

  var filePath = path.join(dir, id + '.json');

  // Always overwrite — upsert behavior
  data.id = id;
  await fs.writeFile(filePath, JSON.stringify(data), 'utf-8');
  res.json({ message: 'Mesh saved', id: id });
});

/**
 * HEAD /api/meshes/:id — check if mesh exists
 */
router.head('/:id', async (req, res) => {
  var filePath = path.join(getMeshDir(), req.params.id + '.json');
  try {
    await fs.access(filePath);
    res.status(200).end();
  } catch {
    res.status(404).end();
  }
});

/**
 * DELETE /api/meshes/:id
 */
router.delete('/:id', async (req, res) => {
  var filePath = path.join(getMeshDir(), req.params.id + '.json');
  try {
    await fs.unlink(filePath);
    res.json({ message: 'Deleted', id: req.params.id });
  } catch {
    res.status(404).json({ error: 'Mesh not found' });
  }
});

module.exports = router;
