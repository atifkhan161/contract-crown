/**
 * Waiting Room Socket Manager
 * Handles WebSocket communication specifically for waiting room functionality
 * Provides real-time updates for player joining, ready status, and game start coordination
 */

export class WaitingRoomSocketManager {
    constructor(authManager, roomId) {
        this.authManager = authManager;
        this.roomId = roomId;
        this.socket = null;
        this.eventListeners = new Map();
        
        // Connection state
        this.isConnected = false;
        this.connectionStatus = 'disconnected'; // disconnected, connecting, connected, reconnecting
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.baseReconnectDelay = 1000;
        this.reconnectTimer = null;
        
        // Room state
        this.currentUser = null;
        this.isJoined = false;
        
        // Heartbeat for connection monitoring
        this.heartbeatInterval = null;
        this.heartbeatTimeout = null;
        this.lastPongReceived = null;
        
        console.log('[WaitingRoomSocketManager] Initialized for room:', roomId);
    }

    /**
     * Connect to WebSocket server and join the waiting room
     * @returns {Promise<void>}
     */
    async connect() {
        return new Promise((resolve, reject) => {
            try {
                // Get authentication token
                const token = this.authManager.getToken();
                if (!token) {
                    throw new Error('No authentication token found');
                }

                this.currentUser = this.authManager.getCurrentUser();
                if (!this.currentUser) {
                    throw new Error('No user data found');
                }

                console.log('[WaitingRoomSocketManager] Connecting to WebSocket...');
                this.updateConnectionStatus('connecting');

                // Initialize socket connection with authentication
                this.socket = io({
                    auth: {
                        token: token
                    },
                    transports: ['websocket', 'polling'],
                    timeout: 20000,
                    reconnection: false, // We'll handle reconnection manually
                    forceNew: true
                });

                // Set up connection event handlers
                this.setupConnectionHandlers(resolve, reject);
                
                // Set up waiting room specific event handlers
                this.setupWaitingRoomEventHandlers();

            } catch (error) {
                console.error('[WaitingRoomSocketManager] Connection setup error:', error);
                this.updateConnectionStatus('disconnected');
                reject(error);
            }
        });
    }

    /**
     * Set up WebSocket connection event handlers
     * @param {Function} resolve - Promise resolve function
     * @param {Function} reject - Promise reject function
     */
    setupConnectionHandlers(resolve, reject) {
        this.socket.on('connect', () => {
            console.log('[WaitingRoomSocketManager] Socket connected');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.updateConnectionStatus('connected');
            
            // Start heartbeat monitoring
            this.startHeartbeat();
            
            // Auto-join the waiting room
            this.joinRoom().then(() => {
                resolve();
            }).catch((error) => {
                console.error('[WaitingRoomSocketManager] Failed to join room after connect:', error);
                reject(error);
            });
        });

        this.socket.on('disconnect', (reason) => {
            console.log('[WaitingRoomSocketManager] Socket disconnected:', reason);
            this.isConnected = false;
            this.isJoined = false;
            this.stopHeartbeat();
            
            this.emit('disconnect', { reason });
            
            // Attempt reconnection unless it was a manual disconnect
            if (reason !== 'io client disconnect') {
                this.handleReconnection();
            } else {
                this.updateConnectionStatus('disconnected');
            }
        });

        this.socket.on('connect_error', (error) => {
            console.error('[WaitingRoomSocketManager] Connection error:', error);
            this.isConnected = false;
            this.updateConnectionStatus('disconnected');
            
            if (this.reconnectAttempts === 0) {
                // First connection attempt failed
                reject(error);
            } else {
                // Reconnection attempt failed
                this.handleReconnection();
            }
        });

        this.socket.on('auth_error', (error) => {
            console.error('[WaitingRoomSocketManager] Authentication error:', error);
            this.updateConnectionStatus('disconnected');
            this.emit('auth_error', error);
            reject(new Error('Authentication failed'));
        });

        // Heartbeat response
        this.socket.on('pong', (data) => {
            this.lastPongReceived = Date.now();
            console.log('[WaitingRoomSocketManager] Heartbeat pong received');
        });
    }

    /**
     * Set up waiting room specific event handlers
     */
    setupWaitingRoomEventHandlers() {
        // Player events
        this.socket.on('player-joined', (data) => {
            console.log('[WaitingRoomSocketManager] Player joined:', data);
            this.emit('player-joined', data);
        });

        this.socket.on('player-left', (data) => {
            console.log('[WaitingRoomSocketManager] Player left:', data);
            this.emit('player-left', data);
        });

        this.socket.on('player-ready-changed', (data) => {
            console.log('[WaitingRoomSocketManager] Player ready status changed:', data);
            this.emit('player-ready-changed', data);
        });

        this.socket.on('player-disconnected', (data) => {
            console.log('[WaitingRoomSocketManager] Player disconnected:', data);
            this.emit('player-disconnected', data);
        });

        // Room events
        this.socket.on('room-joined', (data) => {
            console.log('[WaitingRoomSocketManager] Room joined successfully:', data);
            this.isJoined = true;
            this.emit('room-joined', data);
        });

        this.socket.on('room-join-error', (data) => {
            console.error('[WaitingRoomSocketManager] Room join error:', data);
            this.emit('room-join-error', data);
        });

        this.socket.on('room-updated', (data) => {
            console.log('[WaitingRoomSocketManager] Room updated:', data);
            this.emit('room-updated', data);
        });

        // Game events
        this.socket.on('game-starting', (data) => {
            console.log('[WaitingRoomSocketManager] Game starting:', data);
            this.emit('game-starting', data);
        });

        this.socket.on('teams-formed', (data) => {
            console.log('[WaitingRoomSocketManager] Teams formed:', data);
            this.emit('teams-formed', data);
        });

        // Error events
        this.socket.on('waiting-room-error', (data) => {
            console.error('[WaitingRoomSocketManager] Waiting room error:', data);
            this.emit('waiting-room-error', data);
        });

        // Connection status events
        this.socket.on('connection-confirmed', (data) => {
            console.log('[WaitingRoomSocketManager] Connection confirmed:', data);
            this.emit('connection-confirmed', data);
        });
    }

    /**
     * Join the waiting room
     * @returns {Promise<void>}
     */
    async joinRoom() {
        return new Promise((resolve, reject) => {
            if (!this.isConnected || !this.socket) {
                reject(new Error('Socket not connected'));
                return;
            }

            console.log('[WaitingRoomSocketManager] Joining waiting room:', this.roomId);

            // Set up one-time listeners for join response
            const joinSuccessHandler = (data) => {
                console.log('[WaitingRoomSocketManager] Successfully joined room:', data);
                this.isJoined = true;
                this.socket.off('room-join-error', joinErrorHandler);
                resolve(data);
            };

            const joinErrorHandler = (error) => {
                console.error('[WaitingRoomSocketManager] Failed to join room:', error);
                this.socket.off('room-joined', joinSuccessHandler);
                reject(new Error(error.message || 'Failed to join room'));
            };

            this.socket.once('room-joined', joinSuccessHandler);
            this.socket.once('room-join-error', joinErrorHandler);

            // Emit join room event
            this.socket.emit('join-waiting-room', {
                roomId: this.roomId,
                userId: this.currentUser.user_id || this.currentUser.id,
                username: this.currentUser.username
            });

            // Set timeout for join attempt
            setTimeout(() => {
                this.socket.off('room-joined', joinSuccessHandler);
                this.socket.off('room-join-error', joinErrorHandler);
                reject(new Error('Room join timeout'));
            }, 10000);
        });
    }

    /**
     * Toggle ready status
     * @param {boolean} isReady - New ready status
     */
    toggleReady(isReady) {
        if (!this.isConnected || !this.socket || !this.isJoined) {
            console.warn('[WaitingRoomSocketManager] Cannot toggle ready - not connected or joined');
            this.emit('ready-toggle-error', { message: 'Not connected to room' });
            return;
        }

        console.log('[WaitingRoomSocketManager] Toggling ready status:', isReady);

        this.socket.emit('toggle-ready-status', {
            roomId: this.roomId,
            userId: this.currentUser.user_id || this.currentUser.id,
            isReady: isReady
        });
    }

    /**
     * Start the game (host only)
     */
    startGame() {
        if (!this.isConnected || !this.socket || !this.isJoined) {
            console.warn('[WaitingRoomSocketManager] Cannot start game - not connected or joined');
            this.emit('game-start-error', { message: 'Not connected to room' });
            return;
        }

        console.log('[WaitingRoomSocketManager] Requesting game start');

        this.socket.emit('start-game-request', {
            roomId: this.roomId,
            userId: this.currentUser.user_id || this.currentUser.id
        });
    }

    /**
     * Leave the waiting room
     */
    leaveRoom() {
        if (this.socket && this.isJoined) {
            console.log('[WaitingRoomSocketManager] Leaving waiting room');

            this.socket.emit('leave-waiting-room', {
                roomId: this.roomId,
                userId: this.currentUser.user_id || this.currentUser.id
            });

            this.isJoined = false;
        }
    }

    /**
     * Disconnect from WebSocket server
     */
    disconnect() {
        console.log('[WaitingRoomSocketManager] Disconnecting...');

        // Leave room first if joined
        if (this.isJoined) {
            this.leaveRoom();
        }

        // Stop heartbeat
        this.stopHeartbeat();

        // Clear reconnection timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        // Disconnect socket
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }

        this.isConnected = false;
        this.isJoined = false;
        this.updateConnectionStatus('disconnected');
    }

    /**
     * Handle reconnection with exponential backoff
     */
    handleReconnection() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[WaitingRoomSocketManager] Max reconnection attempts reached');
            this.updateConnectionStatus('disconnected');
            this.emit('reconnect-failed', { 
                attempts: this.reconnectAttempts,
                maxAttempts: this.maxReconnectAttempts 
            });
            return;
        }

        this.reconnectAttempts++;
        this.updateConnectionStatus('reconnecting');
        
        const delay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        const jitter = Math.random() * 1000; // Add jitter to prevent thundering herd
        const totalDelay = Math.min(delay + jitter, 30000); // Cap at 30 seconds

        console.log(`[WaitingRoomSocketManager] Reconnection attempt ${this.reconnectAttempts} in ${Math.round(totalDelay)}ms`);
        
        this.emit('reconnecting', { 
            attempt: this.reconnectAttempts, 
            maxAttempts: this.maxReconnectAttempts,
            delay: totalDelay 
        });

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.attemptReconnection();
        }, totalDelay);
    }

    /**
     * Attempt to reconnect to the WebSocket server
     */
    async attemptReconnection() {
        try {
            console.log('[WaitingRoomSocketManager] Attempting reconnection...');
            
            // Clean up existing socket
            if (this.socket) {
                this.socket.removeAllListeners();
                this.socket.disconnect();
                this.socket = null;
            }

            // Attempt to reconnect
            await this.connect();
            
            console.log('[WaitingRoomSocketManager] Reconnection successful');
            this.emit('reconnected', { attempts: this.reconnectAttempts });
            
        } catch (error) {
            console.error('[WaitingRoomSocketManager] Reconnection failed:', error);
            this.handleReconnection(); // Try again
        }
    }

    /**
     * Start heartbeat monitoring
     */
    startHeartbeat() {
        this.stopHeartbeat(); // Clear any existing heartbeat

        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected && this.socket) {
                console.log('[WaitingRoomSocketManager] Sending heartbeat ping');
                this.socket.emit('ping', { timestamp: Date.now() });
                
                // Set timeout for pong response
                this.heartbeatTimeout = setTimeout(() => {
                    console.warn('[WaitingRoomSocketManager] Heartbeat timeout - connection may be lost');
                    this.handleConnectionLoss();
                }, 5000);
            }
        }, 30000); // Send ping every 30 seconds
    }

    /**
     * Stop heartbeat monitoring
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
     * Handle connection loss detected by heartbeat
     */
    handleConnectionLoss() {
        console.warn('[WaitingRoomSocketManager] Connection loss detected');
        this.isConnected = false;
        this.isJoined = false;
        this.stopHeartbeat();
        this.updateConnectionStatus('disconnected');
        this.emit('connection-lost');
        this.handleReconnection();
    }

    /**
     * Update connection status and notify listeners
     * @param {string} status - New connection status
     */
    updateConnectionStatus(status) {
        if (this.connectionStatus !== status) {
            const previousStatus = this.connectionStatus;
            this.connectionStatus = status;
            
            console.log(`[WaitingRoomSocketManager] Connection status changed: ${previousStatus} -> ${status}`);
            
            this.emit('connection-status-changed', {
                status: status,
                previousStatus: previousStatus,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Get current connection status
     * @returns {Object} Connection status information
     */
    getConnectionStatus() {
        return {
            status: this.connectionStatus,
            isConnected: this.isConnected,
            isJoined: this.isJoined,
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.maxReconnectAttempts,
            lastPongReceived: this.lastPongReceived
        };
    }

    /**
     * Check if socket is connected and ready
     * @returns {boolean} True if connected and joined
     */
    isReady() {
        return this.isConnected && this.isJoined && this.socket && this.socket.connected;
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
     * @param {Function} callback - Event callback to remove
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
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit(event, data) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`[WaitingRoomSocketManager] Error in event listener for ${event}:`, error);
                }
            });
        }
    }

    /**
     * Get socket ID
     * @returns {string|null} Socket ID or null if not connected
     */
    getSocketId() {
        return this.socket ? this.socket.id : null;
    }

    /**
     * Get room ID
     * @returns {string} Room ID
     */
    getRoomId() {
        return this.roomId;
    }

    /**
     * Get current user data
     * @returns {Object|null} Current user data
     */
    getCurrentUser() {
        return this.currentUser;
    }
}