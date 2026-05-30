/**
 * Catalog Manager
 *
 * Fetches the VFX catalog from the server and provides filtering/search
 * capabilities for the frontend grid.
 */

/* exported CatalogManager */
const CatalogManager = {
  /** @type {object|null} Full catalog response from server */
  catalog: null,

  /** @type {object[]} Items after applying category + search filters */
  filteredItems: [],

  /** @type {string|null} Active category filter (null = show all) */
  currentCategory: null,

  /** @type {string} Current search query */
  searchQuery: '',

  /**
   * Fetch the full catalog from the server.
   * @returns {Promise<object>} The catalog data
   */
  async fetchCatalog() {
    try {
      const response = await fetch('/api/vfx/catalog');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      this.catalog = await response.json();
      this.applyFilters();
      return this.catalog;
    } catch (err) {
      console.error('Failed to fetch catalog:', err);
      this.catalog = { version: 1, lastUpdated: null, categories: [], items: [] };
      this.filteredItems = [];
      throw err;
    }
  },

  /**
   * Apply current category and search filters to produce filteredItems.
   */
  applyFilters() {
    if (!this.catalog || !this.catalog.items) {
      this.filteredItems = [];
      return;
    }

    let items = this.catalog.items;

    // Filter by category (match exact or prefix for parent categories)
    if (this.currentCategory) {
      items = items.filter(function (item) {
        return item.category === CatalogManager.currentCategory ||
               item.category.startsWith(CatalogManager.currentCategory + '/');
      });
    }

    // Filter by search query (case-insensitive substring match on name)
    if (this.searchQuery) {
      var query = this.searchQuery.toLowerCase();
      items = items.filter(function (item) {
        return item.name.toLowerCase().indexOf(query) !== -1;
      });
    }

    this.filteredItems = items;
  },

  /**
   * Set the active category filter and re-apply filters.
   * @param {string|null} category - Category path or null for all
   */
  setCategory(category) {
    this.currentCategory = category;
    this.applyFilters();
  },

  /**
   * Set the search query and re-apply filters.
   * @param {string} query
   */
  setSearch(query) {
    this.searchQuery = query.trim();
    this.applyFilters();
  },

  /**
   * Get the current filtered items.
   * @returns {object[]}
   */
  getItems() {
    return this.filteredItems;
  },

  /**
   * Get all categories from the catalog.
   * @returns {string[]}
   */
  getCategories() {
    if (!this.catalog || !this.catalog.categories) {
      return [];
    }
    return this.catalog.categories;
  },

  /**
   * Find a single item by its ID.
   * @param {string} id
   * @returns {object|null}
   */
  getItem(id) {
    if (!this.catalog || !this.catalog.items) {
      return null;
    }
    return this.catalog.items.find(function (item) { return item.id === id; }) || null;
  },

  /**
   * Format byte count into a human-readable size string.
   * @param {number} bytes
   * @returns {string}
   */
  formatSize(bytes) {
    if (bytes == null || isNaN(bytes)) return '—';
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  },

  /**
   * Format an ISO date string into a readable date.
   * @param {string} isoString
   * @returns {string}
   */
  formatDate(isoString) {
    if (!isoString) return '—';
    try {
      var d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return isoString;
    }
  },
};
