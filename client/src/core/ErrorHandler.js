import userFeedbackManager from './UserFeedbackManager.js';

/**
 * Enhanced Error Handler
 * Provides comprehensive error handling with user-friendly messages,
 * retry mechanisms, and fallback workflows
 * 
 * Requirements: 6.1, 6.2, 6.4, 7.3
 */

export class ErrorHandler {
    constructor() {
        this.errorTypes = {
            AUTHENTICATION: 'authentication',
            CONNECTION: 'connection',
            WEBSOCKET: 'websocket',
            API: 'api',
            VALIDATION: 'validation',
            NETWORK: 'network',
            TIMEOUT: 'timeout',
            PERMISSION: 'permission'
        };

        this.retryConfig = {
            maxRetries: 3,
            baseDelay: 1000,
            maxDelay: 10000,
            backoffMultiplier: 2
        };

        this.errorListeners = new Map();
        this.retryAttempts = new Map();
        this.activeRetries = new Set();

        this.setupRetryFeedback();
    }

    /**
     * Handle error with appropriate user feedback and recovery options
     */
    handleError(error, context = {}) {
        const errorInfo = this.categorizeError(error, context);
        const userMessage = this.getUserFriendlyMessage(errorInfo);
        const recoveryOptions = this.getRecoveryOptions(errorInfo);

        console.error('[ErrorHandler] Error occurred:', {
            error,
            context,
            errorInfo,
            userMessage,
            recoveryOptions
        });

        // Show user-friendly error message
        this.showUserFeedback(errorInfo, userMessage, recoveryOptions, context);

        // Emit error event for UI components to handle
        this.emit('error', {
            ...errorInfo,
            userMessage,
            recoveryOptions,
            originalError: error,
            context
        });

        return {
            errorInfo,
            userMessage,
            recoveryOptions
        };
    }

    /**
     * Show user feedback based on error type and context
     */
    showUserFeedback(errorInfo, userMessage, recoveryOptions, context) {
        // Handle specific error types with appropriate feedback
        switch (errorInfo.type) {
            case this.errorTypes.AUTHENTICATION:
                userFeedbackManager.handleAuthError(errorInfo, context.operation || '');
                break;

            case this.errorTypes.WEBSOCKET:
                userFeedbackManager.handleWebsocketError(errorInfo, context.operation || '');
                break;

            case this.errorTypes.API:
                userFeedbackManager.handleApiError(errorInfo, context.operation || '');
                break;

            case this.errorTypes.CONNECTION:
                userFeedbackManager.showConnectionStatus(false, false);
                break;

            default:
                // Show generic error message
                const duration = errorInfo.severity === 'high' ? 0 : 8000;
                userFeedbackManager.showError(userMessage.message, duration);
                break;
        }

        // Handle automatic recovery options
        const automaticOption = recoveryOptions.find(option => option.automatic);
        if (automaticOption) {
            this.executeRecoveryOption(automaticOption, context);
        }
    }

    /**
     * Categorize error based on type and context
     */
    categorizeError(error, context) {
        const errorInfo = {
            type: this.errorTypes.NETWORK,
            severity: 'medium',
            retryable: true,
            fallbackAvailable: false,
            code: null,
            message: error.message || 'An unknown error occurred'
        };

        // Authentication errors
        if (error.message?.includes('authentication') ||
            error.message?.includes('token') ||
            error.message?.includes('unauthorized') ||
            context.type === 'auth') {
            errorInfo.type = this.errorTypes.AUTHENTICATION;
            errorInfo.severity = 'high';
            errorInfo.retryable = false;
            errorInfo.fallbackAvailable = true;
        }

        // Connection errors
        else if (error.message?.includes('connection') ||
            error.message?.includes('connect') ||
            error.name === 'NetworkError' ||
            context.type === 'connection') {
            errorInfo.type = this.errorTypes.CONNECTION;
            errorInfo.severity = 'high';
            errorInfo.retryable = true;
            errorInfo.fallbackAvailable = true;
        }

        // WebSocket specific errors
        else if (error.message?.includes('websocket') ||
            error.message?.includes('socket') ||
            context.type === 'websocket') {
            errorInfo.type = this.errorTypes.WEBSOCKET;
            errorInfo.severity = 'medium';
            errorInfo.retryable = true;
            errorInfo.fallbackAvailable = true;
        }

        // API errors
        else if (error.status || context.type === 'api') {
            errorInfo.type = this.errorTypes.API;
            errorInfo.code = error.status;
            errorInfo.severity = error.status >= 500 ? 'high' : 'medium';
            errorInfo.retryable = error.status >= 500 || error.status === 408;
            errorInfo.fallbackAvailable = true;
        }

        // Timeout errors
        else if (error.message?.includes('timeout') ||
            error.name === 'TimeoutError' ||
            context.type === 'timeout') {
            errorInfo.type = this.errorTypes.TIMEOUT;
            errorInfo.severity = 'medium';
            errorInfo.retryable = true;
            errorInfo.fallbackAvailable = true;
        }

        // Validation errors
        else if (error.message?.includes('validation') ||
            error.message?.includes('invalid') ||
            context.type === 'validation') {
            errorInfo.type = this.errorTypes.VALIDATION;
            errorInfo.severity = 'low';
            errorInfo.retryable = false;
            errorInfo.fallbackAvailable = false;
        }

        // Permission errors
        else if (error.message?.includes('permission') ||
            error.message?.includes('forbidden') ||
            error.status === 403) {
            errorInfo.type = this.errorTypes.PERMISSION;
            errorInfo.severity = 'medium';
            errorInfo.retryable = false;
            errorInfo.fallbackAvailable = false;
        }

        return errorInfo;
    }

    /**
     * Get user-friendly error message
     */
    getUserFriendlyMessage(errorInfo) {
        const messages = {
            [this.errorTypes.AUTHENTICATION]: {
                title: 'Authentication Error',
                message: 'Your session has expired or is invalid. Please log in again.',
                action: 'Redirecting to login...'
            },
            [this.errorTypes.CONNECTION]: {
                title: 'Connection Problem',
                message: 'Unable to connect to the server. Please check your internet connection.',
                action: 'Retrying connection...'
            },
            [this.errorTypes.WEBSOCKET]: {
                title: 'Real-time Connection Issue',
                message: 'Lost connection to real-time updates. Switching to backup mode.',
                action: 'Using backup connection...'
            },
            [this.errorTypes.API]: {
                title: 'Server Error',
                message: errorInfo.code >= 500
                    ? 'The server is experiencing issues. Please try again.'
                    : 'Request failed. Please check your input and try again.',
                action: errorInfo.retryable ? 'Retrying...' : 'Please try again'
            },
            [this.errorTypes.TIMEOUT]: {
                title: 'Request Timeout',
                message: 'The request took too long to complete. Please try again.',
                action: 'Retrying with longer timeout...'
            },
            [this.errorTypes.VALIDATION]: {
                title: 'Invalid Input',
                message: 'Please check your input and try again.',
                action: 'Please correct the errors'
            },
            [this.errorTypes.PERMISSION]: {
                title: 'Access Denied',
                message: 'You don\'t have permission to perform this action.',
                action: 'Contact support if this is unexpected'
            },
            [this.errorTypes.NETWORK]: {
                title: 'Network Error',
                message: 'Network connection problem. Please check your internet connection.',
                action: 'Retrying...'
            }
        };

        return messages[errorInfo.type] || messages[this.errorTypes.NETWORK];
    }

    /**
     * Get recovery options for the error
     */
    getRecoveryOptions(errorInfo) {
        const options = [];

        if (errorInfo.retryable) {
            options.push({
                type: 'retry',
                label: 'Try Again',
                automatic: true,
                delay: this.calculateRetryDelay(errorInfo.type)
            });
        }

        if (errorInfo.fallbackAvailable) {
            options.push({
                type: 'fallback',
                label: 'Use Backup Mode',
                automatic: errorInfo.type === this.errorTypes.WEBSOCKET,
                delay: 0
            });
        }

        if (errorInfo.type === this.errorTypes.AUTHENTICATION) {
            options.push({
                type: 'reauth',
                label: 'Log In Again',
                automatic: true,
                delay: 2000
            });
        }

        if (errorInfo.type === this.errorTypes.CONNECTION) {
            options.push({
                type: 'refresh',
                label: 'Refresh Page',
                automatic: false,
                delay: 0
            });
        }

        // Always provide manual retry option
        options.push({
            type: 'manual',
            label: 'Retry Manually',
            automatic: false,
            delay: 0
        });

        return options;
    }

    /**
     * Execute recovery option
     */
    async executeRecoveryOption(option, context) {
        switch (option.type) {
            case 'retry':
                if (context.retryOperation) {
                    userFeedbackManager.showLoading('retry', 'Retrying...', false);
                    try {
                        await this.executeRetry(context.retryOperation, context);
                        userFeedbackManager.hideLoading('retry');
                        userFeedbackManager.showSuccess('Operation completed successfully');
                    } catch (error) {
                        userFeedbackManager.hideLoading('retry');
                        userFeedbackManager.showError('Retry failed. Please try again manually.');
                    }
                }
                break;

            case 'fallback':
                if (context.fallbackOperation) {
                    userFeedbackManager.showInfo('Switching to backup mode...');
                    try {
                        await context.fallbackOperation();
                        userFeedbackManager.showSuccess('Connected using backup mode');
                    } catch (error) {
                        userFeedbackManager.showError('Backup mode failed. Please refresh the page.');
                    }
                }
                break;

            case 'reauth':
                userFeedbackManager.showWarning('Redirecting to login...', 3000);
                setTimeout(() => {
                    window.location.href = '/login.html';
                }, option.delay);
                break;

            case 'refresh':
                userFeedbackManager.showWarning('Page will refresh in 5 seconds...', 5000);
                setTimeout(() => {
                    window.location.reload();
                }, 5000);
                break;
        }
    }

    /**
     * Execute automatic retry with exponential backoff
     */
    async executeRetry(operation, context = {}) {
        const operationKey = context.key || 'default';

        if (this.activeRetries.has(operationKey)) {
            console.log(`[ErrorHandler] Retry already in progress for ${operationKey}`);
            return false;
        }

        const currentAttempts = this.retryAttempts.get(operationKey) || 0;

        if (currentAttempts >= this.retryConfig.maxRetries) {
            console.log(`[ErrorHandler] Max retries exceeded for ${operationKey}`);
            this.retryAttempts.delete(operationKey);
            this.emit('retryFailed', { operationKey, attempts: currentAttempts });
            return false;
        }

        this.activeRetries.add(operationKey);
        this.retryAttempts.set(operationKey, currentAttempts + 1);

        const delay = this.calculateRetryDelay(operationKey, currentAttempts);

        console.log(`[ErrorHandler] Retrying ${operationKey} (attempt ${currentAttempts + 1}/${this.retryConfig.maxRetries}) after ${delay}ms`);

        this.emit('retryStarted', {
            operationKey,
            attempt: currentAttempts + 1,
            maxAttempts: this.retryConfig.maxRetries,
            delay
        });

        try {
            await this.delay(delay);
            const result = await operation();

            // Success - reset retry count
            this.retryAttempts.delete(operationKey);
            this.activeRetries.delete(operationKey);

            this.emit('retrySucceeded', { operationKey, attempts: currentAttempts + 1 });
            return result;
        } catch (error) {
            this.activeRetries.delete(operationKey);

            console.error(`[ErrorHandler] Retry ${currentAttempts + 1} failed for ${operationKey}:`, error);

            // Try again if we haven't exceeded max retries
            if (currentAttempts + 1 < this.retryConfig.maxRetries) {
                return this.executeRetry(operation, context);
            } else {
                this.retryAttempts.delete(operationKey);
                this.emit('retryFailed', { operationKey, attempts: currentAttempts + 1, error });
                throw error;
            }
        }
    }

    /**
     * Calculate retry delay with exponential backoff
     */
    calculateRetryDelay(operationKey, attempt = 0) {
        const baseDelay = this.retryConfig.baseDelay;
        const backoffDelay = baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt);
        const jitter = Math.random() * 0.1 * backoffDelay; // Add 10% jitter

        return Math.min(backoffDelay + jitter, this.retryConfig.maxDelay);
    }

    /**
     * Reset retry attempts for an operation
     */
    resetRetryAttempts(operationKey) {
        this.retryAttempts.delete(operationKey);
        this.activeRetries.delete(operationKey);
    }

    /**
     * Check if operation is currently being retried
     */
    isRetrying(operationKey) {
        return this.activeRetries.has(operationKey);
    }

    /**
     * Get current retry attempt count
     */
    getRetryAttempts(operationKey) {
        return this.retryAttempts.get(operationKey) || 0;
    }

    /**
     * Add error event listener
     */
    on(event, callback) {
        if (!this.errorListeners.has(event)) {
            this.errorListeners.set(event, []);
        }
        this.errorListeners.get(event).push(callback);
    }

    /**
     * Remove error event listener
     */
    off(event, callback) {
        if (this.errorListeners.has(event)) {
            const listeners = this.errorListeners.get(event);
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    /**
     * Emit error event
     */
    emit(event, data) {
        if (this.errorListeners.has(event)) {
            this.errorListeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`[ErrorHandler] Error in event listener for ${event}:`, error);
                }
            });
        }
    }

    /**
     * Utility method to create delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Create wrapped function with automatic error handling
     */
    withErrorHandling(fn, context = {}) {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                return this.handleError(error, context);
            }
        };
    }

    /**
     * Create wrapped function with automatic retry
     */
    withRetry(fn, context = {}) {
        return async (...args) => {
            return this.executeRetry(() => fn(...args), context);
        };
    }

    /**
     * Setup retry feedback handlers
     */
    setupRetryFeedback() {
        this.on('retryStarted', ({ operationKey, attempt, maxAttempts, delay }) => {
            userFeedbackManager.showInfo(
                `Retrying ${operationKey} (${attempt}/${maxAttempts})...`,
                delay + 1000
            );
        });

        this.on('retrySucceeded', ({ operationKey, attempts }) => {
            userFeedbackManager.showSuccess(`${operationKey} completed after ${attempts} attempt${attempts > 1 ? 's' : ''}`);
        });

        this.on('retryFailed', ({ operationKey, attempts }) => {
            userFeedbackManager.showError(`${operationKey} failed after ${attempts} attempts. Please try again manually.`, 0);
        });
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        this.errorListeners.clear();
        this.retryAttempts.clear();
        this.activeRetries.clear();
    }
}

// Create global instance
const errorHandler = new ErrorHandler();

export default errorHandler;