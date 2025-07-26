/**
 * WebSocket Manager
 * Handles real-time communication with the server using Socket.IO
 */

class WebSocketManager {
    constructor() {
        this.socket = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000; // Start with 1 second
        this.maxReconnectDelay = 30000; // Max 30 seconds
        this.isConnecting = false;
        this.isManualClose = false;
        
        // Event listeners
        this.eventListeners = new Map();
        
        // Message queue for when disconnected
        this.messageQueue = [];
        this.maxQueueSize = 100;
    }

    /**
     * Get Socket.IO connection options
     * @returns {Object} Socket.IO options
     */
    getSocketOptions() {
        // Use same host and port as the current page
        const protocol = window.location.protocol;
        const host = window.location.host;
        
        return {
            // Let Socket.IO handle the URL automatically based on current location
            forceNew: false,
            reconnection: false, // We'll handle reconnection manually
            timeout: 10000,
            transports: ['websocket', 'polling']
        };
    }

    /**
     * Connect to WebSocket server
     * @returns {Promise<void>}
     */
    async connect() {
        if (this.socket && this.socket.connected) {
            return;
        }

        this.isConnecting = true;
        this.isManualClose = false;
        this.emit('connectionChange', 'connecting');

        try {
            // Check if Socket.IO client is available
            if (typeof io === 'undefined') {
                throw new Error('Socket.IO client library not loaded');
            }

            // Create Socket.IO connection with dynamic options
            const options = this.getSocketOptions();
            this.socket = io(options);
            this.setupEventHandlers();
            
            // Wait for connection to establish
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Connection timeout'));
                }, 10000);

                this.socket.on('connect', () => {
                    clearTimeout(timeout);
                    resolve();
                });

                this.socket.on('connect_error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
            });
        } catch (error) {
            this.isConnecting = false;
            this.handleConnectionError(error);
            throw error;
        }
    }

    /**
     * Setup Socket.IO event handlers
     */
    setupEventHandlers() {
        this.socket.on('connect', () => {
            console.log('Socket.IO connected');
            this.isConnecting = false;
            this.reconnectAttempts = 0;
            this.reconnectDelay = 1000;
            
            this.emit('connectionChange', 'connected');
            this.emit('connect');
            
            // Send queued messages
            this.flushMessageQueue();
        });

        this.socket.on('disconnect', (reason) => {
            console.log('Socket.IO disconnected:', reason);
            this.isConnecting = false;
            
            this.emit('connectionChange', 'disconnected');
            this.emit('disconnect', { reason });
            
            // Attempt reconnection if not manually closed
            if (!this.isManualClose && reason !== 'io client disconnect') {
                this.scheduleReconnect();
            }
        });

        this.socket.on('connect_error', (error) => {
            console.error('Socket.IO connection error:', error);
            this.emit('error', error);
            this.handleConnectionError(error);
        });

        // Handle custom message events
        this.socket.on('message', (data) => {
            this.handleMessage(data);
        });

        // Handle authentication events
        this.socket.on('auth_required', () => {
            this.handleAuthRequired();
        });

        this.socket.on('auth_success', (payload) => {
            this.emit('authenticated', payload);
        });

        this.socket.on('auth_error', (payload) => {
            this.emit('authError', payload);
        });

        // Handle game-specific events
        this.socket.on('game_update', (data) => {
            this.emit('gameUpdate', data);
        });

        this.socket.on('room_update', (data) => {
            this.emit('roomUpdate', data);
        });

        this.socket.on('player_joined', (data) => {
            this.emit('playerJoined', data);
        });

        this.socket.on('player_left', (data) => {
            this.emit('playerLeft', data);
        });
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
     * Send message to server
     * @param {string} type - Message type
     * @param {Object} payload - Message payload
     */
    send(type, payload = {}) {
        if (this.socket && this.socket.connected) {
            this.socket.emit(type, payload);
        } else {
            // Queue message for later sending
            this.queueMessage({ type, payload });
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
        while (this.messageQueue.length > 0 && this.socket && this.socket.connected) {
            const message = this.messageQueue.shift();
            this.socket.emit(message.type, message.payload);
        }
    }

    /**
     * Disconnect from WebSocket server
     */
    disconnect() {
        this.isManualClose = true;
        
        if (this.socket) {
            this.socket.disconnect();
        }
    }

    /**
     * Get current connection status
     * @returns {string} Connection status
     */
    getConnectionStatus() {
        if (!this.socket) {
            return 'disconnected';
        }
        
        if (this.socket.connected) {
            return 'connected';
        } else if (this.isConnecting) {
            return 'connecting';
        } else {
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