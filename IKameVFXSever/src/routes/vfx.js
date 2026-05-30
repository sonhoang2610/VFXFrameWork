/**
 * VFX Routes
 *
 * Handles all VFX package CRUD operations: upload, list, download, delete.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { generateId } = require('../utils/id');
const catalog = require('../services/catalog');
const storage = require('../services/storage');

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
  { name: 'package', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 },
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

  if (!req.files || !req.files.package || !req.files.package[0]) {
    return res.status(400).json({ error: 'Missing package file' });
  }

  const packageFile = req.files.package[0];
  const thumbnailFile = req.files.thumbnail ? req.files.thumbnail[0] : null;

  const id = generateId(category, name);
  const packageDir = storage.getPackageDir(category, name);

  // Save package zip
  const packagePath = path.join(packageDir, 'package.zip');
  await storage.saveFile(packagePath, packageFile.buffer);

  // Save thumbnail if provided
  let thumbnailRelPath = null;
  if (thumbnailFile) {
    const ext = path.extname(thumbnailFile.originalname) || '.gif';
    const thumbnailFilename = `thumbnail${ext}`;
    const thumbnailAbsPath = path.join(packageDir, thumbnailFilename);
    await storage.saveFile(thumbnailAbsPath, thumbnailFile.buffer);
    thumbnailRelPath = path.join(category, name, thumbnailFilename).replace(/\\/g, '/');
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
  const fileSize = packageFile.buffer.length;
  const catalogItem = {
    id,
    name,
    category,
    uploadedBy: uploadedBy || 'unknown',
    uploadedAt: metaJson.uploadedAt,
    fileSize,
    thumbnailPath: thumbnailRelPath,
    packagePath: path.join(category, name, 'package.zip').replace(/\\/g, '/'),
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

    try {
      const id = generateId(category, name);
      const packageDir = storage.getPackageDir(category, name);

      // Save package zip
      await storage.saveFile(path.join(packageDir, 'package.zip'), packageFile.buffer);

      // Save thumbnail if provided
      let thumbnailRelPath = null;
      if (thumbnailFile) {
        const ext = path.extname(thumbnailFile.originalname) || '.gif';
        const thumbnailFilename = `thumbnail${ext}`;
        await storage.saveFile(path.join(packageDir, thumbnailFilename), thumbnailFile.buffer);
        thumbnailRelPath = path.join(category, name, thumbnailFilename).replace(/\\/g, '/');
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

  const filePath = path.join(storage.getStorageRoot(), item.packagePath);
  const exists = await storage.fileExists(filePath);
  if (!exists) {
    return res.status(404).json({ error: 'Package file not found on disk' });
  }

  const filename = `${item.name}.zip`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/zip');

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
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
  const contentType = ext === '.png' ? 'image/png' : 'image/gif';
  res.setHeader('Content-Type', contentType);

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
});

/**
 * DELETE /api/vfx/:id
 * Delete a VFX package and its files.
 */
router.delete('/:id', async (req, res) => {
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

module.exports = router;
