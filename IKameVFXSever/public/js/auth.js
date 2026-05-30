/**
 * Auth Manager (Placeholder)
 *
 * Manages authentication state. Google OAuth is not yet configured;
 * this provides the structural skeleton for Phase 4 integration.
 */

/* exported AuthManager */
var AuthManager = {
  /** @type {string|null} JWT token */
  token: null,

  /** @type {object|null} Current user info { email, name, picture } */
  user: null,

  /**
   * Check if the user is currently logged in.
   * @returns {boolean}
   */
  isLoggedIn: function () {
    return this.token !== null && this.user !== null;
  },

  /**
   * Initiate Google login.
   * For now, shows a placeholder alert. In Phase 4, this will redirect
   * to /auth/google.
   */
  login: function () {
    // TODO: Replace with actual Google OAuth flow
    alert('Google OAuth not configured yet.\n\nThis will be available in a future update.');
  },

  /**
   * Log out the current user: clear token and user info from
   * memory and localStorage.
   */
  logout: function () {
    this.token = null;
    this.user = null;
    try {
      localStorage.removeItem('vfxhub_token');
      localStorage.removeItem('vfxhub_user');
    } catch (e) {
      // localStorage may be unavailable
      console.warn('Could not clear localStorage:', e);
    }
    this.updateUI();
  },

  /**
   * Build authorization headers for API calls.
   * @returns {object} Headers object with Authorization if logged in
   */
  getHeaders: function () {
    var headers = {};
    if (this.token) {
      headers['Authorization'] = 'Bearer ' + this.token;
    }
    return headers;
  },

  /**
   * Initialize auth state from localStorage on page load.
   */
  init: function () {
    try {
      var savedToken = localStorage.getItem('vfxhub_token');
      var savedUser = localStorage.getItem('vfxhub_user');
      if (savedToken && savedUser) {
        this.token = savedToken;
        this.user = JSON.parse(savedUser);
      }
    } catch (e) {
      console.warn('Could not restore auth state:', e);
      this.token = null;
      this.user = null;
    }
    this.updateUI();
  },

  /**
   * Update the header UI to reflect the current auth state.
   */
  updateUI: function () {
    var loginBtn = document.getElementById('login-btn');
    var userInfo = document.getElementById('user-info');
    var userNameEl = document.getElementById('user-name');

    if (!loginBtn || !userInfo) return;

    if (this.isLoggedIn()) {
      loginBtn.classList.add('hidden');
      userInfo.classList.remove('hidden');
      if (userNameEl) {
        userNameEl.textContent = this.user.name || this.user.email || 'User';
      }
    } else {
      loginBtn.classList.remove('hidden');
      userInfo.classList.add('hidden');
    }
  },
};
