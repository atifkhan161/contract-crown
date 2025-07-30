/**
 * Integration Example: Error Handling and User Feedback
 * Shows how to use ErrorHandler and UserFeedbackManager together
 * for comprehensive error handling with user-friendly feedback
 * 
 * Requirements: 6.1, 6.2, 6.4
 */

import errorHandler from './ErrorHandler.js';
import userFeedbackManager from './UserFeedbackManager.js';

/**
 * Example: Handling WebSocket connection errors
 */
export function handleWebSocketConnection() {
    try {
        // Simulate WebSocket connection attempt
        const socket = new WebSocket('ws://localhost:3001');
        
        socket.onopen = () => {
            userFeedbackManager.showConnectionStatus(true, false);
        };
        
        socket.onerror = (error) => {
            errorHandler.handleError(error, {
                type: 'websocket',
                operation: 'connection',
                retryOperation: () => handleWebSocketConnection(),
                fallbackOperation: () => switchToHttpPolling()
            });
        };
        
        socket.onclose = () => {
            userFeedbackManager.showConnectionStatus(false, true);
        };
        
    } catch (error) {
        errorHandler.handleError(error, {
            type: 'connection',
            operation: 'websocket-setup'
        });
    }
}

/**
 * Example: Handling API requests with retry
 */
export async function makeApiRequest(url, options = {}) {
    const operation = async () => {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        
        if (!response.ok) {
            const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
            error.status = response.status;
            throw error;
        }
        
        return response.json();
    };
    
    try {
        userFeedbackManager.showLoading('api-request', 'Loading...', false);
        
        const result = await errorHandler.executeRetry(operation, {
            key: `api-${url}`,
            type: 'api'
        });
        
        userFeedbackManager.hideLoading('api-request');
        userFeedbackManager.showSuccess('Request completed successfully');
        
        return result;
        
    } catch (error) {
        userFeedbackManager.hideLoading('api-request');
        
        errorHandler.handleError(error, {
            type: 'api',
            operation: 'api-request',
            retryOperation: () => makeApiRequest(url, options)
        });
        
        throw error;
    }
}

/**
 * Example: Handling room operations with fallback
 */
export async function joinRoom(roomId, userId) {
    try {
        userFeedbackManager.showLoading('join-room', 'Joining room...', true);
        
        // Try WebSocket first
        const result = await joinRoomViaWebSocket(roomId, userId);
        
        userFeedbackManager.hideLoading('join-room');
        userFeedbackManager.showSuccess('Successfully joined room!');
        
        return result;
        
    } catch (error) {
        userFeedbackManager.hideLoading('join-room');
        
        // Handle error with fallback to HTTP API
        errorHandler.handleError(error, {
            type: 'websocket',
            operation: 'join-room',
            retryOperation: () => joinRoomViaWebSocket(roomId, userId),
            fallbackOperation: () => joinRoomViaHttp(roomId, userId)
        });
        
        throw error;
    }
}

/**
 * Example: Handling authentication errors
 */
export async function authenticateUser(credentials) {
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials)
        });
        
        if (response.status === 401) {
            const error = new Error('Invalid credentials');
            error.status = 401;
            throw error;
        }
        
        if (!response.ok) {
            const error = new Error('Authentication failed');
            error.status = response.status;
            throw error;
        }
        
        const data = await response.json();
        userFeedbackManager.showSuccess('Login successful!');
        
        return data;
        
    } catch (error) {
        errorHandler.handleError(error, {
            type: 'authentication',
            operation: 'login'
        });
        
        throw error;
    }
}

/**
 * Example: Handling validation errors
 */
export function validateRoomCode(roomCode) {
    try {
        if (!roomCode || roomCode.length < 4) {
            const error = new Error('Room code must be at least 4 characters');
            throw error;
        }
        
        if (!/^[A-Z0-9]+$/.test(roomCode)) {
            const error = new Error('Room code can only contain letters and numbers');
            throw error;
        }
        
        return true;
        
    } catch (error) {
        errorHandler.handleError(error, {
            type: 'validation',
            operation: 'room-code-validation'
        });
        
        return false;
    }
}

/**
 * Example: Setting up global error handlers
 */
export function setupGlobalErrorHandling() {
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
        errorHandler.handleError(event.reason, {
            type: 'network',
            operation: 'unhandled-promise'
        });
    });
    
    // Handle global JavaScript errors
    window.addEventListener('error', (event) => {
        errorHandler.handleError(event.error, {
            type: 'network',
            operation: 'global-error'
        });
    });
    
    // Set up error handler event listeners
    errorHandler.on('error', (errorData) => {
        console.log('Error handled:', errorData);
    });
    
    errorHandler.on('retryStarted', (retryData) => {
        console.log('Retry started:', retryData);
    });
    
    errorHandler.on('retrySucceeded', (retryData) => {
        console.log('Retry succeeded:', retryData);
    });
    
    errorHandler.on('retryFailed', (retryData) => {
        console.log('Retry failed:', retryData);
    });
}

// Helper functions (would be implemented elsewhere)
async function joinRoomViaWebSocket(roomId, userId) {
    // WebSocket implementation
    throw new Error('WebSocket not available');
}

async function joinRoomViaHttp(roomId, userId) {
    // HTTP API implementation
    return makeApiRequest('/api/rooms/join', {
        method: 'POST',
        body: JSON.stringify({ roomId, userId })
    });
}

function switchToHttpPolling() {
    // Switch to HTTP polling implementation
    userFeedbackManager.showInfo('Switched to backup connection mode');
}

// Initialize global error handling when module loads
if (typeof window !== 'undefined') {
    setupGlobalErrorHandling();
}