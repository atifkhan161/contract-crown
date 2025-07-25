/**
 * Authentication Manager
 * Handles JWT token management, user authentication, and session management
 */

class AuthManager {
    constructor() {
        this.baseURL = this.getBaseURL();
        this.tokenKey = 'auth_token';
        this.userKey = 'auth_user';
        this.refreshTokenKey = 'auth_refresh_token';
        this.sessionKey = 'auth_session';
        this.rememberMeKey = 'auth_remember_me';
        
        // Authentication state
        this.isAuthenticating = false;
        this.authStateListeners = [];
        
        // Initialize token refresh timer
        this.refreshTimer = null;
        this.setupTokenRefresh();
        
        // Initialize session monitoring (disabled by default to prevent aggressive auth checks)
        // this.setupSessionMonitoring();
    }

    /**
     * Get base URL for API calls
     * @returns {string} Base URL
     */
    getBaseURL() {
        // Use the same protocol, host, and port as the current page
        const protocol = window.location.protocol;
        const host = window.location.host; // includes port if present
        
        // Always use relative path to ensure same port usage
        return `${protocol}//${host}/api`;
    }

    /**
     * Login user with credentials
     * @param {Object} credentials - User credentials
     * @param {string} credentials.username - Username or email
     * @param {string} credentials.password - Password
     * @param {boolean} rememberMe - Whether to remember the user (client-side only)
     * @returns {Promise<Object>} Login result
     */
    async login(credentials, rememberMe = false) {
        try {
            // Only send username and password to server
            const loginData = {
                username: credentials.username,
                password: credentials.password
            };

            const response = await fetch(`${this.baseURL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(loginData)
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Store tokens and user data based on remember me preference
                this.setToken(data.token, rememberMe);
                this.setUser(data.user, rememberMe);
                
                if (data.refreshToken) {
                    this.setRefreshToken(data.refreshToken, rememberMe);
                }
                
                // Store remember me preference
                this.setRememberMe(rememberMe);
                
                // Setup token refresh
                this.setupTokenRefresh();
                
                return {
                    success: true,
                    user: data.user,
                    message: data.message
                };
            } else {
                return {
                    success: false,
                    message: data.message || 'Login failed'
                };
            }
        } catch (error) {
            console.error('Login error:', error);
            return {
                success: false,
                message: 'Network error. Please check your connection.'
            };
        }
    }

    /**
     * Register new user
     * @param {Object} userData - User registration data
     * @param {string} userData.username - Username
     * @param {string} userData.email - Email address
     * @param {string} userData.password - Password
     * @returns {Promise<Object>} Registration result
     */
    async register(userData) {
        try {
            const response = await fetch(`${this.baseURL}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(userData)
            });

            const data = await response.json();

            if (response.ok && data.success) {
                return {
                    success: true,
                    message: data.message || 'Registration successful'
                };
            } else {
                return {
                    success: false,
                    message: data.message || 'Registration failed'
                };
            }
        } catch (error) {
            console.error('Registration error:', error);
            return {
                success: false,
                message: 'Network error. Please check your connection.'
            };
        }
    }

    /**
     * Logout user and clean up session
     * @returns {Promise<void>}
     */
    async logout() {
        try {
            const token = this.getToken();
            if (token) {
                // Notify server about logout
                await fetch(`${this.baseURL}/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    }
                });
            }
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            // Clear local storage regardless of server response
            this.clearSession();
        }
    }

    /**
     * Check if user is authenticated
     * @returns {boolean} True if user is authenticated
     */
    isAuthenticated() {
        const token = this.getToken();
        console.log('[AuthManager] isAuthenticated check - token:', token?.substring(0, 20) + '...');
        
        if (!token) {
            console.log('[AuthManager] No token found');
            return false;
        }



        // Check if token is expired (for real JWT tokens)
        try {
            const payload = this.parseJWT(token);
            const currentTime = Math.floor(Date.now() / 1000);
            
            if (payload.exp && payload.exp < currentTime) {
                // Token is expired
                console.log('[AuthManager] Token expired');
                this.clearSession();
                return false;
            }
            
            console.log('[AuthManager] Valid JWT token');
            return true;
        } catch (error) {
            // Invalid token format - clear session
            console.warn('[AuthManager] Invalid token format:', error.message);
            this.clearSession();
            return false;
        }
    }

    /**
     * Get current user data
     * @returns {Object|null} User data or null if not authenticated
     */
    getCurrentUser() {
        if (!this.isAuthenticated()) {
            return null;
        }
        
        try {
            const userData = localStorage.getItem(this.userKey) || sessionStorage.getItem(this.userKey);
            return userData ? JSON.parse(userData) : null;
        } catch (error) {
            console.error('Error getting user data:', error);
            return null;
        }
    }

    /**
     * Get storage based on remember me preference
     * @returns {Storage} localStorage or sessionStorage
     */
    getStorage() {
        return this.getRememberMe() ? localStorage : sessionStorage;
    }

    /**
     * Get authentication token
     * @returns {string|null} JWT token or null
     */
    getToken() {
        return localStorage.getItem(this.tokenKey) || sessionStorage.getItem(this.tokenKey);
    }

    /**
     * Set authentication token
     * @param {string} token - JWT token
     * @param {boolean} remember - Whether to use persistent storage
     */
    setToken(token, remember = false) {
        const storage = remember ? localStorage : sessionStorage;
        storage.setItem(this.tokenKey, token);
        
        // Clear from the other storage
        const otherStorage = remember ? sessionStorage : localStorage;
        otherStorage.removeItem(this.tokenKey);
    }

    /**
     * Get refresh token
     * @returns {string|null} Refresh token or null
     */
    getRefreshToken() {
        return localStorage.getItem(this.refreshTokenKey) || sessionStorage.getItem(this.refreshTokenKey);
    }

    /**
     * Set refresh token
     * @param {string} token - Refresh token
     * @param {boolean} remember - Whether to use persistent storage
     */
    setRefreshToken(token, remember = false) {
        const storage = remember ? localStorage : sessionStorage;
        storage.setItem(this.refreshTokenKey, token);
        
        // Clear from the other storage
        const otherStorage = remember ? sessionStorage : localStorage;
        otherStorage.removeItem(this.refreshTokenKey);
    }

    /**
     * Set user data
     * @param {Object} user - User data
     * @param {boolean} remember - Whether to use persistent storage
     */
    setUser(user, remember = false) {
        const storage = remember ? localStorage : sessionStorage;
        storage.setItem(this.userKey, JSON.stringify(user));
        
        // Clear from the other storage
        const otherStorage = remember ? sessionStorage : localStorage;
        otherStorage.removeItem(this.userKey);
    }

    /**
     * Get remember me preference
     * @returns {boolean} True if remember me is enabled
     */
    getRememberMe() {
        return localStorage.getItem(this.rememberMeKey) === 'true';
    }

    /**
     * Set remember me preference
     * @param {boolean} remember - Remember me preference
     */
    setRememberMe(remember) {
        if (remember) {
            localStorage.setItem(this.rememberMeKey, 'true');
        } else {
            localStorage.removeItem(this.rememberMeKey);
        }
    }

    /**
     * Clear all session data
     */
    clearSession() {
        localStorage.removeItem(this.tokenKey);
        localStorage.removeItem(this.userKey);
        localStorage.removeItem(this.refreshTokenKey);
        localStorage.removeItem(this.rememberMeKey);
        
        sessionStorage.removeItem(this.tokenKey);
        sessionStorage.removeItem(this.userKey);
        sessionStorage.removeItem(this.refreshTokenKey);
        
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

    /**
     * Parse JWT token payload
     * @param {string} token - JWT token
     * @returns {Object} Token payload
     */
    parseJWT(token) {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        return JSON.parse(jsonPayload);
    }

    /**
     * Setup automatic token refresh
     */
    setupTokenRefresh() {
        const token = this.getToken();
        if (!token) {
            return;
        }



        try {
            const payload = this.parseJWT(token);
            const currentTime = Math.floor(Date.now() / 1000);
            const timeUntilExpiry = payload.exp - currentTime;
            
            // Refresh token 5 minutes before expiry
            const refreshTime = Math.max(0, (timeUntilExpiry - 300) * 1000);
            
            if (this.refreshTimer) {
                clearTimeout(this.refreshTimer);
            }
            
            this.refreshTimer = setTimeout(() => {
                this.refreshToken();
            }, refreshTime);
        } catch (error) {
            console.error('Error setting up token refresh:', error);
        }
    }

    /**
     * Refresh authentication token
     * @returns {Promise<boolean>} True if refresh successful
     */
    async refreshToken() {
        const refreshToken = this.getRefreshToken();
        if (!refreshToken) {
            this.clearSession();
            return false;
        }



        try {
            const response = await fetch(`${this.baseURL}/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ refreshToken })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                const rememberMe = this.getRememberMe();
                this.setToken(data.token, rememberMe);
                if (data.refreshToken) {
                    this.setRefreshToken(data.refreshToken, rememberMe);
                }
                this.setupTokenRefresh();
                return true;
            } else {
                this.clearSession();
                return false;
            }
        } catch (error) {
            console.error('Token refresh error:', error);
            this.clearSession();
            return false;
        }
    }

    /**
     * Make authenticated API request
     * @param {string} url - API endpoint
     * @param {Object} options - Fetch options
     * @returns {Promise<Response>} Fetch response
     */
    async authenticatedFetch(url, options = {}) {
        const token = this.getToken();
        if (!token) {
            throw new Error('No authentication token available');
        }

        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers
        };

        const response = await fetch(url, {
            ...options,
            headers
        });

        // If token is expired, try to refresh
        if (response.status === 401) {
            const refreshed = await this.refreshToken();
            if (refreshed) {
                // Retry with new token
                const newToken = this.getToken();
                headers['Authorization'] = `Bearer ${newToken}`;
                return fetch(url, {
                    ...options,
                    headers
                });
            } else {
                // Refresh failed, redirect to login
                window.location.href = 'login.html';
                throw new Error('Authentication expired');
            }
        }

        return response;
    }

    /**
     * Enable session monitoring (call this manually if needed)
     */
    enableSessionMonitoring() {
        this.setupSessionMonitoring();
    }

    /**
     * Setup session monitoring for tab visibility and storage changes
     */
    setupSessionMonitoring() {
        // Monitor storage changes across tabs
        window.addEventListener('storage', (e) => {
            if (e.key === this.tokenKey || e.key === this.userKey || e.key === this.rememberMeKey) {
                console.log('[AuthManager] Storage change detected for key:', e.key);
                // Only notify if the token was actually removed
                if (e.key === this.tokenKey && !e.newValue) {
                    console.log('[AuthManager] Token removed, notifying auth state change');
                    this.notifyAuthStateChange();
                }
            }
        });

        // Monitor tab visibility for session validation (less aggressive)
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.isAuthenticated()) {
                // Only validate session if it's been more than 5 minutes since last validation
                const lastValidation = sessionStorage.getItem('last_session_validation');
                const now = Date.now();
                if (!lastValidation || (now - parseInt(lastValidation)) > 300000) { // 5 minutes
                    sessionStorage.setItem('last_session_validation', now.toString());
                    this.validateSession();
                }
            }
        });

        // Less frequent periodic session validation
        setInterval(() => {
            if (this.isAuthenticated()) {
                const lastValidation = sessionStorage.getItem('last_session_validation');
                const now = Date.now();
                if (!lastValidation || (now - parseInt(lastValidation)) > 600000) { // 10 minutes
                    sessionStorage.setItem('last_session_validation', now.toString());
                    this.validateSession();
                }
            }
        }, 300000); // Check every 5 minutes instead of 1 minute
    }

    /**
     * Validate current session
     * @returns {Promise<boolean>} True if session is valid
     */
    async validateSession() {
        const token = this.getToken();
        if (!token) {
            return false;
        }

        // First check if token is expired locally before making API call
        try {
            const payload = this.parseJWT(token);
            const currentTime = Math.floor(Date.now() / 1000);
            
            if (payload.exp && payload.exp < currentTime) {
                console.log('[AuthManager] Token expired locally');
                this.clearSession();
                this.notifyAuthStateChange();
                return false;
            }
        } catch (error) {
            console.log('[AuthManager] Invalid token format during validation');
            this.clearSession();
            this.notifyAuthStateChange();
            return false;
        }

        // Skip server validation if we don't have a validate endpoint
        // This prevents unnecessary errors and session clearing
        try {
            const response = await fetch(`${this.baseURL}/auth/validate`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.valid) {
                    return true;
                } else {
                    console.log('[AuthManager] Server says token is invalid');
                    this.clearSession();
                    this.notifyAuthStateChange();
                    return false;
                }
            } else if (response.status === 401) {
                // Try to refresh token
                const refreshed = await this.refreshToken();
                if (!refreshed) {
                    this.notifyAuthStateChange();
                }
                return refreshed;
            } else if (response.status === 404) {
                // Validation endpoint doesn't exist, assume token is valid if not expired
                console.log('[AuthManager] Validation endpoint not found, assuming token is valid');
                return true;
            }
        } catch (error) {
            console.error('Session validation error:', error);
            // Don't clear session on network errors, just assume it's valid
            return true;
        }

        return true; // Default to valid if we can't determine otherwise
    }

    /**
     * Add authentication state change listener
     * @param {Function} callback - Callback function
     */
    onAuthStateChange(callback) {
        this.authStateListeners.push(callback);
    }

    /**
     * Remove authentication state change listener
     * @param {Function} callback - Callback function to remove
     */
    offAuthStateChange(callback) {
        const index = this.authStateListeners.indexOf(callback);
        if (index > -1) {
            this.authStateListeners.splice(index, 1);
        }
    }

    /**
     * Notify all listeners of authentication state change
     */
    notifyAuthStateChange() {
        const isAuthenticated = this.isAuthenticated();
        const user = this.getCurrentUser();
        
        this.authStateListeners.forEach(callback => {
            try {
                callback({ isAuthenticated, user });
            } catch (error) {
                console.error('Error in auth state listener:', error);
            }
        });
    }

    /**
     * Get authentication state
     * @returns {Object} Authentication state
     */
    getAuthState() {
        return {
            isAuthenticated: this.isAuthenticated(),
            user: this.getCurrentUser(),
            isAuthenticating: this.isAuthenticating
        };
    }

    /**
     * Set authentication loading state
     * @param {boolean} loading - Whether authentication is in progress
     */
    setAuthenticating(loading) {
        this.isAuthenticating = loading;
        this.notifyAuthStateChange();
    }

    /**
     * Check if user has specific role or permission
     * @param {string} roleOrPermission - Role or permission to check
     * @returns {boolean} True if user has role/permission
     */
    hasRole(roleOrPermission) {
        const user = this.getCurrentUser();
        if (!user) {
            return false;
        }

        // Check roles
        if (user.roles && user.roles.includes(roleOrPermission)) {
            return true;
        }

        // Check permissions
        if (user.permissions && user.permissions.includes(roleOrPermission)) {
            return true;
        }

        return false;
    }

    /**
     * Update user profile data
     * @param {Object} updates - Profile updates
     * @returns {Promise<Object>} Update result
     */
    async updateProfile(updates) {
        try {
            const response = await this.authenticatedFetch(`${this.baseURL}/auth/profile`, {
                method: 'PUT',
                body: JSON.stringify(updates)
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Update stored user data
                const rememberMe = this.getRememberMe();
                this.setUser(data.user, rememberMe);
                this.notifyAuthStateChange();
                
                return {
                    success: true,
                    user: data.user,
                    message: data.message
                };
            } else {
                return {
                    success: false,
                    message: data.message || 'Profile update failed'
                };
            }
        } catch (error) {
            console.error('Profile update error:', error);
            return {
                success: false,
                message: 'Network error. Please check your connection.'
            };
        }
    }

    /**
     * Change user password
     * @param {Object} passwordData - Password change data
     * @param {string} passwordData.currentPassword - Current password
     * @param {string} passwordData.newPassword - New password
     * @returns {Promise<Object>} Change result
     */
    async changePassword(passwordData) {
        try {
            const response = await this.authenticatedFetch(`${this.baseURL}/auth/change-password`, {
                method: 'POST',
                body: JSON.stringify(passwordData)
            });

            const data = await response.json();

            return {
                success: response.ok && data.success,
                message: data.message || (response.ok ? 'Password changed successfully' : 'Password change failed')
            };
        } catch (error) {
            console.error('Password change error:', error);
            return {
                success: false,
                message: 'Network error. Please check your connection.'
            };
        }
    }

    /**
     * Get user statistics
     * @returns {Promise<Object>} User stats
     */
    async getUserStats() {
        try {
            const response = await this.authenticatedFetch(`${this.baseURL}/users/stats`);
            const data = await response.json();

            if (response.ok && data.success) {
                return data.stats || {
                    gamesPlayed: 0,
                    gamesWon: 0,
                    winRate: 0
                };
            } else {
                return {
                    gamesPlayed: 0,
                    gamesWon: 0,
                    winRate: 0
                };
            }
        } catch (error) {
            console.error('Error fetching user stats:', error);
            return {
                gamesPlayed: 0,
                gamesWon: 0,
                winRate: 0
            };
        }
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.AuthManager = AuthManager;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthManager;
}