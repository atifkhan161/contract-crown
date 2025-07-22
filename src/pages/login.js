/**
 * Login Page Controller
 * Handles login form validation, authentication, and UI interactions
 */

class LoginController {
    constructor() {
        this.form = null;
        this.inputs = {};
        this.buttons = {};
        this.errorElements = {};
        this.connectionStatus = null;
        this.websocketManager = null;
        this.authManager = null;
        
        this.init();
    }

    /**
     * Initialize the login controller
     */
    init() {
        this.bindElements();
        this.setupEventListeners();
        this.initializeServices();
        this.setupConnectionStatus();
    }

    /**
     * Bind DOM elements to controller properties
     */
    bindElements() {
        // Form elements
        this.form = document.getElementById('login-form');
        this.inputs = {
            username: document.getElementById('username'),
            password: document.getElementById('password')
        };
        
        // Button elements
        this.buttons = {
            login: document.getElementById('login-btn'),
            loginText: document.querySelector('.btn-text'),
            loginSpinner: document.getElementById('login-spinner')
        };
        
        // Error elements
        this.errorElements = {
            username: document.getElementById('username-error'),
            password: document.getElementById('password-error'),
            form: document.getElementById('form-error')
        };
        
        // Connection status elements
        this.connectionStatus = {
            indicator: document.getElementById('status-indicator'),
            text: document.getElementById('status-text')
        };
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Form submission
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        
        // Input validation on blur
        Object.keys(this.inputs).forEach(key => {
            this.inputs[key].addEventListener('blur', () => this.validateField(key));
            this.inputs[key].addEventListener('input', () => this.clearFieldError(key));
        });
        
        // Enter key handling
        Object.values(this.inputs).forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleSubmit(e);
                }
            });
        });
    }

    /**
     * Initialize authentication and websocket services
     */
    initializeServices() {
        // Initialize AuthManager if available
        if (typeof AuthManager !== 'undefined') {
            this.authManager = new AuthManager();
            
            // Check if user is already authenticated
            if (this.authManager.isAuthenticated()) {
                this.redirectToDashboard();
                return;
            }
        }
        
        // Initialize WebSocket Manager if available
        if (typeof WebSocketManager !== 'undefined') {
            this.websocketManager = new WebSocketManager();
            this.websocketManager.on('connectionChange', (status) => {
                this.updateConnectionStatus(status);
            });
        }
    }

    /**
     * Setup connection status widget
     */
    setupConnectionStatus() {
        if (this.websocketManager) {
            // Try to connect
            this.websocketManager.connect().catch(() => {
                // Connection failed, show disconnected status
                this.updateConnectionStatus('disconnected');
            });
        } else {
            // No websocket manager, show disconnected
            this.updateConnectionStatus('disconnected');
        }
    }

    /**
     * Update connection status display
     * @param {string} status - Connection status (connected, connecting, disconnected)
     */
    updateConnectionStatus(status) {
        const { indicator, text } = this.connectionStatus;
        
        // Remove all status classes
        indicator.classList.remove('connected', 'connecting', 'disconnected');
        
        // Add current status class and update text
        switch (status) {
            case 'connected':
                indicator.classList.add('connected');
                text.textContent = 'Connected';
                break;
            case 'connecting':
                indicator.classList.add('connecting');
                text.textContent = 'Connecting...';
                break;
            case 'disconnected':
            default:
                indicator.classList.add('disconnected');
                text.textContent = 'Offline';
                break;
        }
    }

    /**
     * Handle form submission
     * @param {Event} e - Submit event
     */
    async handleSubmit(e) {
        e.preventDefault();
        
        // Validate all fields
        const isValid = this.validateAllFields();
        if (!isValid) {
            return;
        }
        
        // Get form data
        const credentials = {
            username: this.inputs.username.value.trim(),
            password: this.inputs.password.value
        };
        
        // Show loading state
        this.setLoadingState(true);
        this.clearFormError();
        
        try {
            // Attempt login
            const result = await this.performLogin(credentials);
            
            if (result.success) {
                // Login successful
                this.showSuccess('Login successful! Redirecting...');
                setTimeout(() => {
                    this.redirectToDashboard();
                }, 1000);
            } else {
                // Login failed
                this.showFormError(result.message || 'Login failed. Please try again.');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showFormError('Network error. Please check your connection and try again.');
        } finally {
            this.setLoadingState(false);
        }
    }

    /**
     * Perform login authentication
     * @param {Object} credentials - User credentials
     * @returns {Promise<Object>} Login result
     */
    async performLogin(credentials) {
        if (this.authManager) {
            return await this.authManager.login(credentials);
        } else {
            // Fallback for when auth service is not available
            // This would be replaced with actual API call
            return new Promise((resolve) => {
                setTimeout(() => {
                    // Mock authentication for development
                    if (credentials.username && credentials.password) {
                        resolve({ success: true });
                    } else {
                        resolve({ success: false, message: 'Invalid credentials' });
                    }
                }, 1000);
            });
        }
    }

    /**
     * Validate all form fields
     * @returns {boolean} True if all fields are valid
     */
    validateAllFields() {
        let isValid = true;
        
        Object.keys(this.inputs).forEach(key => {
            if (!this.validateField(key)) {
                isValid = false;
            }
        });
        
        return isValid;
    }

    /**
     * Validate a specific field
     * @param {string} fieldName - Name of the field to validate
     * @returns {boolean} True if field is valid
     */
    validateField(fieldName) {
        const input = this.inputs[fieldName];
        const value = input.value.trim();
        let isValid = true;
        let errorMessage = '';
        
        switch (fieldName) {
            case 'username':
                if (!value) {
                    errorMessage = 'Username or email is required';
                    isValid = false;
                } else if (value.length < 3) {
                    errorMessage = 'Username must be at least 3 characters';
                    isValid = false;
                }
                break;
                
            case 'password':
                if (!value) {
                    errorMessage = 'Password is required';
                    isValid = false;
                } else if (value.length < 6) {
                    errorMessage = 'Password must be at least 6 characters';
                    isValid = false;
                }
                break;
        }
        
        if (isValid) {
            this.clearFieldError(fieldName);
        } else {
            this.showFieldError(fieldName, errorMessage);
        }
        
        return isValid;
    }

    /**
     * Show field-specific error
     * @param {string} fieldName - Name of the field
     * @param {string} message - Error message
     */
    showFieldError(fieldName, message) {
        const input = this.inputs[fieldName];
        const errorElement = this.errorElements[fieldName];
        
        input.classList.add('error');
        errorElement.textContent = message;
        errorElement.classList.add('show');
    }

    /**
     * Clear field-specific error
     * @param {string} fieldName - Name of the field
     */
    clearFieldError(fieldName) {
        const input = this.inputs[fieldName];
        const errorElement = this.errorElements[fieldName];
        
        input.classList.remove('error');
        errorElement.textContent = '';
        errorElement.classList.remove('show');
    }

    /**
     * Show form-level error
     * @param {string} message - Error message
     */
    showFormError(message) {
        const errorElement = this.errorElements.form;
        errorElement.textContent = message;
        errorElement.classList.add('show');
    }

    /**
     * Clear form-level error
     */
    clearFormError() {
        const errorElement = this.errorElements.form;
        errorElement.textContent = '';
        errorElement.classList.remove('show');
    }

    /**
     * Show success message
     * @param {string} message - Success message
     */
    showSuccess(message) {
        // Create temporary success element
        const successElement = document.createElement('div');
        successElement.className = 'form-success show';
        successElement.textContent = message;
        successElement.style.cssText = `
            background: rgba(39, 174, 96, 0.1);
            border: 1px solid var(--text-success);
            border-radius: var(--radius-md);
            padding: var(--spacing-md);
            color: var(--text-success);
            font-size: var(--font-size-sm);
            text-align: center;
            margin-top: var(--spacing-md);
        `;
        
        // Insert after form
        this.form.parentNode.insertBefore(successElement, this.form.nextSibling);
        
        // Remove after 3 seconds
        setTimeout(() => {
            if (successElement.parentNode) {
                successElement.parentNode.removeChild(successElement);
            }
        }, 3000);
    }

    /**
     * Set loading state for form
     * @param {boolean} loading - Whether form is in loading state
     */
    setLoadingState(loading) {
        const { login, loginText, loginSpinner } = this.buttons;
        
        if (loading) {
            login.disabled = true;
            loginText.classList.add('hidden');
            loginSpinner.classList.remove('hidden');
        } else {
            login.disabled = false;
            loginText.classList.remove('hidden');
            loginSpinner.classList.add('hidden');
        }
    }

    /**
     * Redirect to dashboard page
     */
    redirectToDashboard() {
        window.location.href = 'dashboard.html';
    }
}

// Initialize login controller when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new LoginController();
});

// Export for testing purposes
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LoginController;
}