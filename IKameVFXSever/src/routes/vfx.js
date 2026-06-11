/**
 * VFX Routes
 *
 * Handles all VFX package CRUD operations: upload, list, download, delete.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { createReadStream } = require('fs');
const multer = require('multer');
const { Readable } = require('stream');
const { generateId } = require('../utils/id');
const catalog = require('../services/catalog');
const storage = require('../services/storage');
const { authenticate, authenticateAdmin } = require('../middleware/auth');

const router = express.Router();

// Configure multer with memory storage for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB per file
  },
});

// Field configuration for single package upload
const singleUploadFields = upload.fields([
  { name: 'package', maxCount: 1 },     // optional zip (legacy)
  { name: 'thumbnail', maxCount: 1 },
  { name: 'bundle', maxCount: 1 },      // optional AssetBundle
]);

// Field configuration for batch upload (multiple packages)
const batchUploadFields = upload.any();

const DEFAULT_PAGE_SIZE = 50;

/**
 * POST /api/vfx/upload
 * Upload a single VFX package.
 *
 * Multipart form fields:
 *   - package (file): The zip archive
 *   - thumbnail (file): GIF or PNG thumbnail
 *   - metadata (text): JSON string with { name, category, dependencies[], particleCount, uploadedBy }
 */
router.post('/upload', singleUploadFields, async (req, res) => {
  // Validate required fields
  if (!req.body.metadata) {
    return res.status(400).json({ error: 'Missing metadata field' });
  }

  let metadata;
  try {
    metadata = JSON.parse(req.body.metadata);
  } catch {
    return res.status(400).json({ error: 'Invalid metadata JSON' });
  }

  const { name, category, dependencies, particleCount, uploadedBy } = metadata;

  if (!name || !category) {
    return res.status(400).json({ error: 'Metadata must include name and category' });
  }

  const packageFile = (req.files && req.files.package && req.files.package[0]) ? req.files.package[0] : null;
  const thumbnailFile = (req.files && req.files.thumbnail) ? req.files.thumbnail[0] : null;

  const id = generateId(category, name);
  const packageDir = storage.getPackageDir(category, name);

  // Save package zip (optional — new flow uploads assets separately)
  if (packageFile) {
    const packagePath = path.join(packageDir, 'package.zip');
    await storage.saveFile(packagePath, packageFile.buffer);
  }

  // Save particleJson if provided (new flow)
  if (req.body.particleJson) {
    const jsonPath = path.join(packageDir, name + '.particle.json');
    await storage.saveFile(jsonPath, Buffer.from(req.body.particleJson, 'utf-8'));
  }

  // Save thumbnail if provided — remove old thumbnail with different ext first
  let thumbnailRelPath = null;
  if (thumbnailFile) {
    console.log('[VFX Upload] thumbnail originalname:', thumbnailFile.originalname, 'mimetype:', thumbnailFile.mimetype, 'size:', thumbnailFile.size);
    const ext = path.extname(thumbnailFile.originalname) || '.gif';
    const thumbnailFilename = `thumbnail${ext}`;
    const thumbnailAbsPath = path.join(packageDir, thumbnailFilename);
    for (const oldExt of ['.gif', '.webm', '.png']) {
      if (oldExt === ext) continue;
      const oldPath = path.join(packageDir, `thumbnail${oldExt}`);
      try { await fs.promises.unlink(oldPath); } catch {}
    }
    await storage.saveFile(thumbnailAbsPath, thumbnailFile.buffer);
    thumbnailRelPath = path.join(category, name, thumbnailFilename).replace(/\\/g, '/');
  }

  // Save AssetBundle if provided
  let bundleRelPath = null;
  if (req.files['bundle'] && req.files['bundle'][0]) {
    const bundleBuffer = req.files['bundle'][0].buffer;
    const bundleFileName = 'bundle.assetbundle';
    await storage.saveFile(path.join(packageDir, bundleFileName), bundleBuffer);
    bundleRelPath = path.join(category, name, bundleFileName).replace(/\\/g, '/');
  }

  // Save meta.json
  const metaJson = {
    id,
    name,
    category,
    uploadedBy: uploadedBy || 'unknown',
    uploadedAt: new Date().toISOString(),
    dependencies: dependencies || [],
    particleCount: particleCount || 0,
  };
  await storage.saveFile(
    path.join(packageDir, 'meta.json'),
    Buffer.from(JSON.stringify(metaJson, null, 2), 'utf-8')
  );

  // Build catalog item
  const fileSize = packageFile ? packageFile.buffer.length : (req.body.particleJson ? req.body.particleJson.length : 0);
  const catalogItem = {
    id,
    name,
    category,
    uploadedBy: uploadedBy || 'unknown',
    uploadedAt: metaJson.uploadedAt,
    fileSize,
    thumbnailPath: thumbnailRelPath,
    bundlePath: bundleRelPath,
    packagePath: packageFile ? path.join(category, name, 'package.zip').replace(/\\/g, '/') : null,
    dependencies: dependencies || [],
    particleCount: particleCount || 0,
  };

  await catalog.addItem(catalogItem);

  res.status(201).json({
    message: 'VFX package uploaded successfully',
    item: catalogItem,
  });
});

/**
 * POST /api/vfx/upload-batch
 * Batch upload - accepts multiple packages in one request.
 *
 * Each package is identified by indexed field names:
 *   - package_0, package_1, ... (zip files)
 *   - thumbnail_0, thumbnail_1, ... (thumbnail files)
 *   - metadata (text): JSON string with array of metadata objects
 *
 * Alternatively, the body may contain a `packages` field as a JSON string
 * with an array of metadata objects matching the files by index.
 */
router.post('/upload-batch', batchUploadFields, async (req, res) => {
  if (!req.body.metadata) {
    return res.status(400).json({ error: 'Missing metadata field' });
  }

  let metadataList;
  try {
    metadataList = JSON.parse(req.body.metadata);
  } catch {
    return res.status(400).json({ error: 'Invalid metadata JSON' });
  }

  if (!Array.isArray(metadataList) || metadataList.length === 0) {
    return res.status(400).json({ error: 'metadata must be a non-empty array' });
  }

  // Organize uploaded files by field name
  const filesByField = {};
  if (req.files) {
    for (const file of req.files) {
      filesByField[file.fieldname] = file;
    }
  }

  const results = [];
  const errors = [];

  for (let i = 0; i < metadataList.length; i++) {
    const metadata = metadataList[i];
    const { name, category, dependencies, particleCount, uploadedBy } = metadata;

    if (!name || !category) {
      errors.push({ index: i, error: 'Missing name or category' });
      continue;
    }

    const packageFile = filesByField[`package_${i}`] || filesByField['package'];
    if (!packageFile) {
      errors.push({ index: i, error: `Missing package file (expected field: package_${i})` });
      continue;
    }

    const thumbnailFile = filesByField[`thumbnail_${i}`] || null;
    const bundleFile = filesByField[`bundle_${i}`] || null;

    try {
      const id = generateId(category, name);
      const packageDir = storage.getPackageDir(category, name);

      // Save package zip
      await storage.saveFile(path.join(packageDir, 'package.zip'), packageFile.buffer);

      // Save thumbnail if provided — remove old thumbnail with different ext first
      let thumbnailRelPath = null;
      if (thumbnailFile) {
        const ext = path.extname(thumbnailFile.originalname) || '.gif';
        const thumbnailFilename = `thumbnail${ext}`;
        for (const oldExt of ['.gif', '.webm', '.png']) {
          if (oldExt === ext) continue;
          const oldPath = path.join(packageDir, `thumbnail${oldExt}`);
          try { await fs.promises.unlink(oldPath); } catch {}
        }
        await storage.saveFile(path.join(packageDir, thumbnailFilename), thumbnailFile.buffer);
        thumbnailRelPath = path.join(category, name, thumbnailFilename).replace(/\\/g, '/');
      }

      // Save AssetBundle if provided
      let bundleRelPath = null;
      if (bundleFile) {
        const bundleFileName = 'bundle.assetbundle';
        await storage.saveFile(path.join(packageDir, bundleFileName), bundleFile.buffer);
        bundleRelPath = path.join(category, name, bundleFileName).replace(/\\/g, '/');
      }

      // Save meta.json
      const metaJson = {
        id,
        name,
        category,
        uploadedBy: uploadedBy || 'unknown',
        uploadedAt: new Date().toISOString(),
        dependencies: dependencies || [],
        particleCount: particleCount || 0,
      };
      await storage.saveFile(
        path.join(packageDir, 'meta.json'),
        Buffer.from(JSON.stringify(metaJson, null, 2), 'utf-8')
      );

      // Build catalog item
      const catalogItem = {
        id,
        name,
        category,
        uploadedBy: uploadedBy || 'unknown',
        uploadedAt: metaJson.uploadedAt,
        fileSize: packageFile.buffer.length,
        thumbnailPath: thumbnailRelPath,
        bundlePath: bundleRelPath,
        packagePath: path.join(category, name, 'package.zip').replace(/\\/g, '/'),
        dependencies: dependencies || [],
        particleCount: particleCount || 0,
      };

      await catalog.addItem(catalogItem);
      results.push(catalogItem);
    } catch (err) {
      errors.push({ index: i, error: err.message });
    }
  }

  const status = errors.length === 0 ? 201 : errors.length === metadataList.length ? 400 : 207;
  res.status(status).json({
    message: `Batch upload completed: ${results.length} succeeded, ${errors.length} failed`,
    items: results,
    errors,
  });
});

/**
 * GET /api/vfx/catalog
 * Get the full catalog JSON.
 */
router.get('/catalog', async (req, res) => {
  const data = await catalog.readCatalog();
  res.json(data);
});

/**
 * GET /api/vfx/list?category=X&page=N&pageSize=M
 * List VFX items with pagination and optional category filter.
 */
router.get('/list', async (req, res) => {
  const { category } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.max(1, parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE);

  const data = await catalog.readCatalog();
  let items = data.items;

  // Filter by category if provided
  if (category) {
    items = items.filter((item) => item.category === category);
  }

  const totalItems = items.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const start = (page - 1) * pageSize;
  const paginatedItems = items.slice(start, start + pageSize);

  res.json({
    items: paginatedItems,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
    },
  });
});

/**
 * GET /api/vfx/categories
 * List all unique categories.
 */
router.get('/categories', async (req, res) => {
  const data = await catalog.readCatalog();
  res.json({ categories: data.categories });
});

/**
 * GET /api/vfx/:id/download
 * Download the VFX zip package.
 */
router.get('/:id/download', async (req, res) => {
  const item = await catalog.findItem(req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'VFX package not found' });
  }

  // Legacy: serve existing zip if available
  if (item.packagePath) {
    const filePath = path.join(storage.getStorageRoot(), item.packagePath);
    if (await storage.fileExists(filePath)) {
      res.setHeader('Content-Disposition', 'attachment; filename="' + item.name + '.zip"');
      res.setHeader('Content-Type', 'application/zip');
      return fs.createReadStream(filePath).pipe(res);
    }
  }

  // New flow: build zip on-the-fly from particle.json + assets
  try {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    const packageDir = storage.getPackageDir(item.category, item.name);
    const assetsDir = path.join(storage.getStorageRoot(), 'assets');

    // Add particle.json
    var dirFiles = await fs.promises.readdir(packageDir).catch(function() { return []; });
    for (var i = 0; i < dirFiles.length; i++) {
      if (dirFiles[i].endsWith('.particle.json')) {
        zip.addLocalFile(path.join(packageDir, dirFiles[i]));
        break;
      }
    }

    // Add thumbnail
    for (var j = 0; j < dirFiles.length; j++) {
      if (dirFiles[j].startsWith('thumbnail')) {
        zip.addLocalFile(path.join(packageDir, dirFiles[j]));
        break;
      }
    }

    // Read particle.json to find referenced asset GUIDs
    var particleJson = null;
    for (var k = 0; k < dirFiles.length; k++) {
      if (dirFiles[k].endsWith('.particle.json')) {
        particleJson = JSON.parse(await fs.promises.readFile(path.join(packageDir, dirFiles[k]), 'utf-8'));
        break;
      }
    }

    if (particleJson) {
      // Collect all GUIDs from textures section
      var guids = new Set();
      if (particleJson.textures) {
        Object.keys(particleJson.textures).forEach(function(g) { guids.add(g); });
      }
      // Collect materialId, meshId from nodes
      function collectGuids(node) {
        if (!node) return;
        var ps = node.particleSystem;
        if (ps) {
          if (ps.materialId) guids.add(ps.materialId);
          if (ps.mainTexture) guids.add(ps.mainTexture);
          var rd = ps.rendererModule;
          if (rd && rd.meshId) guids.add(rd.meshId);
        }
        if (node.children) node.children.forEach(collectGuids);
      }
      collectGuids(particleJson.root);

      // Add each asset to zip
      for (var guid of guids) {
        if (!guid) continue;
        var binPath = path.join(assetsDir, guid + '.bin');
        var metaPath = path.join(assetsDir, guid + '.meta.json');
        try {
          await fs.promises.access(binPath);
          var metaData = JSON.parse(await fs.promises.readFile(metaPath, 'utf-8').catch(function() { return '{}'; }));
          var ext = metaData.type === 'texture' ? '.png' : metaData.type === 'shader' ? '.shader' : '.json';
          var assetName = (metaData.name || guid) + ext;
          zip.addLocalFile(binPath, 'assets', assetName);
        } catch(e) {}
        try {
          await fs.promises.access(metaPath);
          zip.addLocalFile(metaPath, 'assets', guid + '.meta.json');
        } catch(e) {}
      }
    }

    var zipBuffer = zip.toBuffer();
    res.setHeader('Content-Disposition', 'attachment; filename="' + item.name + '.zip"');
    res.setHeader('Content-Type', 'application/zip');
    res.send(zipBuffer);
  } catch (err) {
    console.error('Download zip build error:', err);
    res.status(500).json({ error: 'Failed to build download package' });
  }
});

/**
 * GET /api/vfx/:id/thumbnail
 * Get the GIF/PNG thumbnail for a VFX package.
 */
router.get('/:id/thumbnail', async (req, res) => {
  const item = await catalog.findItem(req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'VFX package not found' });
  }

  if (!item.thumbnailPath) {
    return res.status(404).json({ error: 'No thumbnail available for this package' });
  }

  const filePath = path.join(storage.getStorageRoot(), item.thumbnailPath);
  const exists = await storage.fileExists(filePath);
  if (!exists) {
    return res.status(404).json({ error: 'Thumbnail file not found on disk' });
  }

  const ext = path.extname(item.thumbnailPath).toLowerCase();
  const contentType = ext === '.png' ? 'image/png' : ext === '.webm' ? 'video/webm' : ext === '.mp4' ? 'video/mp4' : 'image/gif';
  res.setHeader('Content-Type', contentType);

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
});

/**
 * GET /api/vfx/:id/bundle
 * Download the AssetBundle for WebGL preview.
 */
router.get('/:id/bundle', async (req, res) => {
  const item = await catalog.findItem(req.params.id);
  if (!item || !item.bundlePath) {
    return res.status(404).json({ error: 'Bundle not found' });
  }

  const bundleFile = path.join(storage.getStorageRoot(), item.bundlePath);
  const exists = await storage.fileExists(bundleFile);
  if (!exists) {
    return res.status(404).json({ error: 'Bundle file not found on disk' });
  }

  res.set('Content-Type', 'application/octet-stream');
  res.set('Access-Control-Allow-Origin', '*');
  res.sendFile(path.resolve(bundleFile));
});

/**
 * GET /api/vfx/:id/particle-json
 * Extract and serve the particle.json from the package zip.
 */
router.get('/:id/particle-json', async (req, res) => {
  const item = await catalog.findItem(req.params.id);
  if (!item) return res.status(404).json({ error: 'VFX package not found' });

  const packageDir = storage.getPackageDir(item.category, item.name);

  // Try standalone particle.json first (new flow)
  const jsonFiles = await fs.promises.readdir(packageDir).catch(() => []);
  var jsonFile = null;
  for (var i = 0; i < jsonFiles.length; i++) {
    if (jsonFiles[i].endsWith('.particle.json')) { jsonFile = jsonFiles[i]; break; }
  }

  if (jsonFile) {
    res.set('Content-Type', 'application/json');
    res.set('Access-Control-Allow-Origin', '*');
    var data = await fs.promises.readFile(path.join(packageDir, jsonFile));
    return res.send(data);
  }

  // Fallback: extract from zip (legacy)
  if (item.packagePath) {
    var zipPath = path.join(storage.getStorageRoot(), item.packagePath);
    if (await storage.fileExists(zipPath)) {
      try {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(zipPath);
        const entries = zip.getEntries();
        for (var j = 0; j < entries.length; j++) {
          if (entries[j].entryName.endsWith('.particle.json')) {
            res.set('Content-Type', 'application/json');
            res.set('Access-Control-Allow-Origin', '*');
            return res.send(entries[j].getData());
          }
        }
      } catch (err) {
        return res.status(500).json({ error: 'Failed to read zip: ' + err.message });
      }
    }
  }

  res.status(404).json({ error: 'No particle.json found' });
});

/**
 * GET /api/vfx/:id/texture/:filename
 * Extract and serve a texture file from the package zip.
 */
router.get('/:id/texture/:filename', async (req, res) => {
  const item = await catalog.findItem(req.params.id);
  if (!item) return res.status(404).json({ error: 'VFX package not found' });

  const zipPath = path.join(storage.getStorageRoot(), item.packagePath);
  if (!await storage.fileExists(zipPath)) return res.status(404).json({ error: 'Package zip not found' });

  var target = req.params.filename;
  try {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    var texEntry = null;
    for (var i = 0; i < entries.length; i++) {
      var name = entries[i].entryName.split('/').pop();
      if (name === target) {
        texEntry = entries[i];
        break;
      }
    }
    if (!texEntry) return res.status(404).json({ error: 'Texture not found in package: ' + target });

    var ext = path.extname(target).toLowerCase();
    var contentType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/octet-stream';
    res.set('Content-Type', contentType);
    res.set('Access-Control-Allow-Origin', '*');
    res.send(texEntry.getData());
  } catch (err) {
    res.status(500).json({ error: 'Failed to read zip: ' + err.message });
  }
});

/**
 * DELETE /api/vfx/:id
 * Delete a VFX package and its files.
 */
router.delete('/:id', authenticate, async (req, res) => {
  const removed = await catalog.removeItem(req.params.id);
  if (!removed) {
    return res.status(404).json({ error: 'VFX package not found' });
  }

  // Delete files from disk
  const packageDir = storage.getPackageDir(removed.category, removed.name);
  await storage.deletePackageDir(packageDir);

  res.json({
    message: 'VFX package deleted successfully',
    id: removed.id,
  });
});

/**
 * PATCH /api/vfx/:id
 * Update VFX item metadata (admin only).
 * Body: { name, category, featured }
 */
router.patch('/:id', authenticateAdmin, async (req, res) => {
  const { name, category, featured } = req.body;
  const data = await catalog.readCatalog();
  const item = data.items.find(i => i.id === req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'VFX package not found' });
  }

  if (name !== undefined) item.name = name;
  if (category !== undefined) item.category = category;
  if (featured !== undefined) item.featured = !!featured;

  data.categories = [...new Set(data.items.map(i => i.category))].sort();
  data.lastUpdated = new Date().toISOString();
  await catalog.writeCatalog(data);

  res.json({ message: 'Updated', item });
});

/**
 * DELETE /api/vfx/admin/by-category/:category
 * Delete all VFX in a category (admin only). Category is URL-encoded.
 */
router.delete('/admin/by-category/:category', authenticateAdmin, async (req, res) => {
  const cat = decodeURIComponent(req.params.category);
  const data = await catalog.readCatalog();
  const toRemove = data.items.filter(i => i.category === cat || i.category.startsWith(cat + '/'));

  if (toRemove.length === 0) {
    return res.status(404).json({ error: 'No items found in category: ' + cat });
  }

  for (const item of toRemove) {
    const dir = storage.getPackageDir(item.category, item.name);
    await storage.deletePackageDir(dir);
  }

  const removeIds = new Set(toRemove.map(i => i.id));
  data.items = data.items.filter(i => !removeIds.has(i.id));
  data.categories = [...new Set(data.items.map(i => i.category))].sort();
  data.lastUpdated = new Date().toISOString();
  await catalog.writeCatalog(data);

  res.json({ message: 'Deleted ' + toRemove.length + ' items from ' + cat, count: toRemove.length });
});

/**
 * DELETE /api/vfx/admin/all
 * Delete ALL VFX packages (admin only).
 */
router.delete('/admin/all', authenticateAdmin, async (req, res) => {
  const data = await catalog.readCatalog();
  const count = data.items.length;

  for (const item of data.items) {
    const dir = storage.getPackageDir(item.category, item.name);
    await storage.deletePackageDir(dir);
  }

  data.items = [];
  data.categories = [];
  data.lastUpdated = new Date().toISOString();
  await catalog.writeCatalog(data);

  res.json({ message: 'Deleted all ' + count + ' items', count });
});

/**
 * POST /api/vfx/admin/bulk-delete
 * Delete multiple VFX by IDs (admin only).
 * Body: { ids: ["id1", "id2", ...] }
 */
router.post('/admin/bulk-delete', authenticateAdmin, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array is required' });
  }

  const data = await catalog.readCatalog();
  const idSet = new Set(ids);
  const toRemove = data.items.filter(i => idSet.has(i.id));

  for (const item of toRemove) {
    const dir = storage.getPackageDir(item.category, item.name);
    await storage.deletePackageDir(dir);
  }

  data.items = data.items.filter(i => !idSet.has(i.id));
  data.categories = [...new Set(data.items.map(i => i.category))].sort();
  data.lastUpdated = new Date().toISOString();
  await catalog.writeCatalog(data);

  res.json({ message: 'Deleted ' + toRemove.length + ' items', count: toRemove.length });
});

module.exports = router;
