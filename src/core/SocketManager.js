/**
 * Socket Manager
 * Handles WebSocket connections and real-time communication
 */

export class SocketManager {
    constructor(authManager = null) {
        this.socket = null;
        this.eventListeners = new Map();
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.authManager = authManager;
    }

    /**
     * Connect to the WebSocket server
     */
    async connect() {
        return new Promise((resolve, reject) => {
            try {
                // Get auth token from AuthManager
                const token = this.authManager ? this.authManager.getToken() : null;
                if (!token) {
                    throw new Error('No authentication token found');
                }

                // Initialize socket connection
                this.socket = io({
                    auth: {
                        token: token
                    },
                    transports: ['websocket', 'polling']
                });

                // Connection event handlers
                this.socket.on('connect', () => {
                    console.log('Socket connected');
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this.emit('connect');
                    resolve();
                });

                this.socket.on('disconnect', (reason) => {
                    console.log('Socket disconnected:', reason);
                    this.isConnected = false;
                    this.emit('disconnect', reason);
                    
                    // Attempt to reconnect if not a manual disconnect
                    if (reason !== 'io client disconnect') {
                        this.handleReconnect();
                    }
                });

                this.socket.on('connect_error', (error) => {
                    console.error('Socket connection error:', error);
                    this.isConnected = false;
                    
                    if (this.reconnectAttempts === 0) {
                        // First connection attempt failed
                        reject(error);
                    } else {
                        this.handleReconnect();
                    }
                });

                // Authentication events
                this.socket.on('auth_error', (error) => {
                    console.error('Socket authentication error:', error);
                    this.disconnect();
                    // Redirect to login if auth fails
                    window.location.href = 'login.html';
                });

                // Set up event forwarding
                this.setupEventForwarding();

            } catch (error) {
                console.error('Socket connection setup error:', error);
                reject(error);
            }
        });
    }

    /**
     * Disconnect from the WebSocket server
     */
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.isConnected = false;
    }

    /**
     * Handle reconnection attempts
     */
    handleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            this.emit('reconnect_failed');
            return;
        }

        this.reconnectAttempts++;
        this.emit('reconnecting', this.reconnectAttempts);

        setTimeout(() => {
            if (!this.isConnected && this.socket) {
                console.log(`Reconnection attempt ${this.reconnectAttempts}`);
                this.socket.connect();
            }
        }, this.reconnectDelay * this.reconnectAttempts);
    }

    /**
     * Set up event forwarding from socket to local event system
     */
    setupEventForwarding() {
        // Room events
        this.socket.on('roomsUpdated', (data) => this.emit('roomsUpdated', data));
        this.socket.on('roomCreated', (data) => this.emit('roomCreated', data));
        this.socket.on('roomJoined', (data) => this.emit('roomJoined', data));
        this.socket.on('roomLeft', (data) => this.emit('roomLeft', data));
        this.socket.on('roomDeleted', (data) => this.emit('roomDeleted', data));
        this.socket.on('roomError', (data) => this.emit('roomError', data));
        
        // Player events
        this.socket.on('playerJoined', (data) => this.emit('playerJoined', data));
        this.socket.on('playerLeft', (data) => this.emit('playerLeft', data));
        this.socket.on('playerReadyStatusChanged', (data) => this.emit('playerReadyStatusChanged', data));
        this.socket.on('teamsFormed', (data) => this.emit('teamsFormed', data));
        
        // Game events
        this.socket.on('gameStarted', (data) => this.emit('gameStarted', data));
        this.socket.on('gameStarting', (data) => this.emit('gameStarting', data));
        this.socket.on('gameEnded', (data) => this.emit('gameEnded', data));
        this.socket.on('gameStateUpdated', (data) => this.emit('gameStateUpdated', data));
        this.socket.on('roomUpdated', (data) => this.emit('roomUpdated', data));
        
        // User events
        this.socket.on('userStatsUpdated', (data) => this.emit('userStatsUpdated', data));
        
        // Chat events
        this.socket.on('chatMessage', (data) => this.emit('chatMessage', data));
        
        // Error events
        this.socket.on('error', (data) => this.emit('error', data));
    }

    /**
     * Emit an event to the server
     */
    emitToServer(event, data) {
        if (this.socket && this.isConnected) {
            this.socket.emit(event, data);
        } else {
            console.warn('Cannot emit event - socket not connected:', event);
        }
    }

    /**
     * Add event listener
     */
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    /**
     * Remove event listener
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
     * Emit event to local listeners
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
     * Check if socket is connected
     */
    isSocketConnected() {
        return this.isConnected && this.socket && this.socket.connected;
    }

    /**
     * Get socket ID
     */
    getSocketId() {
        return this.socket ? this.socket.id : null;
    }
}