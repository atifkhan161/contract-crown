/**
 * WebSocket Connection Status Manager
 * Handles connection monitoring and status reporting
 */
class ConnectionStatusManager {
  constructor(socketManager) {
    this.socketManager = socketManager;
    this.connectionStats = {
      totalConnections: 0,
      activeConnections: 0,
      reconnections: 0,
      disconnections: 0,
      errors: 0
    };
    
    this.setupStatusMonitoring();
  }

  /**
   * Set up connection status monitoring
   */
  setupStatusMonitoring() {
    const io = this.socketManager.io;
    
    // Monitor new connections
    io.on('connection', (socket) => {
      this.connectionStats.totalConnections++;
      this.connectionStats.activeConnections++;
      
      console.log(`[ConnectionStatus] New connection: ${socket.username || 'Unknown'} (${socket.id})`);
      console.log(`[ConnectionStatus] Active connections: ${this.connectionStats.activeConnections}`);
      
      // Send initial status to client
      socket.emit('connection-status', {
        status: 'connected',
        socketId: socket.id,
        userId: socket.userId,
        timestamp: new Date().toISOString(),
        serverStats: this.getPublicStats()
      });
      
      // Handle reconnection events
      socket.on('reconnect', () => {
        this.connectionStats.reconnections++;
        console.log(`[ConnectionStatus] Client reconnected: ${socket.username || 'Unknown'}`);
        
        socket.emit('connection-status', {
          status: 'reconnected',
          socketId: socket.id,
          userId: socket.userId,
          timestamp: new Date().toISOString()
        });
      });
      
      // Handle disconnections
      socket.on('disconnect', (reason) => {
        this.connectionStats.activeConnections--;
        this.connectionStats.disconnections++;
        
        console.log(`[ConnectionStatus] Client disconnected: ${socket.username || 'Unknown'}, reason: ${reason}`);
        console.log(`[ConnectionStatus] Active connections: ${this.connectionStats.activeConnections}`);
      });
      
      // Handle connection errors
      socket.on('connect_error', (error) => {
        this.connectionStats.errors++;
        console.error(`[ConnectionStatus] Connection error for ${socket.username || 'Unknown'}:`, error.message);
        
        socket.emit('connection-status', {
          status: 'error',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      });
      
      // Handle ping/pong for connection health
      socket.on('ping-server', () => {
        socket.emit('pong-server', {
          timestamp: new Date().toISOString(),
          latency: Date.now() - socket.handshake.time
        });
      });
      
      // Handle status requests
      socket.on('get-connection-status', () => {
        socket.emit('connection-status', {
          status: 'connected',
          socketId: socket.id,
          userId: socket.userId,
          username: socket.username,
          connectedAt: socket.handshake.time,
          timestamp: new Date().toISOString(),
          serverStats: this.getPublicStats()
        });
      });
    });
  }

  /**
   * Get public connection statistics (safe to send to clients)
   */
  getPublicStats() {
    return {
      activeConnections: this.connectionStats.activeConnections,
      activeRooms: this.socketManager.gameRooms.size,
      serverUptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get detailed connection statistics (for admin/monitoring)
   */
  getDetailedStats() {
    return {
      ...this.connectionStats,
      activeRooms: this.socketManager.gameRooms.size,
      roomDetails: Array.from(this.socketManager.gameRooms.entries()).map(([gameId, room]) => ({
        gameId,
        playerCount: room.players.size,
        status: room.status,
        createdAt: room.createdAt
      })),
      serverUptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Broadcast server status to all connected clients
   */
  broadcastServerStatus() {
    const status = {
      status: 'server-update',
      stats: this.getPublicStats(),
      timestamp: new Date().toISOString()
    };
    
    this.socketManager.io.emit('server-status', status);
  }

  /**
   * Check connection health for a specific user
   */
  checkUserConnectionHealth(userId) {
    const socketId = this.socketManager.getUserSocket(userId);
    if (!socketId) {
      return {
        connected: false,
        status: 'disconnected'
      };
    }
    
    const socket = this.socketManager.io.sockets.sockets.get(socketId);
    if (!socket) {
      return {
        connected: false,
        status: 'socket-not-found'
      };
    }
    
    return {
      connected: true,
      status: 'connected',
      socketId: socket.id,
      connectedAt: socket.handshake.time,
      lastActivity: socket.handshake.time // Could be enhanced with actual activity tracking
    };
  }

  /**
   * Force disconnect a user (admin function)
   */
  forceDisconnectUser(userId, reason = 'Admin disconnect') {
    const socketId = this.socketManager.getUserSocket(userId);
    if (socketId) {
      const socket = this.socketManager.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('force-disconnect', { reason, timestamp: new Date().toISOString() });
        socket.disconnect(true);
        console.log(`[ConnectionStatus] Force disconnected user ${userId}: ${reason}`);
        return true;
      }
    }
    return false;
  }

  /**
   * Send connection status update to specific user
   */
  sendStatusToUser(userId, status) {
    const socketId = this.socketManager.getUserSocket(userId);
    if (socketId) {
      const socket = this.socketManager.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('connection-status', {
          ...status,
          timestamp: new Date().toISOString()
        });
        return true;
      }
    }
    return false;
  }

  /**
   * Start periodic status broadcasts (optional)
   */
  startPeriodicStatusBroadcast(intervalMs = 30000) {
    this.statusInterval = setInterval(() => {
      this.broadcastServerStatus();
    }, intervalMs);
    
    console.log(`[ConnectionStatus] Started periodic status broadcast every ${intervalMs}ms`);
  }

  /**
   * Stop periodic status broadcasts
   */
  stopPeriodicStatusBroadcast() {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
      console.log('[ConnectionStatus] Stopped periodic status broadcast');
    }
  }

  /**
   * Reset connection statistics
   */
  resetStats() {
    this.connectionStats = {
      totalConnections: 0,
      activeConnections: this.socketManager.userSockets.size,
      reconnections: 0,
      disconnections: 0,
      errors: 0
    };
    
    console.log('[ConnectionStatus] Connection statistics reset');
  }
}

export default ConnectionStatusManager;