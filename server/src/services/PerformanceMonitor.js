/**
 * Performance Monitor
 * Specialized monitoring for real-time update latency,
 * broadcast performance, and system resource usage
 */

class PerformanceMonitor {
    constructor(socketManager) {
        this.socketManager = socketManager;
        
        // Performance tracking configuration
        this.config = {
            latencyThresholds: {
                excellent: 50,    // < 50ms
                good: 100,        // < 100ms
                acceptable: 250,  // < 250ms
                poor: 500,        // < 500ms
                critical: 1000    // >= 1000ms
            },
            sampleSize: 1000,
            measurementWindow: 300000, // 5 minutes
            alertThresholds: {
                averageLatency: 200,
                p95Latency: 500,
                errorRate: 0.05,
                throughput: 10 // operations per second
            }
        };
        
        // Performance metrics storage
        this.metrics = {
            latencyMeasurements: [],
            broadcastMetrics: [],
            operationMetrics: new Map(), // operation type -> metrics
            systemMetrics: [],
            errorMetrics: []
        };
        
        // Real-time tracking
        this.activeOperations = new Map(); // operationId -> start time
        this.operationCounter = 0;
        
        // Performance profiles
        this.profiles = {
            roomOperations: new Map(), // gameId -> performance profile
            userOperations: new Map(), // userId -> performance profile
            systemProfile: {
                startTime: Date.now(),
                totalOperations: 0,
                totalLatency: 0,
                errorCount: 0
            }
        };
        
        // Monitoring state
        this.isMonitoring = false;
        this.monitoringInterval = null;
    }

    /**
     * Start performance monitoring
     */
    start() {
        if (this.isMonitoring) {
            console.log('[PerformanceMonitor] Already monitoring');
            return;
        }

        console.log('[PerformanceMonitor] Starting performance monitoring');
        this.isMonitoring = true;
        
        // Setup real-time event monitoring
        this.setupEventMonitoring();
        
        // Start periodic system metrics collection
        this.monitoringInterval = setInterval(() => {
            this.collectSystemMetrics();
        }, 30000); // Every 30 seconds
        
        console.log('[PerformanceMonitor] Performance monitoring started');
    }

    /**
     * Stop performance monitoring
     */
    stop() {
        if (!this.isMonitoring) {
            console.log('[PerformanceMonitor] Not currently monitoring');
            return;
        }

        console.log('[PerformanceMonitor] Stopping performance monitoring');
        this.isMonitoring = false;
        
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        
        console.log('[PerformanceMonitor] Performance monitoring stopped');
    }

    /**
     * Setup event monitoring for real-time operations
     */
    setupEventMonitoring() {
        const io = this.socketManager.io;

        // Monitor connection events
        io.on('connection', (socket) => {
            // Monitor room join operations
            socket.on('join-game-room', (data) => {
                const operationId = this.startOperation('room_join', {
                    gameId: data.gameId,
                    userId: socket.userId,
                    socketId: socket.id
                });
                
                // Store operation ID for completion tracking
                socket._currentJoinOperation = operationId;
            });

            // Monitor room join completion
            socket.on('room-joined', (data) => {
                if (socket._currentJoinOperation) {
                    this.endOperation(socket._currentJoinOperation, true, {
                        gameId: data.gameId,
                        playerCount: data.playerCount
                    });
                    delete socket._currentJoinOperation;
                }
            });

            // Monitor ready status changes
            socket.on('player-ready', (data) => {
                const operationId = this.startOperation('ready_change', {
                    gameId: data.gameId,
                    userId: socket.userId,
                    isReady: data.isReady
                });
                
                socket._currentReadyOperation = operationId;
            });

            // Monitor ready status completion
            socket.on('player-ready-changed', (data) => {
                if (socket._currentReadyOperation) {
                    this.endOperation(socket._currentReadyOperation, true, {
                        gameId: data.gameId,
                        allReady: data.allReady
                    });
                    delete socket._currentReadyOperation;
                }
            });

            // Monitor team formation
            socket.on('form-teams', (data) => {
                const operationId = this.startOperation('team_formation', {
                    gameId: data.gameId,
                    userId: socket.userId
                });
                
                socket._currentTeamOperation = operationId;
            });

            // Monitor team formation completion
            socket.on('teams-formed', (data) => {
                if (socket._currentTeamOperation) {
                    this.endOperation(socket._currentTeamOperation, true, {
                        gameId: data.gameId,
                        teams: data.teams
                    });
                    delete socket._currentTeamOperation;
                }
            });

            // Monitor game start
            socket.on('start-game', (data) => {
                const operationId = this.startOperation('game_start', {
                    gameId: data.gameId,
                    userId: socket.userId
                });
                
                socket._currentGameStartOperation = operationId;
            });

            // Monitor game start completion
            socket.on('game-starting', (data) => {
                if (socket._currentGameStartOperation) {
                    this.endOperation(socket._currentGameStartOperation, true, {
                        gameId: data.gameId
                    });
                    delete socket._currentGameStartOperation;
                }
            });

            // Monitor broadcast operations
            this.monitorBroadcastOperations(socket);
            
            // Monitor error events
            socket.on('error', (error) => {
                this.recordError('socket_error', error, {
                    socketId: socket.id,
                    userId: socket.userId
                });
            });
        });
    }

    /**
     * Monitor broadcast operations for latency measurement
     */
    monitorBroadcastOperations(socket) {
        // Override socket.emit to measure broadcast latency
        const originalEmit = socket.emit.bind(socket);
        const originalBroadcast = socket.broadcast.emit.bind(socket.broadcast);
        const originalToRoom = socket.to.bind(socket);

        socket.emit = (...args) => {
            const startTime = Date.now();
            const result = originalEmit(...args);
            
            this.recordBroadcastMetric('socket_emit', {
                event: args[0],
                latency: Date.now() - startTime,
                socketId: socket.id,
                userId: socket.userId
            });
            
            return result;
        };

        socket.broadcast.emit = (...args) => {
            const startTime = Date.now();
            const result = originalBroadcast(...args);
            
            this.recordBroadcastMetric('broadcast_emit', {
                event: args[0],
                latency: Date.now() - startTime,
                socketId: socket.id,
                userId: socket.userId
            });
            
            return result;
        };

        // Monitor room-specific broadcasts
        socket.to = (room) => {
            const roomEmitter = originalToRoom(room);
            const originalRoomEmit = roomEmitter.emit.bind(roomEmitter);
            
            roomEmitter.emit = (...args) => {
                const startTime = Date.now();
                const result = originalRoomEmit(...args);
                
                this.recordBroadcastMetric('room_broadcast', {
                    event: args[0],
                    room,
                    latency: Date.now() - startTime,
                    socketId: socket.id,
                    userId: socket.userId
                });
                
                return result;
            };
            
            return roomEmitter;
        };
    }

    /**
     * Start tracking an operation
     */
    startOperation(operationType, metadata = {}) {
        const operationId = `${operationType}_${Date.now()}_${++this.operationCounter}`;
        const startTime = Date.now();
        
        this.activeOperations.set(operationId, {
            id: operationId,
            type: operationType,
            startTime,
            metadata
        });
        
        return operationId;
    }

    /**
     * End tracking an operation
     */
    endOperation(operationId, success = true, result = {}) {
        const operation = this.activeOperations.get(operationId);
        if (!operation) {
            console.warn(`[PerformanceMonitor] Operation ${operationId} not found`);
            return;
        }
        
        const endTime = Date.now();
        const latency = endTime - operation.startTime;
        
        // Record the operation metric
        this.recordOperationMetric(operation.type, {
            operationId,
            latency,
            success,
            startTime: operation.startTime,
            endTime,
            metadata: operation.metadata,
            result
        });
        
        // Update system profile
        this.profiles.systemProfile.totalOperations++;
        this.profiles.systemProfile.totalLatency += latency;
        if (!success) {
            this.profiles.systemProfile.errorCount++;
        }
        
        // Update room profile if applicable
        if (operation.metadata.gameId) {
            this.updateRoomProfile(operation.metadata.gameId, operation.type, latency, success);
        }
        
        // Update user profile if applicable
        if (operation.metadata.userId) {
            this.updateUserProfile(operation.metadata.userId, operation.type, latency, success);
        }
        
        // Clean up
        this.activeOperations.delete(operationId);
        
        return {
            operationId,
            type: operation.type,
            latency,
            success
        };
    }

    /**
     * Record operation metric
     */
    recordOperationMetric(operationType, metric) {
        if (!this.metrics.operationMetrics.has(operationType)) {
            this.metrics.operationMetrics.set(operationType, []);
        }
        
        const metrics = this.metrics.operationMetrics.get(operationType);
        metrics.push({
            ...metric,
            timestamp: Date.now()
        });
        
        // Keep only recent metrics
        if (metrics.length > this.config.sampleSize) {
            metrics.shift();
        }
        
        // Record latency measurement
        this.recordLatencyMeasurement(operationType, metric.latency);
    }

    /**
     * Record latency measurement
     */
    recordLatencyMeasurement(operation, latency) {
        this.metrics.latencyMeasurements.push({
            operation,
            latency,
            timestamp: Date.now(),
            category: this.categorizeLatency(latency)
        });
        
        // Keep only recent measurements
        if (this.metrics.latencyMeasurements.length > this.config.sampleSize) {
            this.metrics.latencyMeasurements.shift();
        }
    }

    /**
     * Record broadcast metric
     */
    recordBroadcastMetric(broadcastType, metric) {
        this.metrics.broadcastMetrics.push({
            type: broadcastType,
            ...metric,
            timestamp: Date.now()
        });
        
        // Keep only recent metrics
        if (this.metrics.broadcastMetrics.length > this.config.sampleSize) {
            this.metrics.broadcastMetrics.shift();
        }
    }

    /**
     * Record error metric
     */
    recordError(errorType, error, context = {}) {
        this.metrics.errorMetrics.push({
            type: errorType,
            error: {
                name: error.name,
                message: error.message,
                code: error.code
            },
            context,
            timestamp: Date.now()
        });
        
        // Keep only recent errors
        if (this.metrics.errorMetrics.length > 500) {
            this.metrics.errorMetrics.shift();
        }
    }

    /**
     * Update room performance profile
     */
    updateRoomProfile(gameId, operationType, latency, success) {
        if (!this.profiles.roomOperations.has(gameId)) {
            this.profiles.roomOperations.set(gameId, {
                gameId,
                operations: new Map(),
                totalOperations: 0,
                totalLatency: 0,
                errorCount: 0,
                lastUpdate: Date.now()
            });
        }
        
        const profile = this.profiles.roomOperations.get(gameId);
        
        if (!profile.operations.has(operationType)) {
            profile.operations.set(operationType, {
                count: 0,
                totalLatency: 0,
                errorCount: 0,
                minLatency: Infinity,
                maxLatency: 0
            });
        }
        
        const opProfile = profile.operations.get(operationType);
        opProfile.count++;
        opProfile.totalLatency += latency;
        opProfile.minLatency = Math.min(opProfile.minLatency, latency);
        opProfile.maxLatency = Math.max(opProfile.maxLatency, latency);
        
        if (!success) {
            opProfile.errorCount++;
            profile.errorCount++;
        }
        
        profile.totalOperations++;
        profile.totalLatency += latency;
        profile.lastUpdate = Date.now();
    }

    /**
     * Update user performance profile
     */
    updateUserProfile(userId, operationType, latency, success) {
        if (!this.profiles.userOperations.has(userId)) {
            this.profiles.userOperations.set(userId, {
                userId,
                operations: new Map(),
                totalOperations: 0,
                totalLatency: 0,
                errorCount: 0,
                lastUpdate: Date.now()
            });
        }
        
        const profile = this.profiles.userOperations.get(userId);
        
        if (!profile.operations.has(operationType)) {
            profile.operations.set(operationType, {
                count: 0,
                totalLatency: 0,
                errorCount: 0,
                averageLatency: 0
            });
        }
        
        const opProfile = profile.operations.get(operationType);
        opProfile.count++;
        opProfile.totalLatency += latency;
        opProfile.averageLatency = opProfile.totalLatency / opProfile.count;
        
        if (!success) {
            opProfile.errorCount++;
            profile.errorCount++;
        }
        
        profile.totalOperations++;
        profile.totalLatency += latency;
        profile.lastUpdate = Date.now();
    }

    /**
     * Collect system metrics
     */
    collectSystemMetrics() {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        this.metrics.systemMetrics.push({
            timestamp: Date.now(),
            memory: {
                rss: memUsage.rss,
                heapTotal: memUsage.heapTotal,
                heapUsed: memUsage.heapUsed,
                external: memUsage.external
            },
            cpu: {
                user: cpuUsage.user,
                system: cpuUsage.system
            },
            uptime: process.uptime(),
            activeConnections: this.socketManager.io.sockets.sockets.size,
            activeRooms: this.socketManager.gameRooms.size,
            activeOperations: this.activeOperations.size
        });
        
        // Keep only recent system metrics
        if (this.metrics.systemMetrics.length > 100) {
            this.metrics.systemMetrics.shift();
        }
    }

    /**
     * Categorize latency based on thresholds
     */
    categorizeLatency(latency) {
        const thresholds = this.config.latencyThresholds;
        
        if (latency < thresholds.excellent) return 'excellent';
        if (latency < thresholds.good) return 'good';
        if (latency < thresholds.acceptable) return 'acceptable';
        if (latency < thresholds.poor) return 'poor';
        return 'critical';
    }

    /**
     * Get performance summary
     */
    getPerformanceSummary() {
        const now = Date.now();
        const windowStart = now - this.config.measurementWindow;
        
        // Filter recent measurements
        const recentLatencies = this.metrics.latencyMeasurements.filter(
            m => m.timestamp > windowStart
        );
        const recentBroadcasts = this.metrics.broadcastMetrics.filter(
            m => m.timestamp > windowStart
        );
        const recentErrors = this.metrics.errorMetrics.filter(
            m => m.timestamp > windowStart
        );
        
        // Calculate statistics
        const latencies = recentLatencies.map(m => m.latency);
        const broadcastLatencies = recentBroadcasts.map(m => m.latency);
        
        return {
            overview: {
                measurementWindow: this.config.measurementWindow,
                totalMeasurements: recentLatencies.length,
                totalBroadcasts: recentBroadcasts.length,
                totalErrors: recentErrors.length,
                activeOperations: this.activeOperations.size
            },
            latency: {
                average: this.calculateAverage(latencies),
                median: this.calculatePercentile(latencies, 50),
                p95: this.calculatePercentile(latencies, 95),
                p99: this.calculatePercentile(latencies, 99),
                min: Math.min(...latencies) || 0,
                max: Math.max(...latencies) || 0,
                distribution: this.getLatencyDistribution(recentLatencies)
            },
            broadcast: {
                average: this.calculateAverage(broadcastLatencies),
                median: this.calculatePercentile(broadcastLatencies, 50),
                p95: this.calculatePercentile(broadcastLatencies, 95),
                totalBroadcasts: recentBroadcasts.length,
                broadcastTypes: this.groupBroadcastsByType(recentBroadcasts)
            },
            operations: this.getOperationSummary(),
            system: this.getSystemSummary(),
            alerts: this.generatePerformanceAlerts()
        };
    }

    /**
     * Calculate average of array
     */
    calculateAverage(values) {
        return values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;
    }

    /**
     * Calculate percentile
     */
    calculatePercentile(values, percentile) {
        if (values.length === 0) return 0;
        
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }

    /**
     * Get latency distribution
     */
    getLatencyDistribution(measurements) {
        const distribution = {
            excellent: 0,
            good: 0,
            acceptable: 0,
            poor: 0,
            critical: 0
        };
        
        for (const measurement of measurements) {
            distribution[measurement.category]++;
        }
        
        return distribution;
    }

    /**
     * Group broadcasts by type
     */
    groupBroadcastsByType(broadcasts) {
        const grouped = {};
        
        for (const broadcast of broadcasts) {
            if (!grouped[broadcast.type]) {
                grouped[broadcast.type] = {
                    count: 0,
                    totalLatency: 0,
                    averageLatency: 0
                };
            }
            
            grouped[broadcast.type].count++;
            grouped[broadcast.type].totalLatency += broadcast.latency;
            grouped[broadcast.type].averageLatency = 
                grouped[broadcast.type].totalLatency / grouped[broadcast.type].count;
        }
        
        return grouped;
    }

    /**
     * Get operation summary
     */
    getOperationSummary() {
        const summary = {};
        
        for (const [operationType, metrics] of this.metrics.operationMetrics) {
            const latencies = metrics.map(m => m.latency);
            const successCount = metrics.filter(m => m.success).length;
            
            summary[operationType] = {
                totalOperations: metrics.length,
                successfulOperations: successCount,
                successRate: metrics.length > 0 ? successCount / metrics.length : 1,
                averageLatency: this.calculateAverage(latencies),
                medianLatency: this.calculatePercentile(latencies, 50),
                p95Latency: this.calculatePercentile(latencies, 95)
            };
        }
        
        return summary;
    }

    /**
     * Get system summary
     */
    getSystemSummary() {
        const recentMetrics = this.metrics.systemMetrics.slice(-10);
        if (recentMetrics.length === 0) return {};
        
        const latest = recentMetrics[recentMetrics.length - 1];
        
        return {
            current: latest,
            trends: {
                memoryUsage: recentMetrics.map(m => m.memory.heapUsed),
                activeConnections: recentMetrics.map(m => m.activeConnections),
                activeRooms: recentMetrics.map(m => m.activeRooms)
            }
        };
    }

    /**
     * Generate performance alerts
     */
    generatePerformanceAlerts() {
        const alerts = [];
        const thresholds = this.config.alertThresholds;
        
        // Calculate metrics directly to avoid circular dependency
        const now = Date.now();
        const windowStart = now - this.config.measurementWindow;
        
        const recentLatencies = this.metrics.latencyMeasurements.filter(
            m => m.timestamp > windowStart
        );
        const recentErrors = this.metrics.errorMetrics.filter(
            m => m.timestamp > windowStart
        );
        
        const latencies = recentLatencies.map(m => m.latency);
        const averageLatency = this.calculateAverage(latencies);
        const p95Latency = this.calculatePercentile(latencies, 95);
        
        // Check average latency
        if (averageLatency > thresholds.averageLatency) {
            alerts.push({
                type: 'HIGH_AVERAGE_LATENCY',
                severity: 'medium',
                message: `Average latency is ${averageLatency.toFixed(0)}ms`,
                value: averageLatency,
                threshold: thresholds.averageLatency
            });
        }
        
        // Check P95 latency
        if (p95Latency > thresholds.p95Latency) {
            alerts.push({
                type: 'HIGH_P95_LATENCY',
                severity: 'high',
                message: `P95 latency is ${p95Latency.toFixed(0)}ms`,
                value: p95Latency,
                threshold: thresholds.p95Latency
            });
        }
        
        // Check error rate
        const errorRate = recentErrors.length / Math.max(recentLatencies.length, 1);
        if (errorRate > thresholds.errorRate) {
            alerts.push({
                type: 'HIGH_ERROR_RATE',
                severity: 'high',
                message: `Error rate is ${(errorRate * 100).toFixed(2)}%`,
                value: errorRate,
                threshold: thresholds.errorRate
            });
        }
        
        return alerts;
    }

    /**
     * Get room performance profile
     */
    getRoomProfile(gameId) {
        return this.profiles.roomOperations.get(gameId);
    }

    /**
     * Get user performance profile
     */
    getUserProfile(userId) {
        return this.profiles.userOperations.get(userId);
    }

    /**
     * Get all performance profiles
     */
    getAllProfiles() {
        return {
            system: this.profiles.systemProfile,
            rooms: Array.from(this.profiles.roomOperations.values()),
            users: Array.from(this.profiles.userOperations.values())
        };
    }

    /**
     * Reset performance metrics
     */
    resetMetrics() {
        this.metrics = {
            latencyMeasurements: [],
            broadcastMetrics: [],
            operationMetrics: new Map(),
            systemMetrics: [],
            errorMetrics: []
        };
        
        this.profiles = {
            roomOperations: new Map(),
            userOperations: new Map(),
            systemProfile: {
                startTime: Date.now(),
                totalOperations: 0,
                totalLatency: 0,
                errorCount: 0
            }
        };
        
        console.log('[PerformanceMonitor] Metrics reset');
    }

    /**
     * Export performance data
     */
    exportPerformanceData() {
        return {
            timestamp: Date.now(),
            config: this.config,
            metrics: {
                latencyMeasurements: this.metrics.latencyMeasurements.slice(-100),
                broadcastMetrics: this.metrics.broadcastMetrics.slice(-100),
                operationMetrics: Object.fromEntries(
                    Array.from(this.metrics.operationMetrics.entries()).map(
                        ([key, value]) => [key, value.slice(-50)]
                    )
                ),
                systemMetrics: this.metrics.systemMetrics.slice(-20),
                errorMetrics: this.metrics.errorMetrics.slice(-50)
            },
            profiles: this.getAllProfiles(),
            summary: this.getPerformanceSummary()
        };
    }
}

export default PerformanceMonitor;