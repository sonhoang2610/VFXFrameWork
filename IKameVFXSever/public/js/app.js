/**
 * IKAME VFX Hub — Main Application
 *
 * Initializes the app on page load, wires up event handlers for
 * search, category filtering, modal interactions, and downloads.
 */

/* global CatalogManager, AuthManager, Components */

document.addEventListener('DOMContentLoaded', async function () {
  // ── Initialize auth ────────────────────────────────────────
  AuthManager.init();

  // Wire up login/logout buttons
  var loginBtn = document.getElementById('login-btn');
  if (loginBtn) {
    loginBtn.addEventListener('click', function () {
      AuthManager.login();
    });
  }

  var logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      AuthManager.logout();
    });
  }

  // ── Load catalog ───────────────────────────────────────────
  var loadingEl = document.getElementById('loading-indicator');
  if (loadingEl) loadingEl.classList.remove('hidden');

  try {
    await CatalogManager.fetchCatalog();
  } catch (err) {
    console.error('Failed to load catalog:', err);
  }

  if (loadingEl) loadingEl.classList.add('hidden');

  // ── Render initial state ───────────────────────────────────
  var items = CatalogManager.getItems();
  var total = CatalogManager.catalog ? CatalogManager.catalog.items.length : 0;

  Components.renderGrid(items);
  Components.renderCategoryTree(CatalogManager.getCategories());
  Components.updateResultCount(items.length, total);

  var currentCatEl = document.getElementById('current-category');
  if (currentCatEl) {
    currentCatEl.textContent = 'All';
  }

  // ── Search input (debounced 300ms) ─────────────────────────
  var searchInput = document.getElementById('search-input');
  var searchTimer = null;

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        CatalogManager.setSearch(searchInput.value);
        var filtered = CatalogManager.getItems();
        var catalogTotal = CatalogManager.catalog ? CatalogManager.catalog.items.length : 0;
        Components.renderGrid(filtered);
        Components.updateResultCount(filtered.length, catalogTotal);
      }, 300);
    });
  }

  // ── Modal close handlers ───────────────────────────────────

  // Close button (X)
  var closeBtn = document.querySelector('.modal-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      Components.hideModal();
    });
  }

  // Click outside modal content
  var modal = document.getElementById('detail-modal');
  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal) {
        Components.hideModal();
      }
    });
  }

  // Escape key
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      Components.hideModal();
    }
  });

  // ── Download button ────────────────────────────────────────
  var downloadBtn = document.getElementById('modal-download');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', function () {
      var itemId = downloadBtn.getAttribute('data-id');
      if (!itemId) return;

      var url = '/api/vfx/' + encodeURIComponent(itemId) + '/download';

      // Append auth token as query param if logged in
      if (AuthManager.isLoggedIn()) {
        url += '?token=' + encodeURIComponent(AuthManager.token);
      }

      // Trigger download via temporary anchor element
      var a = document.createElement('a');
      a.href = url;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  }
});
