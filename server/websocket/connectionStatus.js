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
      errors: 0,
      timeouts: 0,
      recoveries: 0
    };
    
    // Connection timeout settings - increased for better stability
    this.connectionTimeout = 60000; // 60 seconds (increased from 30)
    this.heartbeatInterval = 15000; // 15 seconds (increased from 10)
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Start with 1 second
    
    // Track connection health
    this.connectionHealth = new Map(); // socketId -> health data
    this.heartbeatTimers = new Map(); // socketId -> timer
    
    this.setupStatusMonitoring();
    this.startHeartbeatMonitoring();
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
      
      // Initialize connection health tracking
      this.connectionHealth.set(socket.id, {
        connectedAt: Date.now(),
        lastPing: Date.now(),
        latencyHistory: [],
        errorCount: 0,
        reconnectAttempts: 0
      });
      
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
        
        // Clean up connection health tracking
        this.connectionHealth.delete(socket.id);
        this.clearHeartbeatTimer(socket.id);
        
        console.log(`[ConnectionStatus] Client disconnected: ${socket.username || 'Unknown'}, reason: ${reason}`);
        console.log(`[ConnectionStatus] Active connections: ${this.connectionStats.activeConnections}`);
        
        // Handle different disconnection reasons
        if (reason === 'transport close' || reason === 'transport error') {
          console.log(`[ConnectionStatus] Network-related disconnection for ${socket.username || 'Unknown'}`);
        } else if (reason === 'ping timeout') {
          console.log(`[ConnectionStatus] Ping timeout for ${socket.username || 'Unknown'}`);
          this.connectionStats.timeouts++;
        }
      });
      
      // Handle connection errors
      socket.on('connect_error', (error) => {
        this.handleWebSocketError(socket, error);
      });

      // Handle custom error events
      socket.on('error', (error) => {
        this.handleWebSocketError(socket, error);
      });

      // Handle client-reported connection issues
      socket.on('connection-issue', (data) => {
        console.log(`[ConnectionStatus] Client reported connection issue: ${data.type} - ${data.message}`);
        
        // Update error count
        const health = this.connectionHealth.get(socket.id);
        if (health) {
          health.errorCount = (health.errorCount || 0) + 1;
        }
        
        // Apply appropriate recovery strategy
        this.handleGracefulDegradation(socket, data.type);
      });
      
      // Handle ping/pong for connection health
      socket.on('ping-server', (data) => {
        const now = Date.now();
        const pingTime = data?.timestamp || now;
        const latency = now - pingTime;
        
        // Update connection health
        this.updateConnectionHealth(socket.id, {
          lastPing: now,
          latency: latency
        });
        
        // Add to latency history
        const health = this.connectionHealth.get(socket.id);
        if (health) {
          health.latencyHistory = health.latencyHistory || [];
          health.latencyHistory.push(latency);
          
          // Keep only last 10 latency measurements
          if (health.latencyHistory.length > 10) {
            health.latencyHistory.shift();
          }
        }
        
        socket.emit('pong-server', {
          timestamp: new Date().toISOString(),
          latency: latency,
          serverTime: now
        });
        
        // Monitor connection quality
        this.monitorConnectionQuality(socket.id);
      });

      // Handle health check pings
      socket.on('pong-health-check', (data) => {
        const now = Date.now();
        const pingTime = data?.timestamp || now;
        const latency = now - pingTime;
        
        this.updateConnectionHealth(socket.id, {
          lastPing: now,
          latency: latency,
          isHealthy: latency < this.connectionTimeout / 2
        });
        
        // Clear any existing recovery timer since we got a response
        this.clearHeartbeatTimer(socket.id);
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
   * Start heartbeat monitoring for connection health
   */
  startHeartbeatMonitoring() {
    setInterval(() => {
      this.performHeartbeatCheck();
    }, this.heartbeatInterval);
    
    console.log(`[ConnectionStatus] Started heartbeat monitoring every ${this.heartbeatInterval}ms`);
  }

  /**
   * Perform heartbeat check on all connections
   */
  performHeartbeatCheck() {
    const now = Date.now();
    
    for (const [socketId, healthData] of this.connectionHealth.entries()) {
      const socket = this.socketManager.io.sockets.sockets.get(socketId);
      
      if (!socket) {
        // Socket no longer exists, clean up
        this.connectionHealth.delete(socketId);
        this.clearHeartbeatTimer(socketId);
        continue;
      }

      // Check if connection is stale
      const timeSinceLastPing = now - (healthData.lastPing || healthData.connectedAt);
      
      if (timeSinceLastPing > this.connectionTimeout) {
        // Double-check with socket.io's built-in connected status
        if (socket.connected) {
          console.warn(`[ConnectionStatus] Connection timeout for ${socket.username || 'Unknown'} (${socketId})`);
          this.handleConnectionTimeout(socket);
        } else {
          // Socket is already disconnected, clean up
          this.connectionHealth.delete(socketId);
          this.clearHeartbeatTimer(socketId);
        }
      } else {
        // Send ping to check connection health
        socket.emit('ping-health-check', { timestamp: now });
      }
    }
  }

  /**
   * Handle connection timeout
   * @param {Object} socket - Socket instance
   */
  handleConnectionTimeout(socket) {
    this.connectionStats.timeouts++;
    
    // Check if socket is actually still connected before declaring timeout
    if (!socket.connected) {
      console.log(`[ConnectionStatus] Socket actually disconnected for ${socket.username || 'Unknown'} (${socket.id})`);
      return;
    }
    
    console.warn(`[ConnectionStatus] Connection timeout for ${socket.username || 'Unknown'} (${socket.id})`);
    
    // Emit timeout warning to client
    socket.emit('connection-timeout-warning', {
      message: 'Connection appears to be unstable',
      timestamp: new Date().toISOString()
    });

    // Set up recovery timer
    this.setupConnectionRecovery(socket);
  }

  /**
   * Set up connection recovery for timed out connections
   * @param {Object} socket - Socket instance
   */
  setupConnectionRecovery(socket) {
    const recoveryTimeout = setTimeout(() => {
      if (socket.connected) {
        console.log(`[ConnectionStatus] Connection recovered for ${socket.username || 'Unknown'}`);
        this.connectionStats.recoveries++;
        
        // Reset the connection health data
        this.updateConnectionHealth(socket.id, {
          lastPing: Date.now(),
          errorCount: 0
        });
        
        // Update WebSocket room data to mark player as connected again
        const userId = socket.userId;
        if (userId && this.socketManager) {
          for (const [gameId, room] of this.socketManager.gameRooms.entries()) {
            if (room.players.has(userId)) {
              const player = room.players.get(userId);
              if (!player.isConnected) {
                player.isConnected = true;
                player.reconnectedAt = new Date().toISOString();
                console.log(`[ConnectionStatus] Marked ${socket.username} as connected in room ${gameId}`);
                
                // Broadcast reconnection to other players in the room
                this.socketManager.io.to(gameId).emit('player-reconnected', {
                  gameId,
                  playerId: userId,
                  playerName: socket.username,
                  players: Array.from(room.players.values()).map(p => ({
                    userId: p.userId,
                    username: p.username,
                    isReady: p.isReady,
                    teamAssignment: p.teamAssignment,
                    isConnected: p.isConnected
                  })),
                  timestamp: new Date().toISOString()
                });
              }
            }
          }
        }
        
        socket.emit('connection-recovered', {
          message: 'Connection has been restored',
          timestamp: new Date().toISOString()
        });
      } else {
        console.log(`[ConnectionStatus] Connection recovery failed for ${socket.username || 'Unknown'}`);
        socket.disconnect(true);
      }
    }, 10000); // 10 second recovery window (increased from 5)

    // Store recovery timer
    this.heartbeatTimers.set(socket.id, recoveryTimeout);
  }

  /**
   * Handle graceful degradation for connection issues
   * @param {Object} socket - Socket instance
   * @param {string} issueType - Type of connection issue
   */
  handleGracefulDegradation(socket, issueType) {
    const degradationStrategies = {
      'slow_connection': {
        message: 'Connection is slow, reducing update frequency',
        action: 'reduce_updates'
      },
      'intermittent_connection': {
        message: 'Connection is unstable, enabling offline mode',
        action: 'enable_offline'
      },
      'high_latency': {
        message: 'High latency detected, optimizing for performance',
        action: 'optimize_performance'
      }
    };

    const strategy = degradationStrategies[issueType];
    if (strategy) {
      socket.emit('connection-degradation', {
        issueType,
        message: strategy.message,
        action: strategy.action,
        timestamp: new Date().toISOString()
      });

      console.log(`[ConnectionStatus] Applied degradation strategy for ${issueType}: ${strategy.message}`);
    }
  }

  /**
   * Clear heartbeat timer for a socket
   * @param {string} socketId - Socket ID
   */
  clearHeartbeatTimer(socketId) {
    const timer = this.heartbeatTimers.get(socketId);
    if (timer) {
      clearTimeout(timer);
      this.heartbeatTimers.delete(socketId);
    }
  }

  /**
   * Track connection health metrics
   * @param {string} socketId - Socket ID
   * @param {Object} metrics - Health metrics
   */
  updateConnectionHealth(socketId, metrics) {
    const existing = this.connectionHealth.get(socketId) || {};
    
    this.connectionHealth.set(socketId, {
      ...existing,
      ...metrics,
      lastUpdate: Date.now()
    });
  }

  /**
   * Get connection health for a specific socket
   * @param {string} socketId - Socket ID
   * @returns {Object} Health data
   */
  getConnectionHealth(socketId) {
    return this.connectionHealth.get(socketId);
  }

  /**
   * Handle WebSocket errors with recovery strategies
   * @param {Object} socket - Socket instance
   * @param {Error} error - Error object
   */
  handleWebSocketError(socket, error) {
    this.connectionStats.errors++;
    
    const errorInfo = {
      type: error.name || 'UnknownError',
      message: error.message,
      code: error.code,
      timestamp: new Date().toISOString()
    };

    console.error(`[ConnectionStatus] WebSocket error for ${socket.username || 'Unknown'}:`, errorInfo);

    // Determine recovery strategy based on error type
    let recoveryStrategy = 'reconnect';
    
    switch (error.code) {
      case 'ECONNRESET':
      case 'ENOTFOUND':
        recoveryStrategy = 'reconnect_with_delay';
        break;
      case 'ETIMEDOUT':
        recoveryStrategy = 'optimize_connection';
        break;
      default:
        recoveryStrategy = 'graceful_degradation';
    }

    // Send error info and recovery strategy to client
    socket.emit('websocket-error', {
      ...errorInfo,
      recoveryStrategy,
      canRecover: true
    });

    // Apply recovery strategy
    this.applyRecoveryStrategy(socket, recoveryStrategy, error);
  }

  /**
   * Apply recovery strategy for connection errors
   * @param {Object} socket - Socket instance
   * @param {string} strategy - Recovery strategy
   * @param {Error} error - Original error
   */
  applyRecoveryStrategy(socket, strategy, error) {
    switch (strategy) {
      case 'reconnect':
        // Immediate reconnection attempt
        socket.emit('recovery-instruction', {
          action: 'reconnect',
          delay: 0,
          message: 'Please reconnect immediately'
        });
        break;

      case 'reconnect_with_delay':
        // Delayed reconnection with exponential backoff
        const delay = Math.min(this.reconnectDelay * Math.pow(2, socket.reconnectAttempts || 0), 30000);
        socket.emit('recovery-instruction', {
          action: 'reconnect',
          delay,
          message: `Reconnecting in ${delay}ms`
        });
        break;

      case 'optimize_connection':
        // Switch to more reliable transport
        socket.emit('recovery-instruction', {
          action: 'optimize',
          message: 'Switching to more reliable connection mode'
        });
        break;

      case 'graceful_degradation':
        // Enable offline mode or reduced functionality
        this.handleGracefulDegradation(socket, 'intermittent_connection');
        break;
    }
  }

  /**
   * Monitor connection quality and suggest optimizations
   * @param {string} socketId - Socket ID
   */
  monitorConnectionQuality(socketId) {
    const health = this.connectionHealth.get(socketId);
    if (!health) return;

    const now = Date.now();
    const socket = this.socketManager.io.sockets.sockets.get(socketId);
    
    if (!socket) return;

    // Calculate connection metrics
    const avgLatency = health.latencyHistory ? 
      health.latencyHistory.reduce((a, b) => a + b, 0) / health.latencyHistory.length : 0;
    
    const connectionAge = now - (health.connectedAt || now);
    const errorRate = (health.errorCount || 0) / Math.max(connectionAge / 60000, 1); // errors per minute

    // Suggest optimizations based on metrics
    if (avgLatency > 1000) {
      this.handleGracefulDegradation(socket, 'high_latency');
    } else if (errorRate > 5) {
      this.handleGracefulDegradation(socket, 'intermittent_connection');
    } else if (avgLatency > 500) {
      this.handleGracefulDegradation(socket, 'slow_connection');
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
      errors: 0,
      timeouts: 0,
      recoveries: 0
    };
    
    console.log('[ConnectionStatus] Connection statistics reset');
  }

  /**
   * Cleanup connection monitoring
   */
  cleanup() {
    // Clear all heartbeat timers
    for (const timer of this.heartbeatTimers.values()) {
      clearTimeout(timer);
    }
    
    this.heartbeatTimers.clear();
    this.connectionHealth.clear();
    
    console.log('[ConnectionStatus] Cleaned up connection monitoring');
  }
}

export default ConnectionStatusManager;