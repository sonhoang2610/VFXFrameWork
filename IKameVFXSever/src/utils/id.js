/**
 * ID Utility
 *
 * Generates deterministic IDs from category and name.
 * e.g., category "RPG/Hit" + name "BloodExplosion" → "rpg-hit-bloodexplosion"
 */

/**
 * Generate a unique ID from category and name.
 * Replaces slashes and spaces with hyphens, lowercases everything,
 * and strips non-alphanumeric characters (except hyphens).
 *
 * @param {string} category - e.g., "RPG/Hit"
 * @param {string} name - e.g., "BloodExplosion"
 * @returns {string} e.g., "rpg-hit-bloodexplosion"
 */
function generateId(category, name) {
  const raw = `${category}/${name}`;
  return raw
    .toLowerCase()
    .replace(/[\s/\\]+/g, '-')   // Replace slashes, backslashes, whitespace with hyphens
    .replace(/[^a-z0-9-]/g, '')  // Strip anything that isn't alphanumeric or hyphen
    .replace(/-+/g, '-')         // Collapse multiple consecutive hyphens
    .replace(/^-|-$/g, '');      // Trim leading/trailing hyphens
}

module.exports = { generateId };
