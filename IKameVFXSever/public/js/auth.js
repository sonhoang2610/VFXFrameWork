/**
 * Auth Manager
 *
 * Manages Google OAuth authentication state for the VFX Hub frontend.
 * Handles JWT tokens received from the server OAuth callback,
 * stores them in localStorage, and updates the UI accordingly.
 */

/* exported AuthManager */
var AuthManager = {
  /** @type {string|null} JWT token */
  token: null,

  /** @type {object|null} Current user info { name, email, picture, iat, exp } */
  user: null,

  /**
   * Initialize auth state on page load.
   * 1. Check URL for ?token= param (from OAuth redirect)
   * 2. Fall back to localStorage
   * 3. Validate token expiry
   * 4. Update UI
   */
  init: function () {
    // Check URL for token parameter (from Google OAuth redirect)
    var urlParams = new URLSearchParams(window.location.search);
    var tokenFromUrl = urlParams.get('token');
    var error = urlParams.get('error');

    if (error) {
      var message = urlParams.get('message') || 'Authentication failed. Please try again.';
      console.warn('Auth error:', error, message);
      // Clean URL
      window.history.replaceState({}, document.title, '/');
    }

    if (tokenFromUrl) {
      this.token = tokenFromUrl;
      try {
        localStorage.setItem('vfx_token', tokenFromUrl);
      } catch (e) {
        console.warn('Could not save token to localStorage:', e);
      }
      // Clean the token from URL so it is not leaked in bookmarks/history
      window.history.replaceState({}, document.title, '/');
    } else {
      // Try to restore from localStorage
      try {
        this.token = localStorage.getItem('vfx_token');
      } catch (e) {
        console.warn('Could not read token from localStorage:', e);
        this.token = null;
      }
    }

    // Decode and validate the token
    if (this.token) {
      try {
        this.user = this.parseJwt(this.token);
      } catch (e) {
        console.warn('Failed to parse JWT:', e);
        this.logout();
        return;
      }

      // Check if token is expired
      if (this.user.exp && this.user.exp * 1000 < Date.now()) {
        console.warn('Token expired, logging out.');
        this.logout();
        return;
      }
    }

    this.updateUI();
  },

  /**
   * Decode a JWT payload (base64url -> JSON).
   * Does NOT verify the signature — that is the server's job.
   * @param {string} token
   * @returns {object} Decoded payload
   */
  parseJwt: function (token) {
    var parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    // Base64url decode the payload (second part)
    var base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');

    // Pad with '=' to make it valid base64
    var padding = 4 - (base64.length % 4);
    if (padding !== 4) {
      base64 += '==='.slice(0, padding);
    }

    var jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(function (c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join('')
    );

    return JSON.parse(jsonPayload);
  },

  /**
   * Check if the user is currently logged in with a valid token.
   * @returns {boolean}
   */
  isLoggedIn: function () {
    return this.token !== null && this.user !== null;
  },

  /**
   * Initiate Google OAuth login.
   * Redirects the browser to the server's Google OAuth endpoint.
   */
  login: function () {
    window.location.href = '/auth/google';
  },

  /**
   * Log out the current user: clear token and user info from
   * memory and localStorage.
   */
  logout: function () {
    this.token = null;
    this.user = null;
    try {
      localStorage.removeItem('vfx_token');
    } catch (e) {
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
   * Update the header UI to reflect the current auth state.
   * Shows user name/avatar when logged in, login button when logged out.
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
