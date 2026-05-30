/**
 * UI Components
 *
 * Pure rendering functions for VFX cards, category tree, modal, and grid.
 * All functions produce HTML strings or manipulate the DOM directly.
 */

/* exported Components */
/* global CatalogManager, AuthManager */
var Components = {

  /**
   * Render a single VFX card.
   * @param {object} item - Catalog item
   * @returns {string} HTML string for the card
   */
  renderCard: function (item) {
    var thumbnailHtml;
    if (item.thumbnailPath) {
      thumbnailHtml = '<img src="/api/vfx/' + Components._escAttr(item.id) +
        '/thumbnail" loading="lazy" alt="' + Components._escAttr(item.name) + '">';
    } else {
      thumbnailHtml = '<span class="no-thumbnail">&#127878;</span>';
    }

    return '<div class="vfx-card" data-id="' + Components._escAttr(item.id) +
      '" onclick="Components.showModal(\'' + Components._escAttr(item.id) + '\')">' +
      '<div class="card-thumbnail">' + thumbnailHtml + '</div>' +
      '<div class="card-info">' +
        '<span class="card-name">' + Components._esc(item.name) + '</span>' +
        '<span class="card-category">' + Components._esc(item.category) + '</span>' +
      '</div>' +
    '</div>';
  },

  /**
   * Build and render the category tree in the sidebar.
   * Transforms flat category paths (e.g. "RPG/Hit") into a nested tree.
   * @param {string[]} categories - Flat list of category paths
   */
  renderCategoryTree: function (categories) {
    var container = document.getElementById('category-tree');
    if (!container) return;

    // Build tree structure from flat paths
    var tree = {};
    for (var i = 0; i < categories.length; i++) {
      var parts = categories[i].split('/');
      var root = parts[0];
      if (!tree[root]) {
        tree[root] = [];
      }
      if (parts.length > 1) {
        var child = parts.slice(1).join('/');
        if (tree[root].indexOf(child) === -1) {
          tree[root].push(child);
        }
      }
    }

    // Count items per category (including children for parent counts)
    var allItems = CatalogManager.catalog ? CatalogManager.catalog.items : [];
    var countMap = {};
    for (var j = 0; j < allItems.length; j++) {
      var cat = allItems[j].category;
      countMap[cat] = (countMap[cat] || 0) + 1;
    }

    var html = '';

    // "All" item
    html += '<div class="category-item all-category' +
      (CatalogManager.currentCategory === null ? ' active' : '') +
      '" data-category="">' +
      '<span class="cat-icon">&#9776;</span>' +
      '<span class="cat-name">All</span>' +
      '<span class="cat-count">(' + allItems.length + ')</span>' +
    '</div>';

    // Render each root category
    var roots = Object.keys(tree).sort();
    for (var r = 0; r < roots.length; r++) {
      var rootName = roots[r];
      var children = tree[rootName];

      // Count items for this root (exact match + all sub-categories)
      var rootCount = 0;
      for (var c = 0; c < allItems.length; c++) {
        if (allItems[c].category === rootName || allItems[c].category.startsWith(rootName + '/')) {
          rootCount++;
        }
      }

      var hasChildren = children.length > 0;
      var isRootActive = CatalogManager.currentCategory === rootName;
      var isExpanded = isRootActive ||
        (CatalogManager.currentCategory && CatalogManager.currentCategory.startsWith(rootName + '/'));

      if (hasChildren) {
        // Parent with children
        html += '<div class="category-item' + (isRootActive ? ' active' : '') +
          '" data-category="' + Components._escAttr(rootName) +
          '" data-toggle="' + Components._escAttr(rootName) + '">' +
          '<span class="cat-icon">' + (isExpanded ? '&#9662;' : '&#9656;') + '</span>' +
          '<span class="cat-name">' + Components._esc(rootName) + '</span>' +
          '<span class="cat-count">(' + rootCount + ')</span>' +
        '</div>';

        html += '<div class="category-children' + (isExpanded ? '' : ' collapsed') +
          '" id="cat-children-' + Components._escAttr(rootName) + '">';

        for (var ch = 0; ch < children.length; ch++) {
          var fullPath = rootName + '/' + children[ch];
          var childCount = countMap[fullPath] || 0;
          var isChildActive = CatalogManager.currentCategory === fullPath;

          html += '<div class="category-item child-item' + (isChildActive ? ' active' : '') +
            '" data-category="' + Components._escAttr(fullPath) + '">' +
            '<span class="cat-icon">&#8226;</span>' +
            '<span class="cat-name">' + Components._esc(children[ch]) + '</span>' +
            '<span class="cat-count">(' + childCount + ')</span>' +
          '</div>';
        }

        html += '</div>';
      } else {
        // Leaf category (no children)
        html += '<div class="category-item' + (isRootActive ? ' active' : '') +
          '" data-category="' + Components._escAttr(rootName) + '">' +
          '<span class="cat-icon">&#8226;</span>' +
          '<span class="cat-name">' + Components._esc(rootName) + '</span>' +
          '<span class="cat-count">(' + rootCount + ')</span>' +
        '</div>';
      }
    }

    container.innerHTML = html;

    // Attach click handlers
    var items = container.querySelectorAll('.category-item');
    for (var k = 0; k < items.length; k++) {
      items[k].addEventListener('click', Components._onCategoryClick);
    }
  },

  /**
   * Handle category item clicks.
   * @param {Event} e
   */
  _onCategoryClick: function (e) {
    var el = e.currentTarget;
    var category = el.getAttribute('data-category');
    var toggleRoot = el.getAttribute('data-toggle');

    // Set category filter
    if (category === '') {
      CatalogManager.setCategory(null);
    } else {
      CatalogManager.setCategory(category);
    }

    // Toggle children visibility if this is a parent
    if (toggleRoot) {
      var childrenEl = document.getElementById('cat-children-' + toggleRoot);
      if (childrenEl) {
        childrenEl.classList.toggle('collapsed');
        // Update arrow icon
        var icon = el.querySelector('.cat-icon');
        if (icon) {
          icon.innerHTML = childrenEl.classList.contains('collapsed') ? '&#9656;' : '&#9662;';
        }
      }
    }

    // Re-render grid and tree
    var items = CatalogManager.getItems();
    Components.renderGrid(items);
    Components.renderCategoryTree(CatalogManager.getCategories());
    Components.updateResultCount(
      items.length,
      CatalogManager.catalog ? CatalogManager.catalog.items.length : 0
    );

    // Update current category display
    var currentCatEl = document.getElementById('current-category');
    if (currentCatEl) {
      currentCatEl.textContent = CatalogManager.currentCategory || 'All';
    }
  },

  /**
   * Populate the detail modal with an item's data.
   * @param {object} item - Catalog item
   */
  renderModal: function (item) {
    var modalGif = document.getElementById('modal-gif');
    var modalName = document.getElementById('modal-name');
    var modalCategory = document.getElementById('modal-category');
    var modalParticles = document.getElementById('modal-particles');
    var modalSize = document.getElementById('modal-size');
    var modalDate = document.getElementById('modal-date');
    var modalAuthor = document.getElementById('modal-author');
    var modalDepsList = document.getElementById('modal-deps-list');
    var modalDownload = document.getElementById('modal-download');

    if (modalGif) {
      if (item.thumbnailPath) {
        modalGif.src = '/api/vfx/' + encodeURIComponent(item.id) + '/thumbnail';
        modalGif.alt = item.name;
      } else {
        modalGif.src = '';
        modalGif.alt = 'No thumbnail';
      }
    }
    if (modalName) modalName.textContent = item.name;
    if (modalCategory) modalCategory.textContent = item.category;
    if (modalParticles) modalParticles.textContent = item.particleCount || 0;
    if (modalSize) modalSize.textContent = CatalogManager.formatSize(item.fileSize);
    if (modalDate) modalDate.textContent = CatalogManager.formatDate(item.uploadedAt);
    if (modalAuthor) modalAuthor.textContent = item.uploadedBy || 'Unknown';

    // Dependencies
    if (modalDepsList) {
      if (item.dependencies && item.dependencies.length > 0) {
        var depsHtml = '';
        for (var i = 0; i < item.dependencies.length; i++) {
          depsHtml += '<li>' + Components._esc(item.dependencies[i]) + '</li>';
        }
        modalDepsList.innerHTML = depsHtml;
      } else {
        modalDepsList.innerHTML = '<li class="no-deps">None</li>';
      }
    }

    // Download button
    if (modalDownload) {
      modalDownload.setAttribute('data-id', item.id);
    }
  },

  /**
   * Show the detail modal for a given item ID.
   * @param {string} itemId
   */
  showModal: function (itemId) {
    var item = CatalogManager.getItem(itemId);
    if (!item) return;

    Components.renderModal(item);

    var modal = document.getElementById('detail-modal');
    if (modal) {
      modal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }
  },

  /**
   * Hide the detail modal.
   */
  hideModal: function () {
    var modal = document.getElementById('detail-modal');
    if (modal) {
      modal.classList.add('hidden');
      document.body.style.overflow = '';
    }
  },

  /**
   * Render the full grid of VFX cards.
   * @param {object[]} items - Array of catalog items to display
   */
  renderGrid: function (items) {
    var grid = document.getElementById('vfx-grid');
    if (!grid) return;

    if (!items || items.length === 0) {
      grid.innerHTML =
        '<div class="empty-state">' +
          '<div class="empty-icon">&#128269;</div>' +
          '<div class="empty-text">No VFX packages found</div>' +
        '</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < items.length; i++) {
      html += Components.renderCard(items[i]);
    }
    grid.innerHTML = html;
  },

  /**
   * Update the result count display in the content header.
   * @param {number} count - Number of currently shown items
   * @param {number} total - Total number of items in the catalog
   */
  updateResultCount: function (count, total) {
    var el = document.getElementById('result-count');
    if (!el) return;

    if (count === total) {
      el.textContent = total + ' package' + (total !== 1 ? 's' : '');
    } else {
      el.textContent = count + ' of ' + total + ' packages';
    }
  },

  /* ── Internal helpers ─────────────────────────────────────── */

  /**
   * Escape HTML entities in text content.
   * @param {string} str
   * @returns {string}
   */
  _esc: function (str) {
    if (str == null) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  },

  /**
   * Escape a string for use in an HTML attribute value.
   * @param {string} str
   * @returns {string}
   */
  _escAttr: function (str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  },
};
