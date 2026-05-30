/**
 * Storage Service
 *
 * File storage helpers for creating directories, saving files, and deleting packages.
 * All paths are relative to the configured STORAGE_PATH.
 */

const fs = require('fs');
const path = require('path');

/**
 * Get the absolute storage root path.
 * @returns {string}
 */
function getStorageRoot() {
  return path.resolve(process.env.STORAGE_PATH || './storage');
}

/**
 * Ensure a directory exists, creating it recursively if needed.
 * @param {string} dirPath - Absolute path to the directory
 */
async function ensureDir(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

/**
 * Build the package directory path for a given category and name.
 * e.g., category "RPG/Hit", name "BloodExplosion_IKAME" → "<storage>/RPG/Hit/BloodExplosion_IKAME/"
 *
 * @param {string} category - e.g., "RPG/Hit"
 * @param {string} name - e.g., "BloodExplosion_IKAME"
 * @returns {string} Absolute path to the package directory
 */
function getPackageDir(category, name) {
  const root = getStorageRoot();
  return path.join(root, category, name);
}

/**
 * Save a buffer to a file, creating parent directories as needed.
 *
 * @param {string} filePath - Absolute path to save the file
 * @param {Buffer} buffer - File contents
 */
async function saveFile(filePath, buffer) {
  await ensureDir(path.dirname(filePath));
  await fs.promises.writeFile(filePath, buffer);
}

/**
 * Delete a package directory and all its contents.
 *
 * @param {string} dirPath - Absolute path to the package directory
 */
async function deletePackageDir(dirPath) {
  await fs.promises.rm(dirPath, { recursive: true, force: true });
}

/**
 * Check whether a file exists.
 *
 * @param {string} filePath - Absolute path to check
 * @returns {boolean}
 */
async function fileExists(filePath) {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the size in bytes of a file.
 *
 * @param {string} filePath - Absolute path
 * @returns {number} File size in bytes
 */
async function getFileSize(filePath) {
  const stat = await fs.promises.stat(filePath);
  return stat.size;
}

module.exports = {
  getStorageRoot,
  ensureDir,
  getPackageDir,
  saveFile,
  deletePackageDir,
  fileExists,
  getFileSize,
};
