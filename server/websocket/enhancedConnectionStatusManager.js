/**
 * Enhanced Connection Status Manager
 * Implements accurate player connection status tracking, heartbeat monitoring,
 * reconnection handling with state restoration, and connection status broadcasting
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */

class EnhancedConnectionStatusManager {
    constructor(socketManager) {
        this.socketManager = socketManager;
        
        // Connection tracking maps
        this.playerConnections = new Map(); // userId -> connection data
        this.socketToUser = new Map(); // socketId -> userId
        this.userToSocket = new Map(); // userId -> socketId
        
        // Heartbeat monitoring
        this.heartbeatInterval = 10000; // 10 seconds
        this.connectionTimeout = 30000; // 30 seconds
        this.heartbeatTimers = new Map(); // userId -> timer
        this.lastHeartbeats = new Map(); // userId -> timestamp
        
        // Connection statistics
        this.connectionStats = {
            totalConnections: 0,
            activeConnections: 0,
            reconnections: 0,
            disconnections: 0,
            timeouts: 0
        };
        
        // Only setup if not in test environment
        if (process.env.NODE_ENV !== 'test') {
            this.setupConnectionTracking();
            this.startHeartbeatMonitoring();
        }
        
        console.log('[EnhancedConnectionStatus] Enhanced connection status manager initialized');
    }

    /**
     * Set up connection tracking for all socket events
     * Requirement 5.1: Accurate player connection status tracking
     */
    setupConnectionTracking() {
        const io = this.socketManager.io;
        
        // Track new connections
        io.on('connection', (socket) => {
            this.handlePlayerConnection(socket);
        });
    }

    /**
     * Handle new player connection
     * @param {Object} socket - Socket instance
     */
    handlePlayerConnection(socket) {
        const { userId, username } = socket;
        
        if (!userId || !username) {
            console.warn('[EnhancedConnectionStatus] Connection without user info, skipping tracking');
            return;
        }

        console.log(`[EnhancedConnectionStatus] Tracking connection for ${username} (${userId})`);

        // Update connection mappings
        this.socketToUser.set(socket.id, userId);
        this.userToSocket.set(userId, socket.id);
        
        // Initialize or update player connection data
        const connectionData = {
            userId,
            username,
            socketId: socket.id,
            isConnected: true,
            connectedAt: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            reconnectionCount: this.playerConnections.has(userId) ? 
                (this.playerConnections.get(userId).reconnectionCount || 0) + 1 : 0,
            connectionQuality: 'good',
            latency: 0
        };

        this.playerConnections.set(userId, connectionData);
        this.connectionStats.totalConnections++;
        this.connectionStats.activeConnections++;

        // Start heartbeat monitoring for this user
        this.startUserHeartbeat(userId);

        // Set up socket event handlers
        this.setupSocketEventHandlers(socket);

        // Broadcast connection status to all rooms this player is in
        this.broadcastPlayerConnectionStatus(userId, true);

        console.log(`[EnhancedConnectionStatus] Player ${username} connected. Active connections: ${this.connectionStats.activeConnections}`);
    }

    /**
     * Set up socket event handlers for connection monitoring
     * @param {Object} socket - Socket instance
     */
    setupSocketEventHandlers(socket) {
        const userId = socket.userId;

        // Handle heartbeat responses
        socket.on('heartbeat-response', (data) => {
            this.handleHeartbeatResponse(userId, data);
        });

        // Handle connection quality reports
        socket.on('connection-quality', (data) => {
            this.updateConnectionQuality(userId, data);
        });

        // Handle disconnection
        socket.on('disconnect', (reason) => {
            this.handlePlayerDisconnection(userId, reason);
        });

        // Handle reconnection attempts
        socket.on('reconnect-attempt', () => {
            console.log(`[EnhancedConnectionStatus] Reconnection attempt from ${socket.username}`);
        });
    }

    /**
     * Start heartbeat monitoring system
     * Requirement 5.2: Heartbeat monitoring for connection validation
     */
    startHeartbeatMonitoring() {
        setInterval(() => {
            this.performHeartbeatCheck();
        }, this.heartbeatInterval);

        console.log(`[EnhancedConnectionStatus] Heartbeat monitoring started (interval: ${this.heartbeatInterval}ms)`);
    }

    /**
     * Start heartbeat monitoring for a specific user
     * @param {string} userId - User ID
     */
    startUserHeartbeat(userId) {
        // Clear existing timer if any
        this.stopUserHeartbeat(userId);

        // Set initial heartbeat timestamp
        this.lastHeartbeats.set(userId, Date.now());

        // Start heartbeat timer
        const timer = setInterval(() => {
            this.sendHeartbeatPing(userId);
        }, this.heartbeatInterval);

        this.heartbeatTimers.set(userId, timer);
    }

    /**
     * Stop heartbeat monitoring for a specific user
     * @param {string} userId - User ID
     */
    stopUserHeartbeat(userId) {
        const timer = this.heartbeatTimers.get(userId);
        if (timer) {
            clearInterval(timer);
            this.heartbeatTimers.delete(userId);
        }
        this.lastHeartbeats.delete(userId);
    }

    /**
     * Send heartbeat ping to a user
     * @param {string} userId - User ID
     */
    sendHeartbeatPing(userId) {
        const socketId = this.userToSocket.get(userId);
        if (!socketId) return;

        const socket = this.socketManager.io.sockets.sockets.get(socketId);
        if (!socket || !socket.connected) {
            this.handleConnectionTimeout(userId);
            return;
        }

        const pingTime = Date.now();
        socket.emit('heartbeat-ping', {
            timestamp: pingTime,
            userId
        });

        // Set timeout for heartbeat response
        setTimeout(() => {
            const lastHeartbeat = this.lastHeartbeats.get(userId);
            if (!lastHeartbeat || lastHeartbeat < pingTime) {
                this.handleConnectionTimeout(userId);
            }
        }, this.connectionTimeout);
    }

    /**
     * Handle heartbeat response from client
     * @param {string} userId - User ID
     * @param {Object} data - Heartbeat response data
     */
    handleHeartbeatResponse(userId, data) {
        const now = Date.now();
        const latency = now - (data.timestamp || now);

        // Update last heartbeat timestamp
        this.lastHeartbeats.set(userId, now);

        // Update connection data
        const connectionData = this.playerConnections.get(userId);
        if (connectionData) {
            connectionData.lastSeen = new Date().toISOString();
            connectionData.latency = latency;
            connectionData.isConnected = true;

            // Update connection quality based on latency
            if (latency < 100) {
                connectionData.connectionQuality = 'excellent';
            } else if (latency < 300) {
                connectionData.connectionQuality = 'good';
            } else if (latency < 1000) {
                connectionData.connectionQuality = 'fair';
            } else {
                connectionData.connectionQuality = 'poor';
            }
        }

        // Update player connection status in all rooms
        this.updatePlayerConnectionInRooms(userId, true);
    }

    /**
     * Perform periodic heartbeat check on all connections
     */
    performHeartbeatCheck() {
        const now = Date.now();
        
        for (const [userId, lastHeartbeat] of this.lastHeartbeats.entries()) {
            const timeSinceLastHeartbeat = now - lastHeartbeat;
            
            if (timeSinceLastHeartbeat > this.connectionTimeout) {
                console.warn(`[EnhancedConnectionStatus] Connection timeout for user ${userId}`);
                this.handleConnectionTimeout(userId);
            }
        }
    }

    /**
     * Handle connection timeout
     * Requirement 5.2: Connection validation and timeout handling
     * @param {string} userId - User ID
     */
    handleConnectionTimeout(userId) {
        const connectionData = this.playerConnections.get(userId);
        if (!connectionData) return;

        console.log(`[EnhancedConnectionStatus] Connection timeout for ${connectionData.username} (${userId})`);

        // Mark as disconnected
        connectionData.isConnected = false;
        connectionData.disconnectedAt = new Date().toISOString();
        
        this.connectionStats.timeouts++;
        this.connectionStats.activeConnections--;

        // Stop heartbeat monitoring
        this.stopUserHeartbeat(userId);

        // Update player status in all rooms
        this.updatePlayerConnectionInRooms(userId, false);

        // Broadcast disconnection status
        this.broadcastPlayerConnectionStatus(userId, false);
    }

    /**
     * Handle player disconnection
     * @param {string} userId - User ID
     * @param {string} reason - Disconnection reason
     */
    handlePlayerDisconnection(userId, reason) {
        const connectionData = this.playerConnections.get(userId);
        if (!connectionData) return;

        console.log(`[EnhancedConnectionStatus] Player ${connectionData.username} disconnected: ${reason}`);

        // Update connection data
        connectionData.isConnected = false;
        connectionData.disconnectedAt = new Date().toISOString();
        connectionData.disconnectionReason = reason;

        this.connectionStats.disconnections++;
        this.connectionStats.activeConnections--;

        // Clean up mappings
        const socketId = this.userToSocket.get(userId);
        if (socketId) {
            this.socketToUser.delete(socketId);
        }
        this.userToSocket.delete(userId);

        // Stop heartbeat monitoring
        this.stopUserHeartbeat(userId);

        // Update player status in all rooms
        this.updatePlayerConnectionInRooms(userId, false);

        // Broadcast disconnection status
        this.broadcastPlayerConnectionStatus(userId, false);
    }

    /**
     * Handle player reconnection with state restoration
     * Requirement 5.3: Reconnection handling with state restoration
     * @param {string} userId - User ID
     * @param {Object} socket - New socket instance
     */
    async handlePlayerReconnection(userId, socket) {
        const connectionData = this.playerConnections.get(userId);
        if (!connectionData) {
            console.warn(`[EnhancedConnectionStatus] Reconnection attempt for unknown user ${userId}`);
            return;
        }

        console.log(`[EnhancedConnectionStatus] Player ${connectionData.username} reconnecting`);

        // Update connection mappings
        this.socketToUser.set(socket.id, userId);
        this.userToSocket.set(userId, socket.id);

        // Update connection data
        connectionData.socketId = socket.id;
        connectionData.isConnected = true;
        connectionData.reconnectedAt = new Date().toISOString();
        connectionData.reconnectionCount++;

        this.connectionStats.reconnections++;
        this.connectionStats.activeConnections++;

        // Restart heartbeat monitoring
        this.startUserHeartbeat(userId);

        // Restore state from database for all rooms this player is in
        await this.restorePlayerStateFromDatabase(userId);

        // Update player status in all rooms
        this.updatePlayerConnectionInRooms(userId, true);

        // Broadcast reconnection status
        this.broadcastPlayerConnectionStatus(userId, true, true);

        // Send state restoration confirmation to the reconnected player
        socket.emit('connection-restored', {
            userId,
            reconnectionCount: connectionData.reconnectionCount,
            restoredAt: connectionData.reconnectedAt,
            message: 'Connection restored and state synchronized'
        });

        console.log(`[EnhancedConnectionStatus] Player ${connectionData.username} successfully reconnected`);
    }

    /**
     * Restore player state from database after reconnection
     * @param {string} userId - User ID
     */
    async restorePlayerStateFromDatabase(userId) {
        try {
            // Import Room model to fetch current state
            const Room = (await import('../src/models/Room.js')).default;
            
            // Find all rooms where this player is a member
            const rooms = await Room.findByPlayerId(userId);
            
            for (const room of rooms) {
                const gameId = room.id;
                const wsRoom = this.socketManager.gameRooms.get(gameId);
                
                if (wsRoom) {
                    // Find the player in the database room data
                    const dbPlayer = room.players.find(p => String(p.id) === String(userId));
                    
                    if (dbPlayer) {
                        // Update websocket room state with database state
                        const wsPlayer = wsRoom.players.get(userId);
                        if (wsPlayer) {
                            wsPlayer.isReady = dbPlayer.isReady;
                            wsPlayer.teamAssignment = dbPlayer.teamAssignment;
                            wsPlayer.isConnected = true;
                            wsPlayer.reconnectedAt = new Date().toISOString();
                            
                            console.log(`[EnhancedConnectionStatus] Restored state for ${wsPlayer.username} in room ${gameId}`);
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`[EnhancedConnectionStatus] Error restoring state for user ${userId}:`, error);
        }
    }

    /**
     * Update player connection status in all rooms
     * @param {string} userId - User ID
     * @param {boolean} isConnected - Connection status
     */
    updatePlayerConnectionInRooms(userId, isConnected) {
        for (const [gameId, room] of this.socketManager.gameRooms.entries()) {
            if (room.players.has(userId)) {
                const player = room.players.get(userId);
                player.isConnected = isConnected;
                
                if (isConnected) {
                    player.reconnectedAt = new Date().toISOString();
                } else {
                    player.disconnectedAt = new Date().toISOString();
                }
                
                console.log(`[EnhancedConnectionStatus] Updated ${player.username} connection status to ${isConnected} in room ${gameId}`);
            }
        }
    }

    /**
     * Broadcast connection status to all room members
     * Requirement 5.4: Connection status broadcasting
     * @param {string} userId - User ID
     * @param {boolean} isConnected - Connection status
     * @param {boolean} isReconnection - Whether this is a reconnection
     */
    broadcastPlayerConnectionStatus(userId, isConnected, isReconnection = false) {
        const connectionData = this.playerConnections.get(userId);
        if (!connectionData) return;

        // Find all rooms this player is in and broadcast to each
        for (const [gameId, room] of this.socketManager.gameRooms.entries()) {
            if (room.players.has(userId)) {
                const eventName = isConnected ? 
                    (isReconnection ? 'player-reconnected' : 'player-connected') : 
                    'player-disconnected';

                const eventData = {
                    gameId,
                    playerId: userId,
                    playerName: connectionData.username,
                    isConnected,
                    isReconnection,
                    connectionQuality: connectionData.connectionQuality,
                    latency: connectionData.latency,
                    players: Array.from(room.players.values()).map(p => ({
                        userId: p.userId,
                        username: p.username,
                        isReady: p.isReady,
                        teamAssignment: p.teamAssignment,
                        isConnected: p.isConnected
                    })),
                    connectedPlayerCount: Array.from(room.players.values()).filter(p => p.isConnected).length,
                    timestamp: new Date().toISOString()
                };

                // Broadcast to all players in the room
                this.socketManager.io.to(gameId).emit(eventName, eventData);
                
                console.log(`[EnhancedConnectionStatus] Broadcasted ${eventName} for ${connectionData.username} in room ${gameId}`);
            }
        }
    }

    /**
     * Update connection quality for a user
     * @param {string} userId - User ID
     * @param {Object} qualityData - Connection quality data
     */
    updateConnectionQuality(userId, qualityData) {
        const connectionData = this.playerConnections.get(userId);
        if (!connectionData) return;

        connectionData.connectionQuality = qualityData.quality || 'unknown';
        connectionData.latency = qualityData.latency || 0;
        connectionData.lastSeen = new Date().toISOString();

        console.log(`[EnhancedConnectionStatus] Updated connection quality for ${connectionData.username}: ${connectionData.connectionQuality} (${connectionData.latency}ms)`);
    }

    /**
     * Get connected players for a specific room
     * @param {string} gameId - Game ID
     * @returns {Array} Array of connected players
     */
    getConnectedPlayers(gameId) {
        const room = this.socketManager.gameRooms.get(gameId);
        if (!room) return [];

        return Array.from(room.players.values())
            .filter(player => player.isConnected)
            .map(player => ({
                userId: player.userId,
                username: player.username,
                isReady: player.isReady,
                teamAssignment: player.teamAssignment,
                connectionQuality: this.getPlayerConnectionQuality(player.userId),
                latency: this.getPlayerLatency(player.userId)
            }));
    }

    /**
     * Get connection quality for a specific player
     * @param {string} userId - User ID
     * @returns {string} Connection quality
     */
    getPlayerConnectionQuality(userId) {
        const connectionData = this.playerConnections.get(userId);
        return connectionData ? connectionData.connectionQuality : 'unknown';
    }

    /**
     * Get latency for a specific player
     * @param {string} userId - User ID
     * @returns {number} Latency in milliseconds
     */
    getPlayerLatency(userId) {
        const connectionData = this.playerConnections.get(userId);
        return connectionData ? connectionData.latency : 0;
    }

    /**
     * Check if a player is connected
     * @param {string} userId - User ID
     * @returns {boolean} Connection status
     */
    isPlayerConnected(userId) {
        const connectionData = this.playerConnections.get(userId);
        return connectionData ? connectionData.isConnected : false;
    }

    /**
     * Get connection statistics
     * @returns {Object} Connection statistics
     */
    getConnectionStats() {
        return {
            ...this.connectionStats,
            activeConnections: this.connectionStats.activeConnections,
            trackedPlayers: this.playerConnections.size,
            heartbeatMonitoring: this.heartbeatTimers.size
        };
    }

    /**
     * Get detailed connection info for all players
     * @returns {Array} Array of connection info
     */
    getAllConnectionInfo() {
        return Array.from(this.playerConnections.values()).map(conn => ({
            userId: conn.userId,
            username: conn.username,
            isConnected: conn.isConnected,
            connectionQuality: conn.connectionQuality,
            latency: conn.latency,
            connectedAt: conn.connectedAt,
            lastSeen: conn.lastSeen,
            reconnectionCount: conn.reconnectionCount
        }));
    }

    /**
     * Force disconnect a player (admin function)
     * @param {string} userId - User ID
     * @param {string} reason - Disconnect reason
     */
    forceDisconnectPlayer(userId, reason = 'Admin disconnect') {
        const socketId = this.userToSocket.get(userId);
        if (!socketId) return false;

        const socket = this.socketManager.io.sockets.sockets.get(socketId);
        if (!socket) return false;

        socket.emit('force-disconnect', { reason, timestamp: new Date().toISOString() });
        socket.disconnect(true);

        console.log(`[EnhancedConnectionStatus] Force disconnected user ${userId}: ${reason}`);
        return true;
    }

    /**
     * Cleanup connection tracking for a specific user
     * @param {string} userId - User ID
     */
    cleanupUserConnection(userId) {
        this.playerConnections.delete(userId);
        this.stopUserHeartbeat(userId);
        
        const socketId = this.userToSocket.get(userId);
        if (socketId) {
            this.socketToUser.delete(socketId);
        }
        this.userToSocket.delete(userId);

        console.log(`[EnhancedConnectionStatus] Cleaned up connection tracking for user ${userId}`);
    }

    /**
     * Cleanup all connection tracking
     */
    cleanup() {
        // Clear all heartbeat timers
        for (const timer of this.heartbeatTimers.values()) {
            clearInterval(timer);
        }

        // Clear all maps
        this.playerConnections.clear();
        this.socketToUser.clear();
        this.userToSocket.clear();
        this.heartbeatTimers.clear();
        this.lastHeartbeats.clear();

        console.log('[EnhancedConnectionStatus] Cleaned up all connection tracking');
    }
}

export default EnhancedConnectionStatusManager;