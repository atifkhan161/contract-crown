/**
 * Registration Page Controller
 * Handles registration form validation, user creation, and UI interactions
 */

class RegisterController {
    constructor() {
        this.form = null;
        this.inputs = {};
        this.buttons = {};
        this.errorElements = {};
        this.connectionStatus = null;
        this.websocketManager = null;
        this.authManager = null;
        
        // Validation patterns
        this.patterns = {
            username: /^[a-zA-Z0-9_]{3,20}$/,
            email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            password: /^.{8,}$/
        };
        
        this.init();
    }

    /**
     * Initialize the registration controller
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
        this.form = document.getElementById('register-form');
        this.inputs = {
            username: document.getElementById('username'),
            email: document.getElementById('email'),
            password: document.getElementById('password'),
            confirmPassword: document.getElementById('confirmPassword'),
            terms: document.getElementById('terms')
        };
        
        // Button elements
        this.buttons = {
            register: document.getElementById('register-btn'),
            registerText: document.querySelector('.btn-text'),
            registerSpinner: document.getElementById('register-spinner')
        };
        
        // Error elements
        this.errorElements = {
            username: document.getElementById('username-error'),
            email: document.getElementById('email-error'),
            password: document.getElementById('password-error'),
            confirmPassword: document.getElementById('confirmPassword-error'),
            terms: document.getElementById('terms-error'),
            form: document.getElementById('form-error')
        };
        
        // Password strength elements
        this.passwordStrength = {
            fill: document.getElementById('strength-fill'),
            text: document.getElementById('strength-text')
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
        
        // Input validation on blur and input
        Object.keys(this.inputs).forEach(key => {
            if (key !== 'terms') {
                this.inputs[key].addEventListener('blur', () => this.validateField(key));
                this.inputs[key].addEventListener('input', () => {
                    this.clearFieldError(key);
                    if (key === 'password') {
                        this.updatePasswordStrength();
                    }
                    if (key === 'confirmPassword' || key === 'password') {
                        this.validatePasswordMatch();
                    }
                });
            }
        });
        
        // Terms checkbox
        this.inputs.terms.addEventListener('change', () => this.validateField('terms'));
        
        // Enter key handling
        Object.values(this.inputs).forEach(input => {
            if (input.type !== 'checkbox') {
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.handleSubmit(e);
                    }
                });
            }
        });
        
        // Real-time username availability check (debounced)
        this.setupUsernameCheck();
    }

    /**
     * Setup debounced username availability check
     */
    setupUsernameCheck() {
        let timeout;
        this.inputs.username.addEventListener('input', () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                const username = this.inputs.username.value.trim();
                if (username.length >= 3 && this.patterns.username.test(username)) {
                    this.checkUsernameAvailability(username);
                }
            }, 500);
        });
    }

    /**
     * Check username availability
     * @param {string} username - Username to check
     */
    async checkUsernameAvailability(username) {
        try {
            if (this.authManager) {
                const response = await fetch(`${this.authManager.baseURL}/auth/check-username`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ username })
                });
                
                const data = await response.json();
                
                if (data.available === false) {
                    this.showFieldError('username', 'Username is already taken');
                } else if (data.available === true) {
                    this.inputs.username.classList.add('success');
                }
            }
        } catch (error) {
            // Silently fail username check - not critical for registration
            console.log('Username availability check failed:', error);
        }
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
        const userData = {
            username: this.inputs.username.value.trim(),
            email: this.inputs.email.value.trim().toLowerCase(),
            password: this.inputs.password.value
        };
        
        // Show loading state
        this.setLoadingState(true);
        this.clearFormError();
        
        try {
            // Attempt registration
            const result = await this.performRegistration(userData);
            
            if (result.success) {
                // Registration successful
                this.showSuccess('Account created successfully! Redirecting to login...');
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 2000);
            } else {
                // Registration failed
                this.showFormError(result.message || 'Registration failed. Please try again.');
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.showFormError('Network error. Please check your connection and try again.');
        } finally {
            this.setLoadingState(false);
        }
    }

    /**
     * Perform user registration
     * @param {Object} userData - User registration data
     * @returns {Promise<Object>} Registration result
     */
    async performRegistration(userData) {
        if (this.authManager) {
            return await this.authManager.register(userData);
        } else {
            // Fallback for when auth service is not available
            return new Promise((resolve) => {
                setTimeout(() => {
                    // Mock registration for development
                    if (userData.username && userData.email && userData.password) {
                        resolve({ success: true, message: 'Registration successful' });
                    } else {
                        resolve({ success: false, message: 'Invalid registration data' });
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
        
        // Validate each field
        Object.keys(this.inputs).forEach(key => {
            if (!this.validateField(key)) {
                isValid = false;
            }
        });
        
        // Additional validation for password match
        if (!this.validatePasswordMatch()) {
            isValid = false;
        }
        
        return isValid;
    }

    /**
     * Validate a specific field
     * @param {string} fieldName - Name of the field to validate
     * @returns {boolean} True if field is valid
     */
    validateField(fieldName) {
        const input = this.inputs[fieldName];
        let isValid = true;
        let errorMessage = '';
        
        switch (fieldName) {
            case 'username':
                const username = input.value.trim();
                if (!username) {
                    errorMessage = 'Username is required';
                    isValid = false;
                } else if (!this.patterns.username.test(username)) {
                    errorMessage = 'Username must be 3-20 characters, letters, numbers, and underscores only';
                    isValid = false;
                }
                break;
                
            case 'email':
                const email = input.value.trim();
                if (!email) {
                    errorMessage = 'Email address is required';
                    isValid = false;
                } else if (!this.patterns.email.test(email)) {
                    errorMessage = 'Please enter a valid email address';
                    isValid = false;
                }
                break;
                
            case 'password':
                const password = input.value;
                if (!password) {
                    errorMessage = 'Password is required';
                    isValid = false;
                } else if (!this.patterns.password.test(password)) {
                    errorMessage = 'Password must be at least 8 characters long';
                    isValid = false;
                } else {
                    const strength = this.calculatePasswordStrength(password);
                    if (strength < 2) {
                        errorMessage = 'Password is too weak. Please choose a stronger password';
                        isValid = false;
                    }
                }
                break;
                
            case 'confirmPassword':
                const confirmPassword = input.value;
                const originalPassword = this.inputs.password.value;
                if (!confirmPassword) {
                    errorMessage = 'Please confirm your password';
                    isValid = false;
                } else if (confirmPassword !== originalPassword) {
                    errorMessage = 'Passwords do not match';
                    isValid = false;
                }
                break;
                
            case 'terms':
                if (!input.checked) {
                    errorMessage = 'You must agree to the Terms of Service and Privacy Policy';
                    isValid = false;
                }
                break;
        }
        
        if (isValid) {
            this.clearFieldError(fieldName);
            if (fieldName !== 'terms' && fieldName !== 'confirmPassword') {
                input.classList.add('success');
            }
        } else {
            this.showFieldError(fieldName, errorMessage);
            if (fieldName !== 'terms') {
                input.classList.remove('success');
            }
        }
        
        return isValid;
    }

    /**
     * Validate password match
     * @returns {boolean} True if passwords match
     */
    validatePasswordMatch() {
        const password = this.inputs.password.value;
        const confirmPassword = this.inputs.confirmPassword.value;
        
        if (confirmPassword && password !== confirmPassword) {
            this.showFieldError('confirmPassword', 'Passwords do not match');
            return false;
        } else if (confirmPassword && password === confirmPassword) {
            this.clearFieldError('confirmPassword');
            return true;
        }
        
        return true;
    }

    /**
     * Update password strength indicator
     */
    updatePasswordStrength() {
        const password = this.inputs.password.value;
        const strength = this.calculatePasswordStrength(password);
        const { fill, text } = this.passwordStrength;
        
        // Remove all strength classes
        fill.classList.remove('weak', 'fair', 'good', 'strong');
        text.classList.remove('weak', 'fair', 'good', 'strong');
        
        if (!password) {
            fill.style.width = '0%';
            text.textContent = 'Password strength';
            return;
        }
        
        switch (strength) {
            case 0:
            case 1:
                fill.classList.add('weak');
                text.classList.add('weak');
                text.textContent = 'Weak password';
                break;
            case 2:
                fill.classList.add('fair');
                text.classList.add('fair');
                text.textContent = 'Fair password';
                break;
            case 3:
                fill.classList.add('good');
                text.classList.add('good');
                text.textContent = 'Good password';
                break;
            case 4:
                fill.classList.add('strong');
                text.classList.add('strong');
                text.textContent = 'Strong password';
                break;
        }
    }

    /**
     * Calculate password strength
     * @param {string} password - Password to evaluate
     * @returns {number} Strength score (0-4)
     */
    calculatePasswordStrength(password) {
        let score = 0;
        
        // Length check
        if (password.length >= 8) score++;
        if (password.length >= 12) score++;
        
        // Character variety checks
        if (/[a-z]/.test(password)) score++;
        if (/[A-Z]/.test(password)) score++;
        if (/[0-9]/.test(password)) score++;
        if (/[^A-Za-z0-9]/.test(password)) score++;
        
        // Bonus for very long passwords
        if (password.length >= 16) score++;
        
        // Cap at 4
        return Math.min(score, 4);
    }

    /**
     * Show field-specific error
     * @param {string} fieldName - Name of the field
     * @param {string} message - Error message
     */
    showFieldError(fieldName, message) {
        const input = this.inputs[fieldName];
        const errorElement = this.errorElements[fieldName];
        
        if (input.type !== 'checkbox') {
            input.classList.add('error');
            input.classList.remove('success');
        }
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
        
        if (input.type !== 'checkbox') {
            input.classList.remove('error');
        }
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
        const { register, registerText, registerSpinner } = this.buttons;
        
        if (loading) {
            register.disabled = true;
            registerText.classList.add('hidden');
            registerSpinner.classList.remove('hidden');
        } else {
            register.disabled = false;
            registerText.classList.remove('hidden');
            registerSpinner.classList.add('hidden');
        }
    }

    /**
     * Redirect to dashboard page
     */
    redirectToDashboard() {
        window.location.href = 'dashboard.html';
    }
}

// Initialize registration controller when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new RegisterController();
});

// Export for testing purposes
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RegisterController;