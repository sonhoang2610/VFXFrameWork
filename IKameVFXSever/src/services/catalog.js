/**
 * Catalog Service
 *
 * Read/write catalog.json with file-based locking to prevent concurrent write corruption.
 * The lock file (catalog.lock) is checked before writes. If a lock exists and is older
 * than 30 seconds, it is considered stale and force-released.
 */

const fs = require('fs');
const path = require('path');
const { getStorageRoot } = require('./storage');

const CATALOG_FILENAME = 'catalog.json';
const LOCK_FILENAME = 'catalog.lock';
const LOCK_STALE_MS = 30_000; // 30 seconds

/**
 * Get the path to catalog.json.
 * @returns {string}
 */
function getCatalogPath() {
  return path.join(getStorageRoot(), CATALOG_FILENAME);
}

/**
 * Get the path to the lock file.
 * @returns {string}
 */
function getLockPath() {
  return path.join(getStorageRoot(), LOCK_FILENAME);
}

/**
 * Create an empty catalog structure.
 * @returns {object}
 */
function createEmptyCatalog() {
  return {
    version: 1,
    lastUpdated: new Date().toISOString(),
    categories: [],
    items: [],
  };
}

/**
 * Read the catalog from disk. If it doesn't exist, return an empty catalog.
 * @returns {Promise<object>}
 */
async function readCatalog() {
  const catalogPath = getCatalogPath();
  try {
    const data = await fs.promises.readFile(catalogPath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return createEmptyCatalog();
    }
    throw err;
  }
}

/**
 * Acquire a file-based lock for catalog writes.
 * If the lock file exists and is older than LOCK_STALE_MS, it is force-released.
 *
 * @param {number} [retries=10] - Number of retry attempts
 * @param {number} [retryDelayMs=200] - Delay between retries in ms
 * @throws {Error} If the lock cannot be acquired after all retries
 */
async function acquireLock(retries = 10, retryDelayMs = 200) {
  const lockPath = getLockPath();

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // wx flag: create exclusively - fails if file already exists
      await fs.promises.writeFile(lockPath, String(Date.now()), { flag: 'wx' });
      return; // Lock acquired
    } catch (err) {
      if (err.code === 'EEXIST') {
        // Lock file exists - check if stale
        try {
          const stat = await fs.promises.stat(lockPath);
          const age = Date.now() - stat.mtimeMs;
          if (age > LOCK_STALE_MS) {
            // Stale lock - force release and retry immediately
            await releaseLock();
            continue;
          }
        } catch {
          // Lock file may have been removed between our check - retry
          continue;
        }

        // Lock is held by another process - wait and retry
        if (attempt < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      } else {
        throw err;
      }
    }
  }

  throw new Error('Failed to acquire catalog lock after maximum retries');
}

/**
 * Release the catalog lock.
 */
async function releaseLock() {
  const lockPath = getLockPath();
  try {
    await fs.promises.unlink(lockPath);
  } catch (err) {
    // Ignore if already removed
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

/**
 * Write the catalog to disk with file-based locking.
 * Acquires the lock, writes the file, then releases the lock.
 *
 * @param {object} catalog - The catalog object to persist
 */
async function writeCatalog(catalog) {
  await acquireLock();
  try {
    catalog.lastUpdated = new Date().toISOString();
    const catalogPath = getCatalogPath();
    await fs.promises.writeFile(catalogPath, JSON.stringify(catalog, null, 2), 'utf-8');
  } finally {
    await releaseLock();
  }
}

/**
 * Add an item to the catalog. Updates the categories list as well.
 *
 * @param {object} item - Catalog item to add
 * @returns {Promise<object>} The updated catalog
 */
async function addItem(item) {
  await acquireLock();
  try {
    const catalog = await readCatalog();

    // Remove existing item with same ID (update/overwrite scenario)
    catalog.items = catalog.items.filter((i) => i.id !== item.id);
    catalog.items.push(item);

    // Rebuild categories list from all items
    catalog.categories = [...new Set(catalog.items.map((i) => i.category))].sort();
    catalog.lastUpdated = new Date().toISOString();

    const catalogPath = getCatalogPath();
    await fs.promises.writeFile(catalogPath, JSON.stringify(catalog, null, 2), 'utf-8');

    return catalog;
  } finally {
    await releaseLock();
  }
}

/**
 * Remove an item from the catalog by ID.
 *
 * @param {string} id - The item ID to remove
 * @returns {Promise<object|null>} The removed item, or null if not found
 */
async function removeItem(id) {
  await acquireLock();
  try {
    const catalog = await readCatalog();
    const index = catalog.items.findIndex((i) => i.id === id);
    if (index === -1) {
      return null;
    }

    const [removed] = catalog.items.splice(index, 1);

    // Rebuild categories list
    catalog.categories = [...new Set(catalog.items.map((i) => i.category))].sort();
    catalog.lastUpdated = new Date().toISOString();

    const catalogPath = getCatalogPath();
    await fs.promises.writeFile(catalogPath, JSON.stringify(catalog, null, 2), 'utf-8');

    return removed;
  } finally {
    await releaseLock();
  }
}

/**
 * Find an item in the catalog by ID.
 *
 * @param {string} id - The item ID to find
 * @returns {Promise<object|null>} The item, or null if not found
 */
async function findItem(id) {
  const catalog = await readCatalog();
  return catalog.items.find((i) => i.id === id) || null;
}

module.exports = {
  readCatalog,
  writeCatalog,
  addItem,
  removeItem,
  findItem,
  getCatalogPath,
};
