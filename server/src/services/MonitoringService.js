/**
 * Monitoring Service
 * Comprehensive monitoring and diagnostics for websocket connections,
 * state synchronization, and lobby performance
 */

class MonitoringService {
    constructor(socketManager, connectionStatusManager, periodicReconciliationService) {
        this.socketManager = socketManager;
        this.connectionStatusManager = connectionStatusManager;
        this.periodicReconciliationService = periodicReconciliationService;
        
        // Monitoring configuration
        this.config = {
            metricsRetentionPeriod: 24 * 60 * 60 * 1000, // 24 hours
            performanceSampleSize: 100,
            alertThresholds: {
                connectionFailureRate: 0.05, // 5%
                averageLatency: 1000, // 1 second
                stateInconsistencyRate: 0.1, // 10%
                reconnectionRate: 0.2 // 20%
            }
        };
        
        // Metrics storage
        this.metrics = {
            websocketHealth: {
                connections: new Map(), // socketId -> health data
                connectionEvents: [], // connection/disconnection events
                latencyMeasurements: [], // latency measurements
                errorEvents: [] // error events
            },
            stateSynchronization: {
                syncEvents: [], // state sync events
                inconsistencies: [], // detected inconsistencies
                reconciliations: [], // reconciliation events
                failedSyncs: [] // failed synchronization attempts
            },
            lobbyPerformance: {
                roomOperations: [], // room join/leave/ready operations
                gameStartEvents: [], // game start performance
                teamFormationEvents: [], // team formation performance
                broadcastLatencies: [] // broadcast latency measurements
            }
        };
        
        // Diagnostic tools
        this.diagnostics = {
            activeRoomAnalysis: new Map(), // gameId -> analysis data
            connectionDiagnostics: new Map(), // socketId -> diagnostic data
            performanceProfiles: new Map() // operation -> performance profile
        };
        
        // Monitoring intervals
        this.monitoringIntervals = new Map();
        
        // Initialize monitoring
        this.isRunning = false;
        this.startTime = Date.now();
    }

    /**
     * Start monitoring service
     */
    start() {
        if (this.isRunning) {
            console.log('[Monitoring] Service already running');
            return;
        }

        console.log('[Monitoring] Starting monitoring service');
        this.isRunning = true;
        this.startTime = Date.now();

        // Start websocket health monitoring
        this.startWebsocketHealthMonitoring();
        
        // Start state synchronization monitoring
        this.startStateSynchronizationMonitoring();
        
        // Start lobby performance monitoring
        this.startLobbyPerformanceMonitoring();
        
        // Start periodic cleanup
        this.startPeriodicCleanup();
        
        console.log('[Monitoring] Monitoring service started successfully');
    }

    /**
     * Stop monitoring service
     */
    stop() {
        if (!this.isRunning) {
            console.log('[Monitoring] Service not running');
            return;
        }

        console.log('[Monitoring] Stopping monitoring service');
        this.isRunning = false;

        // Clear all monitoring intervals
        for (const [name, intervalId] of this.monitoringIntervals) {
            clearInterval(intervalId);
            console.log(`[Monitoring] Stopped ${name} monitoring`);
        }
        this.monitoringIntervals.clear();

        console.log('[Monitoring] Monitoring service stopped');
    }

    /**
     * Start websocket health monitoring
     */
    startWebsocketHealthMonitoring() {
        // Monitor connection health every 30 seconds
        const healthInterval = setInterval(() => {
            this.collectWebsocketHealthMetrics();
        }, 30000);
        
        this.monitoringIntervals.set('websocket-health', healthInterval);

        // Monitor connection events in real-time
        this.setupWebsocketEventListeners();
        
        console.log('[Monitoring] Websocket health monitoring started');
    }

    /**
     * Setup websocket event listeners for real-time monitoring
     */
    setupWebsocketEventListeners() {
        const io = this.socketManager.io;

        // Monitor new connections
        io.on('connection', (socket) => {
            const connectionEvent = {
                type: 'connection',
                socketId: socket.id,
                userId: socket.userId,
                username: socket.username,
                timestamp: Date.now(),
                userAgent: socket.handshake.headers['user-agent'],
                ip: socket.handshake.address
            };
            
            this.recordConnectionEvent(connectionEvent);
            this.initializeConnectionDiagnostics(socket);

            // Monitor disconnections
            socket.on('disconnect', (reason) => {
                const disconnectionEvent = {
                    type: 'disconnection',
                    socketId: socket.id,
                    userId: socket.userId,
                    username: socket.username,
                    reason,
                    timestamp: Date.now(),
                    connectionDuration: Date.now() - socket.handshake.time
                };
                
                this.recordConnectionEvent(disconnectionEvent);
                this.finalizeConnectionDiagnostics(socket.id);
            });

            // Monitor ping/pong for latency
            socket.on('ping-server', (data) => {
                const latency = Date.now() - (data?.timestamp || Date.now());
                this.recordLatencyMeasurement(socket.id, latency);
            });

            // Monitor errors
            socket.on('error', (error) => {
                this.recordErrorEvent(socket.id, error);
            });
        });
    }

    /**
     * Collect websocket health metrics
     */
    collectWebsocketHealthMetrics() {
        const now = Date.now();
        const connections = this.socketManager.io.sockets.sockets;
        
        for (const [socketId, socket] of connections) {
            const healthData = {
                socketId,
                userId: socket.userId,
                username: socket.username,
                connected: socket.connected,
                connectedAt: socket.handshake.time,
                connectionDuration: now - socket.handshake.time,
                rooms: Array.from(socket.rooms),
                timestamp: now
            };

            // Get connection status from connection status manager
            const connectionHealth = this.connectionStatusManager.getConnectionHealth(socketId);
            if (connectionHealth) {
                healthData.latency = connectionHealth.latency;
                healthData.errorCount = connectionHealth.errorCount;
                healthData.lastPing = connectionHealth.lastPing;
                healthData.isHealthy = connectionHealth.isHealthy;
            }

            this.metrics.websocketHealth.connections.set(socketId, healthData);
        }

        // Clean up disconnected connections
        for (const [socketId, healthData] of this.metrics.websocketHealth.connections) {
            if (!connections.has(socketId)) {
                this.metrics.websocketHealth.connections.delete(socketId);
            }
        }
    }

    /**
     * Start state synchronization monitoring
     */
    startStateSynchronizationMonitoring() {
        // Monitor state sync events every 60 seconds
        const syncInterval = setInterval(() => {
            this.collectStateSynchronizationMetrics();
        }, 60000);
        
        this.monitoringIntervals.set('state-sync', syncInterval);

        // Setup real-time state sync monitoring
        this.setupStateSyncEventListeners();
        
        console.log('[Monitoring] State synchronization monitoring started');
    }

    /**
     * Setup state synchronization event listeners
     */
    setupStateSyncEventListeners() {
        const io = this.socketManager.io;

        // Monitor state reconciliation events
        io.on('state-reconciled', (data) => {
            this.recordStateSyncEvent({
                type: 'reconciliation',
                gameId: data.gameId,
                version: data.version,
                timestamp: Date.now(),
                success: true
            });
        });

        // Monitor reconciliation alerts
        io.on('reconciliation-alerts', (data) => {
            for (const alert of data.alerts) {
                this.recordStateInconsistency({
                    type: alert.type,
                    severity: alert.severity,
                    value: alert.value,
                    threshold: alert.threshold,
                    timestamp: Date.now()
                });
            }
        });
    }

    /**
     * Collect state synchronization metrics
     */
    collectStateSynchronizationMetrics() {
        if (this.periodicReconciliationService) {
            const reconciliationStats = this.periodicReconciliationService.getDetailedStats();
            
            const syncMetrics = {
                timestamp: Date.now(),
                totalReconciliations: reconciliationStats.totalReconciliations,
                successfulReconciliations: reconciliationStats.successfulReconciliations,
                failedReconciliations: reconciliationStats.failedReconciliations,
                inconsistenciesFound: reconciliationStats.inconsistenciesFound,
                successRate: reconciliationStats.successRate,
                inconsistencyRate: reconciliationStats.inconsistencyRate,
                activeRooms: reconciliationStats.activeRooms
            };

            this.metrics.stateSynchronization.syncEvents.push(syncMetrics);
        }
    }

    /**
     * Start lobby performance monitoring
     */
    startLobbyPerformanceMonitoring() {
        // Monitor lobby operations in real-time
        this.setupLobbyPerformanceListeners();
        
        // Collect performance metrics every 30 seconds
        const performanceInterval = setInterval(() => {
            this.collectLobbyPerformanceMetrics();
        }, 30000);
        
        this.monitoringIntervals.set('lobby-performance', performanceInterval);
        
        console.log('[Monitoring] Lobby performance monitoring started');
    }

    /**
     * Setup lobby performance event listeners
     */
    setupLobbyPerformanceListeners() {
        const io = this.socketManager.io;

        // Monitor room operations
        io.on('room-joined', (data) => {
            this.recordRoomOperation('join', data.gameId, data.timestamp);
        });

        io.on('player-left', (data) => {
            this.recordRoomOperation('leave', data.gameId, data.timestamp);
        });

        io.on('player-ready-changed', (data) => {
            this.recordRoomOperation('ready', data.gameId, data.timestamp);
        });

        io.on('game-starting', (data) => {
            this.recordGameStartEvent(data.gameId, data.timestamp);
        });

        io.on('teams-formed', (data) => {
            this.recordTeamFormationEvent(data.gameId, data.timestamp);
        });
    }

    /**
     * Collect lobby performance metrics
     */
    collectLobbyPerformanceMetrics() {
        const now = Date.now();
        const activeRooms = this.socketManager.gameRooms;

        for (const [gameId, room] of activeRooms) {
            const roomAnalysis = {
                gameId,
                playerCount: room.players.size,
                connectedPlayers: Array.from(room.players.values()).filter(p => p.isConnected).length,
                readyPlayers: Array.from(room.players.values()).filter(p => p.isReady).length,
                status: room.status,
                hostId: room.hostId,
                createdAt: room.createdAt,
                roomAge: now - new Date(room.createdAt).getTime(),
                timestamp: now
            };

            this.diagnostics.activeRoomAnalysis.set(gameId, roomAnalysis);
        }

        // Clean up analysis for rooms that no longer exist
        for (const gameId of this.diagnostics.activeRoomAnalysis.keys()) {
            if (!activeRooms.has(gameId)) {
                this.diagnostics.activeRoomAnalysis.delete(gameId);
            }
        }
    }

    /**
     * Start periodic cleanup of old metrics
     */
    startPeriodicCleanup() {
        const cleanupInterval = setInterval(() => {
            this.cleanupOldMetrics();
        }, 300000); // 5 minutes
        
        this.monitoringIntervals.set('cleanup', cleanupInterval);
        
        console.log('[Monitoring] Periodic cleanup started');
    }

    /**
     * Clean up old metrics based on retention period
     */
    cleanupOldMetrics() {
        const cutoffTime = Date.now() - this.config.metricsRetentionPeriod;

        // Clean up connection events
        this.metrics.websocketHealth.connectionEvents = 
            this.metrics.websocketHealth.connectionEvents.filter(event => event.timestamp > cutoffTime);

        // Clean up latency measurements
        this.metrics.websocketHealth.latencyMeasurements = 
            this.metrics.websocketHealth.latencyMeasurements.filter(measurement => measurement.timestamp > cutoffTime);

        // Clean up error events
        this.metrics.websocketHealth.errorEvents = 
            this.metrics.websocketHealth.errorEvents.filter(event => event.timestamp > cutoffTime);

        // Clean up state sync events
        this.metrics.stateSynchronization.syncEvents = 
            this.metrics.stateSynchronization.syncEvents.filter(event => event.timestamp > cutoffTime);

        // Clean up lobby performance events
        this.metrics.lobbyPerformance.roomOperations = 
            this.metrics.lobbyPerformance.roomOperations.filter(event => event.timestamp > cutoffTime);

        console.log('[Monitoring] Cleaned up old metrics');
    }

    /**
     * Record connection event
     */
    recordConnectionEvent(event) {
        this.metrics.websocketHealth.connectionEvents.push(event);
        
        // Keep only recent events to prevent memory issues
        if (this.metrics.websocketHealth.connectionEvents.length > 1000) {
            this.metrics.websocketHealth.connectionEvents.shift();
        }
    }

    /**
     * Record latency measurement
     */
    recordLatencyMeasurement(socketId, latency) {
        const measurement = {
            socketId,
            latency,
            timestamp: Date.now()
        };
        
        this.metrics.websocketHealth.latencyMeasurements.push(measurement);
        
        // Keep only recent measurements
        if (this.metrics.websocketHealth.latencyMeasurements.length > this.config.performanceSampleSize) {
            this.metrics.websocketHealth.latencyMeasurements.shift();
        }
    }

    /**
     * Record error event
     */
    recordErrorEvent(socketId, error) {
        const errorEvent = {
            socketId,
            error: {
                name: error.name,
                message: error.message,
                code: error.code,
                stack: error.stack
            },
            timestamp: Date.now()
        };
        
        this.metrics.websocketHealth.errorEvents.push(errorEvent);
        
        // Keep only recent errors
        if (this.metrics.websocketHealth.errorEvents.length > 500) {
            this.metrics.websocketHealth.errorEvents.shift();
        }
    }

    /**
     * Record state sync event
     */
    recordStateSyncEvent(event) {
        this.metrics.stateSynchronization.syncEvents.push(event);
        
        // Keep only recent events
        if (this.metrics.stateSynchronization.syncEvents.length > 500) {
            this.metrics.stateSynchronization.syncEvents.shift();
        }
    }

    /**
     * Record state inconsistency
     */
    recordStateInconsistency(inconsistency) {
        this.metrics.stateSynchronization.inconsistencies.push(inconsistency);
        
        // Keep only recent inconsistencies
        if (this.metrics.stateSynchronization.inconsistencies.length > 200) {
            this.metrics.stateSynchronization.inconsistencies.shift();
        }
    }

    /**
     * Record room operation
     */
    recordRoomOperation(operation, gameId, timestamp) {
        const operationEvent = {
            operation,
            gameId,
            timestamp: timestamp ? new Date(timestamp).getTime() : Date.now(),
            latency: Date.now() - (timestamp ? new Date(timestamp).getTime() : Date.now())
        };
        
        this.metrics.lobbyPerformance.roomOperations.push(operationEvent);
        
        // Keep only recent operations
        if (this.metrics.lobbyPerformance.roomOperations.length > 1000) {
            this.metrics.lobbyPerformance.roomOperations.shift();
        }
    }

    /**
     * Record game start event
     */
    recordGameStartEvent(gameId, timestamp) {
        const gameStartEvent = {
            gameId,
            timestamp: timestamp ? new Date(timestamp).getTime() : Date.now(),
            latency: Date.now() - (timestamp ? new Date(timestamp).getTime() : Date.now())
        };
        
        this.metrics.lobbyPerformance.gameStartEvents.push(gameStartEvent);
        
        // Keep only recent events
        if (this.metrics.lobbyPerformance.gameStartEvents.length > 100) {
            this.metrics.lobbyPerformance.gameStartEvents.shift();
        }
    }

    /**
     * Record team formation event
     */
    recordTeamFormationEvent(gameId, timestamp) {
        const teamFormationEvent = {
            gameId,
            timestamp: timestamp ? new Date(timestamp).getTime() : Date.now(),
            latency: Date.now() - (timestamp ? new Date(timestamp).getTime() : Date.now())
        };
        
        this.metrics.lobbyPerformance.teamFormationEvents.push(teamFormationEvent);
        
        // Keep only recent events
        if (this.metrics.lobbyPerformance.teamFormationEvents.length > 100) {
            this.metrics.lobbyPerformance.teamFormationEvents.shift();
        }
    }

    /**
     * Initialize connection diagnostics
     */
    initializeConnectionDiagnostics(socket) {
        const diagnostics = {
            socketId: socket.id,
            userId: socket.userId,
            username: socket.username,
            connectedAt: socket.handshake.time,
            userAgent: socket.handshake.headers['user-agent'],
            ip: socket.handshake.address,
            events: [],
            latencyHistory: [],
            errorCount: 0,
            reconnectionCount: 0
        };
        
        this.diagnostics.connectionDiagnostics.set(socket.id, diagnostics);
    }

    /**
     * Finalize connection diagnostics
     */
    finalizeConnectionDiagnostics(socketId) {
        const diagnostics = this.diagnostics.connectionDiagnostics.get(socketId);
        if (diagnostics) {
            diagnostics.disconnectedAt = Date.now();
            diagnostics.connectionDuration = diagnostics.disconnectedAt - diagnostics.connectedAt;
            
            // Keep diagnostics for a short period for analysis
            setTimeout(() => {
                this.diagnostics.connectionDiagnostics.delete(socketId);
            }, 300000); // 5 minutes
        }
    }

    /**
     * Get comprehensive monitoring dashboard data
     */
    getDashboardData() {
        const now = Date.now();
        const uptime = now - this.startTime;

        return {
            overview: {
                uptime,
                isRunning: this.isRunning,
                timestamp: now
            },
            websocketHealth: this.getWebsocketHealthSummary(),
            stateSynchronization: this.getStateSynchronizationSummary(),
            lobbyPerformance: this.getLobbyPerformanceSummary(),
            alerts: this.generateAlerts()
        };
    }

    /**
     * Get websocket health summary
     */
    getWebsocketHealthSummary() {
        const connections = Array.from(this.metrics.websocketHealth.connections.values());
        const recentEvents = this.metrics.websocketHealth.connectionEvents.filter(
            event => event.timestamp > Date.now() - 3600000 // Last hour
        );
        const recentLatencies = this.metrics.websocketHealth.latencyMeasurements.filter(
            measurement => measurement.timestamp > Date.now() - 3600000
        );

        return {
            activeConnections: connections.length,
            healthyConnections: connections.filter(c => c.connected && (c.isHealthy !== false)).length,
            averageLatency: recentLatencies.length > 0 
                ? recentLatencies.reduce((sum, m) => sum + m.latency, 0) / recentLatencies.length 
                : 0,
            connectionEvents: {
                total: recentEvents.length,
                connections: recentEvents.filter(e => e.type === 'connection').length,
                disconnections: recentEvents.filter(e => e.type === 'disconnection').length
            },
            errorRate: this.calculateErrorRate(),
            reconnectionRate: this.calculateReconnectionRate()
        };
    }

    /**
     * Get state synchronization summary
     */
    getStateSynchronizationSummary() {
        const recentSyncEvents = this.metrics.stateSynchronization.syncEvents.filter(
            event => event.timestamp > Date.now() - 3600000
        );
        const recentInconsistencies = this.metrics.stateSynchronization.inconsistencies.filter(
            inconsistency => inconsistency.timestamp > Date.now() - 3600000
        );

        return {
            totalSyncEvents: recentSyncEvents.length,
            successfulSyncs: recentSyncEvents.filter(e => e.success).length,
            failedSyncs: recentSyncEvents.filter(e => !e.success).length,
            inconsistenciesFound: recentInconsistencies.length,
            inconsistencyTypes: this.groupInconsistenciesByType(recentInconsistencies),
            averageSuccessRate: recentSyncEvents.length > 0 
                ? recentSyncEvents.reduce((sum, e) => sum + (e.successRate || 0), 0) / recentSyncEvents.length 
                : 100
        };
    }

    /**
     * Get lobby performance summary
     */
    getLobbyPerformanceSummary() {
        const recentOperations = this.metrics.lobbyPerformance.roomOperations.filter(
            op => op.timestamp > Date.now() - 3600000
        );
        const recentGameStarts = this.metrics.lobbyPerformance.gameStartEvents.filter(
            event => event.timestamp > Date.now() - 3600000
        );

        return {
            activeRooms: this.diagnostics.activeRoomAnalysis.size,
            roomOperations: {
                total: recentOperations.length,
                joins: recentOperations.filter(op => op.operation === 'join').length,
                leaves: recentOperations.filter(op => op.operation === 'leave').length,
                readyChanges: recentOperations.filter(op => op.operation === 'ready').length
            },
            gameStarts: recentGameStarts.length,
            averageOperationLatency: recentOperations.length > 0 
                ? recentOperations.reduce((sum, op) => sum + op.latency, 0) / recentOperations.length 
                : 0,
            roomAnalysis: Array.from(this.diagnostics.activeRoomAnalysis.values())
        };
    }

    /**
     * Generate alerts based on thresholds
     */
    generateAlerts() {
        const alerts = [];
        const thresholds = this.config.alertThresholds;

        // Check connection failure rate
        const errorRate = this.calculateErrorRate();
        if (errorRate > thresholds.connectionFailureRate) {
            alerts.push({
                type: 'HIGH_CONNECTION_FAILURE_RATE',
                severity: 'high',
                message: `Connection failure rate is ${(errorRate * 100).toFixed(2)}%`,
                value: errorRate,
                threshold: thresholds.connectionFailureRate
            });
        }

        // Check average latency
        const avgLatency = this.calculateAverageLatency();
        if (avgLatency > thresholds.averageLatency) {
            alerts.push({
                type: 'HIGH_AVERAGE_LATENCY',
                severity: 'medium',
                message: `Average latency is ${avgLatency.toFixed(0)}ms`,
                value: avgLatency,
                threshold: thresholds.averageLatency
            });
        }

        // Check state inconsistency rate
        const inconsistencyRate = this.calculateInconsistencyRate();
        if (inconsistencyRate > thresholds.stateInconsistencyRate) {
            alerts.push({
                type: 'HIGH_STATE_INCONSISTENCY_RATE',
                severity: 'high',
                message: `State inconsistency rate is ${(inconsistencyRate * 100).toFixed(2)}%`,
                value: inconsistencyRate,
                threshold: thresholds.stateInconsistencyRate
            });
        }

        return alerts;
    }

    /**
     * Calculate error rate
     */
    calculateErrorRate() {
        const recentEvents = this.metrics.websocketHealth.connectionEvents.filter(
            event => event.timestamp > Date.now() - 3600000
        );
        const recentErrors = this.metrics.websocketHealth.errorEvents.filter(
            event => event.timestamp > Date.now() - 3600000
        );

        return recentEvents.length > 0 ? recentErrors.length / recentEvents.length : 0;
    }

    /**
     * Calculate reconnection rate
     */
    calculateReconnectionRate() {
        const recentEvents = this.metrics.websocketHealth.connectionEvents.filter(
            event => event.timestamp > Date.now() - 3600000
        );
        const connections = recentEvents.filter(e => e.type === 'connection');
        const reconnections = connections.filter(e => e.isReconnection);

        return connections.length > 0 ? reconnections.length / connections.length : 0;
    }

    /**
     * Calculate average latency
     */
    calculateAverageLatency() {
        const recentLatencies = this.metrics.websocketHealth.latencyMeasurements.filter(
            measurement => measurement.timestamp > Date.now() - 3600000
        );

        return recentLatencies.length > 0 
            ? recentLatencies.reduce((sum, m) => sum + m.latency, 0) / recentLatencies.length 
            : 0;
    }

    /**
     * Calculate inconsistency rate
     */
    calculateInconsistencyRate() {
        const recentSyncEvents = this.metrics.stateSynchronization.syncEvents.filter(
            event => event.timestamp > Date.now() - 3600000
        );
        const recentInconsistencies = this.metrics.stateSynchronization.inconsistencies.filter(
            inconsistency => inconsistency.timestamp > Date.now() - 3600000
        );

        return recentSyncEvents.length > 0 ? recentInconsistencies.length / recentSyncEvents.length : 0;
    }

    /**
     * Group inconsistencies by type
     */
    groupInconsistenciesByType(inconsistencies) {
        const grouped = {};
        for (const inconsistency of inconsistencies) {
            grouped[inconsistency.type] = (grouped[inconsistency.type] || 0) + 1;
        }
        return grouped;
    }

    /**
     * Get detailed diagnostics for a specific room
     */
    getRoomDiagnostics(gameId) {
        const roomAnalysis = this.diagnostics.activeRoomAnalysis.get(gameId);
        const roomOperations = this.metrics.lobbyPerformance.roomOperations.filter(
            op => op.gameId === gameId
        );

        return {
            analysis: roomAnalysis,
            operations: roomOperations,
            players: this.getRoomPlayerDiagnostics(gameId)
        };
    }

    /**
     * Get player diagnostics for a room
     */
    getRoomPlayerDiagnostics(gameId) {
        const room = this.socketManager.gameRooms.get(gameId);
        if (!room) return [];

        const playerDiagnostics = [];
        for (const [playerId, player] of room.players) {
            const socketId = this.socketManager.userSockets.get(playerId);
            const connectionDiag = socketId ? this.diagnostics.connectionDiagnostics.get(socketId) : null;
            const healthData = socketId ? this.metrics.websocketHealth.connections.get(socketId) : null;

            playerDiagnostics.push({
                playerId,
                username: player.username,
                isConnected: player.isConnected,
                isReady: player.isReady,
                teamAssignment: player.teamAssignment,
                socketId,
                connectionHealth: healthData,
                connectionDiagnostics: connectionDiag
            });
        }

        return playerDiagnostics;
    }

    /**
     * Export metrics for external monitoring systems
     */
    exportMetrics() {
        return {
            timestamp: Date.now(),
            websocketHealth: {
                connections: Array.from(this.metrics.websocketHealth.connections.values()),
                connectionEvents: this.metrics.websocketHealth.connectionEvents.slice(-100),
                latencyMeasurements: this.metrics.websocketHealth.latencyMeasurements.slice(-100),
                errorEvents: this.metrics.websocketHealth.errorEvents.slice(-50)
            },
            stateSynchronization: {
                syncEvents: this.metrics.stateSynchronization.syncEvents.slice(-50),
                inconsistencies: this.metrics.stateSynchronization.inconsistencies.slice(-50)
            },
            lobbyPerformance: {
                roomOperations: this.metrics.lobbyPerformance.roomOperations.slice(-100),
                gameStartEvents: this.metrics.lobbyPerformance.gameStartEvents.slice(-20),
                teamFormationEvents: this.metrics.lobbyPerformance.teamFormationEvents.slice(-20)
            }
        };
    }

    /**
     * Reset all metrics
     */
    resetMetrics() {
        this.metrics = {
            websocketHealth: {
                connections: new Map(),
                connectionEvents: [],
                latencyMeasurements: [],
                errorEvents: []
            },
            stateSynchronization: {
                syncEvents: [],
                inconsistencies: [],
                reconciliations: [],
                failedSyncs: []
            },
            lobbyPerformance: {
                roomOperations: [],
                gameStartEvents: [],
                teamFormationEvents: [],
                broadcastLatencies: []
            }
        };

        this.diagnostics = {
            activeRoomAnalysis: new Map(),
            connectionDiagnostics: new Map(),
            performanceProfiles: new Map()
        };

        console.log('[Monitoring] All metrics reset');
    }
}

export default MonitoringService;