/**
 * Socket Manager
 * Handles WebSocket connections and real-time communication
 */

import { getErrorHandler } from './ErrorHandler.js';

export class SocketManager {
    constructor(authManager = null) {
        this.socket = null;
        this.eventListeners = new Map();
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.authManager = authManager;
        this.errorHandler = getErrorHandler(authManager);
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

                // Initialize socket connection with better configuration
                this.socket = io({
                    auth: {
                        token: token
                    },
                    transports: ['websocket', 'polling'],
                    timeout: 20000,
                    reconnection: true,
                    reconnectionAttempts: 5,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                    maxReconnectionAttempts: 5,
                    forceNew: false
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
                    
                    // Handle critical disconnect reasons
                    if (reason === 'io server disconnect' || reason === 'transport error') {
                        this.errorHandler?.handleWebSocketError(`Connection error: ${reason}`, this.socket);
                    }
                    
                    // Attempt to reconnect if not a manual disconnect
                    if (reason !== 'io client disconnect') {
                        this.handleReconnect();
                    }
                });

                this.socket.on('reconnect', () => {
                    console.log('Socket reconnected');
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this.emit('reconnect');
                });

                this.socket.on('connect_error', (error) => {
                    console.error('Socket connection error:', error);
                    this.isConnected = false;
                    
                    // Handle critical websocket errors
                    this.errorHandler?.handleWebSocketError(error, this.socket);
                    
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
                    
                    // Handle authentication errors through error handler
                    this.errorHandler?.handleAuthError(error);
                    this.emit('auth_error', error);
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
        this.socket.on('roomsUpdated', (data) => {
            console.log('[SocketManager] roomsUpdated event received:', data);
            this.emit('roomsUpdated', data);
        });
        this.socket.on('roomCreated', (data) => {
            console.log('[SocketManager] roomCreated event received:', data);
            this.emit('roomCreated', data);
        });
        this.socket.on('roomJoined', (data) => this.emit('roomJoined', data));
        this.socket.on('roomLeft', (data) => this.emit('roomLeft', data));
        this.socket.on('roomDeleted', (data) => {
            console.log('[SocketManager] roomDeleted event received:', data);
            this.emit('roomDeleted', data);
        });
        this.socket.on('roomError', (data) => this.emit('roomError', data));
        
        // Player events - Real-time waiting room updates
        this.socket.on('player-joined', (data) => this.emit('playerJoined', data));
        this.socket.on('player-left', (data) => this.emit('playerLeft', data));
        this.socket.on('player-ready-changed', (data) => this.emit('playerReadyStatusChanged', data));
        this.socket.on('player-disconnected', (data) => this.emit('playerDisconnected', data));
        this.socket.on('player-removed', (data) => this.emit('playerRemoved', data));
        
        // Room events
        this.socket.on('room-joined', (data) => this.emit('roomJoined', data));
        
        // Team events
        this.socket.on('teams-formed', (data) => this.emit('teamsFormed', data));
        
        // Game events
        this.socket.on('gameStarted', (data) => this.emit('gameStarted', data));
        this.socket.on('game-starting', (data) => this.emit('gameStarting', data));
        this.socket.on('gameEnded', (data) => this.emit('gameEnded', data));
        this.socket.on('gameStateUpdated', (data) => this.emit('gameStateUpdated', data));
        this.socket.on('roomUpdated', (data) => this.emit('roomUpdated', data));

        // New real-time game communication events
        this.socket.on('game:state_update', (data) => this.emit('gameStateUpdate', data));
        this.socket.on('player:declare_trump', (data) => this.emit('playerDeclareTrump', data));
        this.socket.on('game:trump_declared', (data) => this.emit('gameTrumpDeclared', data));
        this.socket.on('player:play_card', (data) => this.emit('playerPlayCard', data));
        this.socket.on('game:card_played', (data) => this.emit('gameCardPlayed', data));
        this.socket.on('game:trick_won', (data) => this.emit('gameTrickWon', data));
        this.socket.on('game:round_scores', (data) => this.emit('gameRoundScores', data));
        this.socket.on('game:complete', (data) => this.emit('gameComplete', data));
        
        // User events
        this.socket.on('userStatsUpdated', (data) => this.emit('userStatsUpdated', data));
        
        // Chat events
        this.socket.on('chatMessage', (data) => this.emit('chatMessage', data));
        
        // Error events
        this.socket.on('error', (data) => this.emit('error', data));
        
        // Connection events
        this.socket.on('connection-confirmed', (data) => this.emit('connectionConfirmed', data));
        this.socket.on('connection-status', (data) => this.emit('connectionStatus', data));
        
        // Heartbeat events
        this.socket.on('pong', (data) => {
            console.log('[SocketManager] Received pong:', data);
            this.emit('pong', data);
        });
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

    /**
     * Request current game state from server
     */
    requestGameState(gameId) {
        this.emitToServer('request-game-state', { gameId });
    }

    /**
     * Declare trump suit
     */
    declareTrump(gameId, trumpSuit) {
        this.emitToServer('declare-trump', { gameId, trumpSuit });
    }

    /**
     * Play a card
     */
    playCard(gameId, card, trickId = null, roundId = null) {
        this.emitToServer('play-card', { gameId, card, trickId, roundId });
    }

    /**
     * Report trick completion (usually called by game engine)
     */
    reportTrickComplete(gameId, trickData) {
        this.emitToServer('trick-complete', { gameId, ...trickData });
    }

    /**
     * Report round completion (usually called by game engine)
     */
    reportRoundComplete(gameId, roundData) {
        this.emitToServer('round-complete', { gameId, ...roundData });
    }
}