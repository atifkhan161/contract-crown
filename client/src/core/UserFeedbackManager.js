/**
 * User Feedback Manager
 * Handles user-friendly error messages, loading states, and notifications
 * 
 * Requirements: 6.1, 6.2, 6.4
 */

export class UserFeedbackManager {
    constructor() {
        this.notifications = new Map();
        this.loadingStates = new Map();
        this.notificationCounter = 0;
        this.defaultDuration = 5000; // 5 seconds
        this.maxNotifications = 5;
        
        this.init();
    }

    /**
     * Initialize the feedback manager
     */
    init() {
        this.createNotificationContainer();
        this.setupGlobalErrorHandler();
    }

    /**
     * Create notification container in DOM
     */
    createNotificationContainer() {
        if (document.getElementById('notification-container')) return;
        
        const container = document.createElement('div');
        container.id = 'notification-container';
        container.className = 'notification-container';
        container.innerHTML = `
            <style>
                .notification-container {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 10000;
                    max-width: 400px;
                }
                .notification {
                    background: #333;
                    color: white;
                    padding: 12px 16px;
                    margin-bottom: 8px;
                    border-radius: 4px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                    animation: slideIn 0.3s ease-out;
                    position: relative;
                    word-wrap: break-word;
                }
                .notification.error {
                    background: #dc3545;
                }
                .notification.warning {
                    background: #ffc107;
                    color: #212529;
                }
                .notification.success {
                    background: #28a745;
                }
                .notification.info {
                    background: #17a2b8;
                }
                .notification-close {
                    position: absolute;
                    top: 4px;
                    right: 8px;
                    background: none;
                    border: none;
                    color: inherit;
                    cursor: pointer;
                    font-size: 16px;
                    opacity: 0.7;
                }
                .notification-close:hover {
                    opacity: 1;
                }
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                .loading-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 9999;
                }
                .loading-spinner {
                    width: 40px;
                    height: 40px;
                    border: 4px solid #f3f3f3;
                    border-top: 4px solid #3498db;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .loading-text {
                    color: white;
                    margin-top: 16px;
                    font-size: 16px;
                }
            </style>
        `;
        document.body.appendChild(container);
    }

    /**
     * Setup global error handler for unhandled errors
     */
    setupGlobalErrorHandler() {
        window.addEventListener('error', (event) => {
            this.showError('An unexpected error occurred. Please try again.');
            console.error('Global error:', event.error);
        });

        window.addEventListener('unhandledrejection', (event) => {
            this.showError('A network or processing error occurred. Please try again.');
            console.error('Unhandled promise rejection:', event.reason);
        });
    }

    /**
     * Show notification to user
     * @param {string} message - Message to display
     * @param {string} type - Type: 'error', 'warning', 'success', 'info'
     * @param {number} duration - Duration in ms (0 for persistent)
     * @param {Object} options - Additional options
     */
    showNotification(message, type = 'info', duration = null, options = {}) {
        const id = ++this.notificationCounter;
        const actualDuration = duration !== null ? duration : this.defaultDuration;
        
        // Limit number of notifications
        if (this.notifications.size >= this.maxNotifications) {
            const oldestId = Math.min(...this.notifications.keys());
            this.removeNotification(oldestId);
        }

        const notification = {
            id,
            message,
            type,
            duration: actualDuration,
            timestamp: Date.now(),
            ...options
        };

        this.notifications.set(id, notification);
        this.renderNotification(notification);

        // Auto-remove after duration
        if (actualDuration > 0) {
            setTimeout(() => {
                this.removeNotification(id);
            }, actualDuration);
        }

        return id;
    }

    /**
     * Show error notification
     */
    showError(message, duration = 8000) {
        return this.showNotification(message, 'error', duration);
    }

    /**
     * Show warning notification
     */
    showWarning(message, duration = 6000) {
        return this.showNotification(message, 'warning', duration);
    }

    /**
     * Show success notification
     */
    showSuccess(message, duration = 4000) {
        return this.showNotification(message, 'success', duration);
    }

    /**
     * Show info notification
     */
    showInfo(message, duration = 5000) {
        return this.showNotification(message, 'info', duration);
    }

    /**
     * Render notification in DOM
     */
    renderNotification(notification) {
        const container = document.getElementById('notification-container');
        if (!container) return;

        const element = document.createElement('div');
        element.className = `notification ${notification.type}`;
        element.id = `notification-${notification.id}`;
        element.innerHTML = `
            ${notification.message}
            <button class="notification-close" onclick="window.userFeedbackManager?.removeNotification(${notification.id})">&times;</button>
        `;

        container.appendChild(element);
    }

    /**
     * Remove notification
     */
    removeNotification(id) {
        const element = document.getElementById(`notification-${id}`);
        if (element) {
            element.style.animation = 'slideIn 0.3s ease-out reverse';
            setTimeout(() => {
                element.remove();
            }, 300);
        }
        this.notifications.delete(id);
    }

    /**
     * Clear all notifications
     */
    clearAllNotifications() {
        this.notifications.clear();
        const container = document.getElementById('notification-container');
        if (container) {
            const notifications = container.querySelectorAll('.notification');
            notifications.forEach(notification => notification.remove());
        }
    }

    /**
     * Show loading state
     * @param {string} key - Unique key for this loading state
     * @param {string} message - Loading message
     * @param {boolean} overlay - Show full screen overlay
     */
    showLoading(key, message = 'Loading...', overlay = false) {
        const loadingState = {
            key,
            message,
            overlay,
            timestamp: Date.now()
        };

        this.loadingStates.set(key, loadingState);

        if (overlay) {
            this.renderLoadingOverlay(loadingState);
        } else {
            this.renderLoadingIndicator(loadingState);
        }
    }

    /**
     * Hide loading state
     */
    hideLoading(key) {
        const loadingState = this.loadingStates.get(key);
        if (!loadingState) return;

        this.loadingStates.delete(key);

        if (loadingState.overlay) {
            this.removeLoadingOverlay(key);
        } else {
            this.removeLoadingIndicator(key);
        }
    }

    /**
     * Render full screen loading overlay
     */
    renderLoadingOverlay(loadingState) {
        // Remove existing overlay for this key
        this.removeLoadingOverlay(loadingState.key);

        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.id = `loading-overlay-${loadingState.key}`;
        overlay.innerHTML = `
            <div>
                <div class="loading-spinner"></div>
                <div class="loading-text">${loadingState.message}</div>
            </div>
        `;

        document.body.appendChild(overlay);
    }

    /**
     * Remove loading overlay
     */
    removeLoadingOverlay(key) {
        const overlay = document.getElementById(`loading-overlay-${key}`);
        if (overlay) {
            overlay.remove();
        }
    }

    /**
     * Render inline loading indicator
     */
    renderLoadingIndicator(loadingState) {
        // This would typically be implemented to show loading states
        // in specific UI components rather than full screen
        console.log(`Loading: ${loadingState.message}`);
    }

    /**
     * Remove inline loading indicator
     */
    removeLoadingIndicator(key) {
        console.log(`Loading complete: ${key}`);
    }

    /**
     * Handle websocket connection errors
     */
    handleWebsocketError(error, context = '') {
        console.error('Websocket error:', error, context);
        
        const contextMessage = context ? ` (${context})` : '';
        this.showError(`Connection issue${contextMessage}. Trying to reconnect...`, 6000);
    }

    /**
     * Handle authentication errors
     */
    handleAuthError(error, context = '') {
        console.error('Auth error:', error, context);
        
        this.showError('Authentication failed. Please refresh the page and try again.', 0);
    }

    /**
     * Handle API errors
     */
    handleApiError(error, context = '') {
        console.error('API error:', error, context);
        
        let message = 'An error occurred. Please try again.';
        
        if (error.status === 401) {
            message = 'Session expired. Please refresh the page.';
        } else if (error.status === 403) {
            message = 'Access denied. Please check your permissions.';
        } else if (error.status === 404) {
            message = 'Resource not found. Please refresh the page.';
        } else if (error.status >= 500) {
            message = 'Server error. Please try again in a moment.';
        } else if (error.message) {
            message = error.message;
        }

        const contextMessage = context ? ` (${context})` : '';
        this.showError(`${message}${contextMessage}`, 8000);
    }

    /**
     * Handle room operation errors
     */
    handleRoomError(error, operation = '') {
        console.error('Room error:', error, operation);
        
        let message = 'Room operation failed. Please try again.';
        
        if (operation === 'join') {
            message = 'Failed to join room. Please check the room code and try again.';
        } else if (operation === 'ready') {
            message = 'Failed to update ready status. Please try again.';
        } else if (operation === 'team') {
            message = 'Failed to update team assignment. Please try again.';
        } else if (operation === 'start') {
            message = 'Failed to start game. Please ensure all players are ready.';
        }

        this.showError(message, 6000);
    }

    /**
     * Show connection status
     */
    showConnectionStatus(isConnected, isReconnecting = false) {
        if (isReconnecting) {
            this.showWarning('Reconnecting...', 0);
        } else if (isConnected) {
            this.clearNotificationsByType('warning');
            this.showSuccess('Connected', 2000);
        } else {
            this.showError('Disconnected. Attempting to reconnect...', 0);
        }
    }

    /**
     * Clear notifications by type
     */
    clearNotificationsByType(type) {
        const toRemove = [];
        for (const [id, notification] of this.notifications) {
            if (notification.type === type) {
                toRemove.push(id);
            }
        }
        toRemove.forEach(id => this.removeNotification(id));
    }

    /**
     * Show retry prompt for failed operations
     */
    showRetryPrompt(message, retryCallback, cancelCallback = null) {
        const id = this.showNotification(
            `${message} <button onclick="window.userFeedbackManager.handleRetry(${this.notificationCounter}, '${retryCallback.name}')">Retry</button>`,
            'warning',
            0,
            { retryCallback, cancelCallback }
        );
        return id;
    }

    /**
     * Handle retry action
     */
    handleRetry(notificationId, callbackName) {
        const notification = this.notifications.get(notificationId);
        if (notification && notification.retryCallback) {
            this.removeNotification(notificationId);
            notification.retryCallback();
        }
    }

    /**
     * Get current loading states
     */
    getLoadingStates() {
        return Array.from(this.loadingStates.values());
    }

    /**
     * Check if any loading state is active
     */
    isLoading(key = null) {
        if (key) {
            return this.loadingStates.has(key);
        }
        return this.loadingStates.size > 0;
    }

    /**
     * Get notification count by type
     */
    getNotificationCount(type = null) {
        if (type) {
            return Array.from(this.notifications.values()).filter(n => n.type === type).length;
        }
        return this.notifications.size;
    }
}
/
/ Create global instance
const userFeedbackManager = new UserFeedbackManager();

// Make it available globally for HTML onclick handlers
if (typeof window !== 'undefined') {
    window.userFeedbackManager = userFeedbackManager;
}

export default userFeedbackManager;
export { UserFeedbackManager };