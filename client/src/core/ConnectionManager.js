/**
 * Client-side Connection Manager
 * Handles connection monitoring, error recovery, and graceful degradation
 */

export class ConnectionManager {
    constructor(socketManager) {
        this.socketManager = socketManager;
        this.connectionState = 'disconnected';
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.maxReconnectDelay = 30000;
        this.heartbeatInterval = 15000; // Match server heartbeat interval
        this.connectionTimeout = 60000; // Match server timeout
        
        // Connection health tracking
        this.latencyHistory = [];
        this.errorCount = 0;
        this.lastPingTime = null;
        this.heartbeatTimer = null;
        this.connectionTimer = null;
        
        // Offline mode and degradation
        this.isOfflineMode = false;
        this.isDegraded = false;
        this.degradationLevel = 0; // 0 = normal, 1 = reduced, 2 = minimal
        
        // Event listeners
        this.listeners = new Map();
        
        this.setupConnectionMonitoring();
    }

    /**
     * Set up connection monitoring and event handlers
     */
    setupConnectionMonitoring() {
        if (!this.socketManager) return;

        // Connection state events
        this.socketManager.on('connect', () => {
            this.handleConnection();
        });

        this.socketManager.on('disconnect', (reason) => {
            this.handleDisconnection(reason);
        });

        this.socketManager.on('reconnect', () => {
            this.handleReconnection();
        });

        this.socketManager.on('connect_error', (error) => {
            this.handleConnectionError(error);
        });

        // Server-sent connection status events
        this.socketManager.on('connection-status', (data) => {
            this.handleServerConnectionStatus(data);
        });

        this.socketManager.on('connection-timeout-warning', (data) => {
            this.handleTimeoutWarning(data);
        });

        this.socketManager.on('connection-recovered', (data) => {
            this.handleConnectionRecovery(data);
        });

        this.socketManager.on('connection-degradation', (data) => {
            this.handleConnectionDegradation(data);
        });

        this.socketManager.on('websocket-error', (data) => {
            this.handleWebSocketError(data);
        });

        this.socketManager.on('recovery-instruction', (data) => {
            this.handleRecoveryInstruction(data);
        });

        // Ping/pong for health monitoring
        this.socketManager.on('pong-server', (data) => {
            this.handlePongResponse(data);
        });

        // Handle server health check pings
        this.socketManager.on('ping-health-check', (data) => {
            this.handleHealthCheckPing(data);
        });

        // Start heartbeat monitoring
        this.startHeartbeat();
    }

    /**
     * Handle successful connection
     */
    handleConnection() {
        this.connectionState = 'connected';
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.errorCount = 0;
        this.isOfflineMode = false;
        
        // Clear any existing timers
        this.clearConnectionTimer();
        
        console.log('[ConnectionManager] Connected successfully');
        this.emit('connectionChange', {
            state: 'connected',
            timestamp: new Date().toISOString()
        });

        // Start connection health monitoring
        this.startConnectionHealthCheck();
    }

    /**
     * Handle disconnection
     * @param {string} reason - Disconnection reason
     */
    handleDisconnection(reason) {
        this.connectionState = 'disconnected';
        
        console.log(`[ConnectionManager] Disconnected: ${reason}`);
        this.emit('connectionChange', {
            state: 'disconnected',
            reason,
            timestamp: new Date().toISOString()
        });

        // Stop health monitoring
        this.stopConnectionHealthCheck();

        // Determine if we should attempt reconnection
        if (this.shouldAttemptReconnection(reason)) {
            this.scheduleReconnection();
        } else {
            this.enableOfflineMode();
        }
    }

    /**
     * Handle successful reconnection
     */
    handleReconnection() {
        this.connectionState = 'connected';
        this.reconnectAttempts = 0;
        this.isOfflineMode = false;
        this.isDegraded = false;
        this.degradationLevel = 0;
        
        console.log('[ConnectionManager] Reconnected successfully');
        this.emit('connectionChange', {
            state: 'reconnected',
            timestamp: new Date().toISOString()
        });

        this.startConnectionHealthCheck();
    }

    /**
     * Handle connection errors
     * @param {Error} error - Connection error
     */
    handleConnectionError(error) {
        this.errorCount++;
        this.connectionState = 'error';
        
        console.error('[ConnectionManager] Connection error:', error);
        this.emit('connectionError', {
            error: error.message,
            code: error.code,
            timestamp: new Date().toISOString()
        });

        // Report issue to server if connected
        if (this.socketManager.socket && this.socketManager.socket.connected) {
            this.socketManager.send('connection-issue', {
                type: 'client_error',
                message: error.message,
                code: error.code
            });
        }
    }

    /**
     * Handle server connection status updates
     * @param {Object} data - Status data from server
     */
    handleServerConnectionStatus(data) {
        console.log('[ConnectionManager] Server connection status:', data);
        this.emit('serverStatus', data);
    }

    /**
     * Handle timeout warning from server
     * @param {Object} data - Warning data
     */
    handleTimeoutWarning(data) {
        console.warn('[ConnectionManager] Connection timeout warning:', data.message);
        this.emit('timeoutWarning', data);
        
        // Attempt to improve connection
        this.optimizeConnection();
    }

    /**
     * Handle connection recovery notification
     * @param {Object} data - Recovery data
     */
    handleConnectionRecovery(data) {
        console.log('[ConnectionManager] Connection recovered:', data.message);
        this.isDegraded = false;
        this.degradationLevel = 0;
        this.emit('connectionRecovered', data);
    }

    /**
     * Handle connection degradation instructions
     * @param {Object} data - Degradation data
     */
    handleConnectionDegradation(data) {
        console.log(`[ConnectionManager] Connection degradation: ${data.issueType} - ${data.message}`);
        
        this.isDegraded = true;
        
        switch (data.action) {
            case 'reduce_updates':
                this.degradationLevel = 1;
                this.reduceUpdateFrequency();
                break;
            case 'enable_offline':
                this.degradationLevel = 2;
                this.enableOfflineMode();
                break;
            case 'optimize_performance':
                this.degradationLevel = 1;
                this.optimizePerformance();
                break;
        }
        
        this.emit('connectionDegraded', {
            issueType: data.issueType,
            level: this.degradationLevel,
            message: data.message
        });
    }

    /**
     * Handle WebSocket errors from server
     * @param {Object} data - Error data
     */
    handleWebSocketError(data) {
        console.error('[ConnectionManager] WebSocket error:', data);
        this.emit('websocketError', data);
        
        if (data.canRecover) {
            this.applyRecoveryStrategy(data.recoveryStrategy);
        }
    }

    /**
     * Handle recovery instructions from server
     * @param {Object} data - Recovery instruction data
     */
    handleRecoveryInstruction(data) {
        console.log(`[ConnectionManager] Recovery instruction: ${data.action}`);
        
        switch (data.action) {
            case 'reconnect':
                if (data.delay > 0) {
                    setTimeout(() => this.attemptReconnection(), data.delay);
                } else {
                    this.attemptReconnection();
                }
                break;
            case 'optimize':
                this.optimizeConnection();
                break;
        }
        
        this.emit('recoveryInstruction', data);
    }

    /**
     * Start heartbeat monitoring
     */
    startHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }
        
        this.heartbeatTimer = setInterval(() => {
            this.sendHeartbeat();
        }, this.heartbeatInterval);
    }

    /**
     * Send heartbeat ping to server
     */
    sendHeartbeat() {
        if (this.socketManager.socket && this.socketManager.socket.connected) {
            this.lastPingTime = Date.now();
            this.socketManager.send('ping-server', {
                timestamp: this.lastPingTime
            });
        }
    }

    /**
     * Handle pong response from server
     * @param {Object} data - Pong data
     */
    handlePongResponse(data) {
        if (this.lastPingTime) {
            const latency = Date.now() - this.lastPingTime;
            
            // Update latency history
            this.latencyHistory.push(latency);
            if (this.latencyHistory.length > 10) {
                this.latencyHistory.shift();
            }
            
            // Check connection quality
            this.checkConnectionQuality(latency);
            
            this.emit('heartbeat', {
                latency,
                serverTime: data.serverTime,
                timestamp: data.timestamp
            });
        }
    }

    /**
     * Handle health check ping from server
     * @param {Object} data - Ping data
     */
    handleHealthCheckPing(data) {
        // Immediately respond to server health check
        if (this.socketManager.socket && this.socketManager.socket.connected) {
            this.socketManager.send('pong-health-check', {
                timestamp: data.timestamp,
                clientTime: Date.now()
            });
        }
    }

    /**
     * Check connection quality based on latency
     * @param {number} latency - Current latency
     */
    checkConnectionQuality(latency) {
        const avgLatency = this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length;
        
        let quality = 'excellent';
        if (avgLatency > 1000) {
            quality = 'poor';
        } else if (avgLatency > 500) {
            quality = 'fair';
        } else if (avgLatency > 200) {
            quality = 'good';
        }
        
        this.emit('connectionQuality', {
            quality,
            latency,
            avgLatency,
            timestamp: new Date().toISOString()
        });
        
        // Auto-optimize if quality is poor
        if (quality === 'poor' && !this.isDegraded) {
            this.optimizeConnection();
        }
    }

    /**
     * Start connection health check timer
     */
    startConnectionHealthCheck() {
        this.connectionTimer = setTimeout(() => {
            if (this.connectionState === 'connected') {
                console.warn('[ConnectionManager] Connection health check timeout');
                this.handleConnectionTimeout();
            }
        }, this.connectionTimeout);
    }

    /**
     * Stop connection health check timer
     */
    stopConnectionHealthCheck() {
        if (this.connectionTimer) {
            clearTimeout(this.connectionTimer);
            this.connectionTimer = null;
        }
    }

    /**
     * Clear connection timer
     */
    clearConnectionTimer() {
        this.stopConnectionHealthCheck();
    }

    /**
     * Handle connection timeout
     */
    handleConnectionTimeout() {
        console.warn('[ConnectionManager] Connection timeout detected');
        this.emit('connectionTimeout', {
            timestamp: new Date().toISOString()
        });
        
        // Attempt to recover connection
        this.optimizeConnection();
    }

    /**
     * Determine if reconnection should be attempted
     * @param {string} reason - Disconnection reason
     * @returns {boolean} Should attempt reconnection
     */
    shouldAttemptReconnection(reason) {
        // Don't reconnect if manually disconnected
        if (reason === 'io client disconnect') {
            return false;
        }
        
        // Don't reconnect if max attempts reached
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            return false;
        }
        
        return true;
    }

    /**
     * Schedule reconnection attempt
     */
    scheduleReconnection() {
        this.reconnectAttempts++;
        const delay = Math.min(
            this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
            this.maxReconnectDelay
        );
        
        this.connectionState = 'reconnecting';
        
        console.log(`[ConnectionManager] Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
        this.emit('connectionChange', {
            state: 'reconnecting',
            attempt: this.reconnectAttempts,
            delay,
            timestamp: new Date().toISOString()
        });
        
        setTimeout(() => {
            this.attemptReconnection();
        }, delay);
    }

    /**
     * Attempt to reconnect
     */
    attemptReconnection() {
        if (this.socketManager) {
            console.log(`[ConnectionManager] Attempting reconnection (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            this.socketManager.connect().catch((error) => {
                console.error('[ConnectionManager] Reconnection failed:', error);
                
                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.scheduleReconnection();
                } else {
                    this.enableOfflineMode();
                }
            });
        }
    }

    /**
     * Apply recovery strategy
     * @param {string} strategy - Recovery strategy
     */
    applyRecoveryStrategy(strategy) {
        switch (strategy) {
            case 'reconnect':
                this.attemptReconnection();
                break;
            case 'reconnect_with_delay':
                this.scheduleReconnection();
                break;
            case 'optimize_connection':
                this.optimizeConnection();
                break;
            case 'graceful_degradation':
                this.enableGracefulDegradation();
                break;
        }
    }

    /**
     * Optimize connection settings
     */
    optimizeConnection() {
        console.log('[ConnectionManager] Optimizing connection');
        
        // Reduce heartbeat frequency
        this.heartbeatInterval = Math.min(this.heartbeatInterval * 1.5, 30000);
        this.startHeartbeat();
        
        // Enable compression if available
        if (this.socketManager.socket) {
            this.socketManager.socket.compress(true);
        }
        
        this.emit('connectionOptimized', {
            heartbeatInterval: this.heartbeatInterval,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Reduce update frequency for degraded connections
     */
    reduceUpdateFrequency() {
        console.log('[ConnectionManager] Reducing update frequency');
        this.emit('updateFrequencyReduced', {
            level: this.degradationLevel,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Optimize performance for slow connections
     */
    optimizePerformance() {
        console.log('[ConnectionManager] Optimizing performance');
        this.emit('performanceOptimized', {
            level: this.degradationLevel,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Enable offline mode
     */
    enableOfflineMode() {
        this.isOfflineMode = true;
        this.connectionState = 'offline';
        
        console.log('[ConnectionManager] Offline mode enabled');
        this.emit('connectionChange', {
            state: 'offline',
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Enable graceful degradation
     */
    enableGracefulDegradation() {
        this.isDegraded = true;
        this.degradationLevel = 1;
        
        console.log('[ConnectionManager] Graceful degradation enabled');
        this.emit('gracefulDegradation', {
            level: this.degradationLevel,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Add event listener
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    /**
     * Remove event listener
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     */
    off(event, callback) {
        if (this.listeners.has(event)) {
            const callbacks = this.listeners.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * Emit event to listeners
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`[ConnectionManager] Error in listener for ${event}:`, error);
                }
            });
        }
    }

    /**
     * Get current connection status
     * @returns {Object} Connection status
     */
    getStatus() {
        return {
            state: this.connectionState,
            isOffline: this.isOfflineMode,
            isDegraded: this.isDegraded,
            degradationLevel: this.degradationLevel,
            reconnectAttempts: this.reconnectAttempts,
            errorCount: this.errorCount,
            avgLatency: this.latencyHistory.length > 0 
                ? this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length 
                : 0,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Force connection check
     */
    checkConnection() {
        this.sendHeartbeat();
    }

    /**
     * Cleanup connection manager
     */
    cleanup() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }
        
        this.clearConnectionTimer();
        this.listeners.clear();
        
        console.log('[ConnectionManager] Cleaned up');
    }
}