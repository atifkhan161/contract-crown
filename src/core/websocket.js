/**
 * WebSocket Manager
 * Handles real-time communication with the server
 */

class WebSocketManager {
    constructor() {
        this.ws = null;
        this.url = this.getWebSocketURL();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000; // Start with 1 second
        this.maxReconnectDelay = 30000; // Max 30 seconds
        this.heartbeatInterval = null;
        this.heartbeatTimeout = null;
        this.isConnecting = false;
        this.isManualClose = false;
        
        // Event listeners
        this.eventListeners = new Map();
        
        // Message queue for when disconnected
        this.messageQueue = [];
        this.maxQueueSize = 100;
    }

    /**
     * Get WebSocket URL based on current location
     * @returns {string} WebSocket URL
     */
    getWebSocketURL() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        
        // In development, use localhost
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return `${protocol}//localhost:3000/ws`;
        }
        
        // In production, use same host
        return `${protocol}//${host}/ws`;
    }

    /**
     * Connect to WebSocket server
     * @returns {Promise<void>}
     */
    async connect() {
        if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
            return;
        }

        this.isConnecting = true;
        this.isManualClose = false;
        this.emit('connectionChange', 'connecting');

        try {
            this.ws = new WebSocket(this.url);
            this.setupEventHandlers();
            
            // Wait for connection to open or fail
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Connection timeout'));
                }, 10000);

                this.ws.onopen = () => {
                    clearTimeout(timeout);
                    resolve();
                };

                this.ws.onerror = (error) => {
                    clearTimeout(timeout);
                    reject(error);
                };
            });
        } catch (error) {
            this.isConnecting = false;
            this.handleConnectionError(error);
            throw error;
        }
    }

    /**
     * Setup WebSocket event handlers
     */
    setupEventHandlers() {
        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.isConnecting = false;
            this.reconnectAttempts = 0;
            this.reconnectDelay = 1000;
            
            this.emit('connectionChange', 'connected');
            this.emit('connect');
            
            // Start heartbeat
            this.startHeartbeat();
            
            // Send queued messages
            this.flushMessageQueue();
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };

        this.ws.onclose = (event) => {
            console.log('WebSocket disconnected:', event.code, event.reason);
            this.isConnecting = false;
            
            this.stopHeartbeat();
            this.emit('connectionChange', 'disconnected');
            this.emit('disconnect', { code: event.code, reason: event.reason });
            
            // Attempt reconnection if not manually closed
            if (!this.isManualClose && event.code !== 1000) {
                this.scheduleReconnect();
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.emit('error', error);
        };
    }

    /**
     * Handle incoming WebSocket messages
     * @param {Object} data - Parsed message data
     */
    handleMessage(data) {
        const { type, payload } = data;

        switch (type) {
            case 'pong':
                // Heartbeat response
                if (this.heartbeatTimeout) {
                    clearTimeout(this.heartbeatTimeout);
                    this.heartbeatTimeout = null;
                }
                break;
                
            case 'auth_required':
                this.handleAuthRequired();
                break;
                
            case 'auth_success':
                this.emit('authenticated', payload);
                break;
                
            case 'auth_error':
                this.emit('authError', payload);
                break;
                
            default:
                // Emit the message type as an event
                this.emit(type, payload);
                break;
        }
        
        // Always emit a general message event
        this.emit('message', data);
    }

    /**
     * Handle authentication required message
     */
    handleAuthRequired() {
        // Try to authenticate with stored token
        if (typeof AuthManager !== 'undefined') {
            const authManager = new AuthManager();
            const token = authManager.getToken();
            
            if (token) {
                this.send('auth', { token });
            } else {
                this.emit('authRequired');
            }
        } else {
            this.emit('authRequired');
        }
    }

    /**
     * Handle connection errors
     * @param {Error} error - Connection error
     */
    handleConnectionError(error) {
        console.error('WebSocket connection error:', error);
        this.emit('connectionChange', 'disconnected');
        this.scheduleReconnect();
    }

    /**
     * Schedule reconnection attempt
     */
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('Max reconnection attempts reached');
            this.emit('maxReconnectAttemptsReached');
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);
        
        console.log(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
        
        setTimeout(() => {
            if (!this.isManualClose) {
                this.connect().catch(() => {
                    // Connection failed, will be handled by scheduleReconnect
                });
            }
        }, delay);
    }

    /**
     * Start heartbeat mechanism
     */
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.send('ping');
                
                // Set timeout for pong response
                this.heartbeatTimeout = setTimeout(() => {
                    console.log('Heartbeat timeout, closing connection');
                    this.ws.close();
                }, 5000);
            }
        }, 30000); // Send ping every 30 seconds
    }

    /**
     * Stop heartbeat mechanism
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        
        if (this.heartbeatTimeout) {
            clearTimeout(this.heartbeatTimeout);
            this.heartbeatTimeout = null;
        }
    }

    /**
     * Send message to server
     * @param {string} type - Message type
     * @param {Object} payload - Message payload
     */
    send(type, payload = {}) {
        const message = { type, payload };
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            // Queue message for later sending
            this.queueMessage(message);
        }
    }

    /**
     * Queue message for sending when connected
     * @param {Object} message - Message to queue
     */
    queueMessage(message) {
        if (this.messageQueue.length >= this.maxQueueSize) {
            this.messageQueue.shift(); // Remove oldest message
        }
        
        this.messageQueue.push(message);
    }

    /**
     * Send all queued messages
     */
    flushMessageQueue() {
        while (this.messageQueue.length > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = this.messageQueue.shift();
            this.ws.send(JSON.stringify(message));
        }
    }

    /**
     * Disconnect from WebSocket server
     */
    disconnect() {
        this.isManualClose = true;
        this.stopHeartbeat();
        
        if (this.ws) {
            this.ws.close(1000, 'Manual disconnect');
        }
    }

    /**
     * Get current connection status
     * @returns {string} Connection status
     */
    getConnectionStatus() {
        if (!this.ws) {
            return 'disconnected';
        }
        
        switch (this.ws.readyState) {
            case WebSocket.CONNECTING:
                return 'connecting';
            case WebSocket.OPEN:
                return 'connected';
            case WebSocket.CLOSING:
            case WebSocket.CLOSED:
            default:
                return 'disconnected';
        }
    }

    /**
     * Add event listener
     * @param {string} event - Event name
     * @param {Function} callback - Event callback
     */
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        
        this.eventListeners.get(event).push(callback);
    }

    /**
     * Remove event listener
     * @param {string} event - Event name
     * @param {Function} callback - Event callback
     */
    off(event, callback) {
        if (this.eventListeners.has(event)) {
            const listeners = this.eventListeners.get(event);
            const index = listeners.indexOf(callback);
            
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    /**
     * Emit event to listeners
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit(event, data) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in event listener for ${event}:`, error);
                }
            });
        }
    }

    /**
     * Authenticate with the server
     * @param {string} token - Authentication token
     */
    authenticate(token) {
        this.send('auth', { token });
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.WebSocketManager = WebSocketManager;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebSocketManager;
}