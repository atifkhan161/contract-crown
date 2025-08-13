/**
 * Centralized Error Handler
 * Handles websocket connection errors and session expiration
 * Forces logout and redirect to login page when critical errors occur
 */

export class ErrorHandler {
    constructor(authManager) {
        this.authManager = authManager;
        this.isHandlingError = false;
        this.criticalErrors = new Set([
            'TransportError: websocket error',
            'Connection error: TransportError: websocket error',
            'Session expired or invalid',
            'Connection error: Error: Session expired or invalid',
            'Authentication failed',
            'auth_error',
            'Authentication expired',
            'Token expired',
            'Invalid token',
            'Unauthorized'
        ]);
    }

    /**
     * Check if an error is critical and requires logout
     * @param {string|Error} error - Error message or Error object
     * @returns {boolean} True if error is critical
     */
    isCriticalError(error) {
        const errorMessage = typeof error === 'string' ? error : error?.message || '';
        
        // Check for exact matches
        if (this.criticalErrors.has(errorMessage)) {
            return true;
        }

        // Check for partial matches
        const lowerError = errorMessage.toLowerCase();
        return (
            lowerError.includes('websocket error') ||
            lowerError.includes('session expired') ||
            lowerError.includes('session invalid') ||
            lowerError.includes('authentication failed') ||
            lowerError.includes('authentication expired') ||
            lowerError.includes('token expired') ||
            lowerError.includes('invalid token') ||
            lowerError.includes('unauthorized') ||
            lowerError.includes('auth_error')
        );
    }

    /**
     * Handle critical errors by forcing logout and redirect
     * @param {string|Error} error - Error message or Error object
     * @param {string} source - Source of the error (e.g., 'websocket', 'http', 'auth')
     */
    handleCriticalError(error, source = 'unknown') {
        // Prevent multiple simultaneous error handling
        if (this.isHandlingError) {
            console.log('[ErrorHandler] Already handling critical error, ignoring duplicate');
            return;
        }

        const errorMessage = typeof error === 'string' ? error : error?.message || 'Unknown error';
        
        if (!this.isCriticalError(errorMessage)) {
            console.log('[ErrorHandler] Error is not critical, not forcing logout:', errorMessage);
            return;
        }

        console.error(`[ErrorHandler] Critical error detected from ${source}:`, errorMessage);
        
        this.isHandlingError = true;
        
        // Show user-friendly message
        this.showLogoutMessage(errorMessage, source);
        
        // Force logout and redirect after a short delay
        setTimeout(() => {
            this.forceLogoutAndRedirect();
        }, 2000);
    }

    /**
     * Show logout message to user
     * @param {string} errorMessage - Error message
     * @param {string} source - Source of the error
     */
    showLogoutMessage(errorMessage, source) {
        // Create or update logout notification
        let notification = document.getElementById('critical-error-notification');
        
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'critical-error-notification';
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: #dc3545;
                color: white;
                padding: 15px 20px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                z-index: 10000;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                max-width: 400px;
                text-align: center;
                animation: slideDown 0.3s ease-out;
            `;
            
            // Add animation keyframes
            if (!document.getElementById('error-handler-styles')) {
                const style = document.createElement('style');
                style.id = 'error-handler-styles';
                style.textContent = `
                    @keyframes slideDown {
                        from { transform: translateX(-50%) translateY(-20px); opacity: 0; }
                        to { transform: translateX(-50%) translateY(0); opacity: 1; }
                    }
                `;
                document.head.appendChild(style);
            }
            
            document.body.appendChild(notification);
        }
        
        // Determine user-friendly message based on error type
        let userMessage = 'Session expired. Redirecting to login...';
        
        if (errorMessage.toLowerCase().includes('websocket')) {
            userMessage = 'Connection lost. Redirecting to login...';
        } else if (errorMessage.toLowerCase().includes('authentication')) {
            userMessage = 'Authentication failed. Redirecting to login...';
        }
        
        notification.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 5px;">${userMessage}</div>
            <div style="font-size: 12px; opacity: 0.9;">Please log in again to continue</div>
        `;
    }

    /**
     * Force logout and redirect to login page
     */
    async forceLogoutAndRedirect() {
        try {
            console.log('[ErrorHandler] Forcing logout and redirect to login');
            
            // Clear authentication data
            if (this.authManager) {
                await this.authManager.logout();
            }
            
            // Clear any stored session data
            this.clearAllSessionData();
            
            // Redirect to login page
            window.location.href = '/login.html';
            
        } catch (logoutError) {
            console.error('[ErrorHandler] Error during forced logout:', logoutError);
            
            // Force redirect even if logout fails
            this.clearAllSessionData();
            window.location.href = '/login.html';
        }
    }

    /**
     * Clear all session data from storage
     */
    clearAllSessionData() {
        try {
            // Clear localStorage
            const localStorageKeys = Object.keys(localStorage);
            localStorageKeys.forEach(key => {
                if (key.startsWith('auth_') || key.startsWith('game_') || key.startsWith('room_')) {
                    localStorage.removeItem(key);
                }
            });
            
            // Clear sessionStorage
            const sessionStorageKeys = Object.keys(sessionStorage);
            sessionStorageKeys.forEach(key => {
                if (key.startsWith('auth_') || key.startsWith('game_') || key.startsWith('room_')) {
                    sessionStorage.removeItem(key);
                }
            });
            
            console.log('[ErrorHandler] Session data cleared');
        } catch (error) {
            console.error('[ErrorHandler] Error clearing session data:', error);
        }
    }

    /**
     * Handle websocket errors specifically
     * @param {string|Error} error - Websocket error
     * @param {Object} socket - Socket instance (optional)
     */
    handleWebSocketError(error, socket = null) {
        console.error('[ErrorHandler] WebSocket error:', error);
        
        // Disconnect socket if provided
        if (socket && typeof socket.disconnect === 'function') {
            try {
                socket.disconnect();
            } catch (disconnectError) {
                console.error('[ErrorHandler] Error disconnecting socket:', disconnectError);
            }
        }
        
        this.handleCriticalError(error, 'websocket');
    }

    /**
     * Handle HTTP authentication errors
     * @param {Response} response - HTTP response object
     * @param {string} url - Request URL
     */
    handleHttpAuthError(response, url = '') {
        if (response.status === 401 || response.status === 403) {
            const error = `HTTP ${response.status}: Authentication failed for ${url}`;
            this.handleCriticalError(error, 'http');
        }
    }

    /**
     * Handle general authentication errors
     * @param {string|Error} error - Authentication error
     */
    handleAuthError(error) {
        this.handleCriticalError(error, 'auth');
    }

    /**
     * Reset error handling state (for testing or recovery)
     */
    reset() {
        this.isHandlingError = false;
        
        // Remove notification if it exists
        const notification = document.getElementById('critical-error-notification');
        if (notification) {
            notification.remove();
        }
    }

    /**
     * Add custom critical error pattern
     * @param {string} pattern - Error pattern to add
     */
    addCriticalErrorPattern(pattern) {
        this.criticalErrors.add(pattern);
    }

    /**
     * Remove critical error pattern
     * @param {string} pattern - Error pattern to remove
     */
    removeCriticalErrorPattern(pattern) {
        this.criticalErrors.delete(pattern);
    }
}

// Export singleton instance
let errorHandlerInstance = null;

export function getErrorHandler(authManager = null) {
    if (!errorHandlerInstance && authManager) {
        errorHandlerInstance = new ErrorHandler(authManager);
    }
    return errorHandlerInstance;
}

// Global error handler for unhandled promise rejections and errors
if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (event) => {
        const error = event.reason;
        if (errorHandlerInstance && errorHandlerInstance.isCriticalError(error)) {
            console.error('[ErrorHandler] Unhandled promise rejection with critical error:', error);
            errorHandlerInstance.handleCriticalError(error, 'unhandled-promise');
        }
    });

    window.addEventListener('error', (event) => {
        const error = event.error || event.message;
        if (errorHandlerInstance && errorHandlerInstance.isCriticalError(error)) {
            console.error('[ErrorHandler] Global error with critical error:', error);
            errorHandlerInstance.handleCriticalError(error, 'global');
        }
    });
}