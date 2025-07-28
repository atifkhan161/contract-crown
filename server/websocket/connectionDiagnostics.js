/**
 * Connection Diagnostics Tool
 * Provides detailed monitoring and debugging for WebSocket connections
 */

class ConnectionDiagnostics {
    constructor(socketManager, connectionStatusManager) {
        this.socketManager = socketManager;
        this.connectionStatusManager = connectionStatusManager;
        this.diagnosticInterval = null;
        this.logLevel = 'info'; // 'debug', 'info', 'warn', 'error'
    }

    /**
     * Start connection diagnostics monitoring
     * @param {number} intervalMs - Monitoring interval in milliseconds
     */
    startMonitoring(intervalMs = 30000) {
        if (this.diagnosticInterval) {
            clearInterval(this.diagnosticInterval);
        }

        this.diagnosticInterval = setInterval(() => {
            this.performDiagnostics();
        }, intervalMs);

        console.log(`[ConnectionDiagnostics] Started monitoring every ${intervalMs}ms`);
    }

    /**
     * Stop connection diagnostics monitoring
     */
    stopMonitoring() {
        if (this.diagnosticInterval) {
            clearInterval(this.diagnosticInterval);
            this.diagnosticInterval = null;
            console.log('[ConnectionDiagnostics] Stopped monitoring');
        }
    }

    /**
     * Perform comprehensive connection diagnostics
     */
    performDiagnostics() {
        const now = Date.now();
        const stats = this.connectionStatusManager.getDetailedStats();

        // Check for connection issues
        const issues = this.detectConnectionIssues(stats);

        if (issues.length > 0) {
            console.warn('[ConnectionDiagnostics] Connection issues detected:');
            issues.forEach(issue => {
                console.warn(`  - ${issue.type}: ${issue.message}`);
            });
        }

        // Log connection health summary
        this.logConnectionHealth(stats);

        // Check individual connection health
        this.checkIndividualConnections();
    }

    /**
     * Detect potential connection issues
     * @param {Object} stats - Connection statistics
     * @returns {Array} Array of detected issues
     */
    detectConnectionIssues(stats) {
        const issues = [];
        const now = Date.now();

        // High timeout rate
        if (stats.timeouts > 0 && stats.recoveries / Math.max(stats.timeouts, 1) < 0.8) {
            issues.push({
                type: 'HIGH_TIMEOUT_RATE',
                message: `High timeout rate: ${stats.timeouts} timeouts, ${stats.recoveries} recoveries`
            });
        }

        // High error rate
        if (stats.errors > stats.activeConnections * 2) {
            issues.push({
                type: 'HIGH_ERROR_RATE',
                message: `High error rate: ${stats.errors} errors for ${stats.activeConnections} connections`
            });
        }

        // Frequent reconnections
        if (stats.reconnections > stats.activeConnections * 3) {
            issues.push({
                type: 'FREQUENT_RECONNECTIONS',
                message: `Frequent reconnections: ${stats.reconnections} reconnections for ${stats.activeConnections} connections`
            });
        }

        // Memory usage check
        if (stats.memoryUsage && stats.memoryUsage.heapUsed > 500 * 1024 * 1024) { // 500MB
            issues.push({
                type: 'HIGH_MEMORY_USAGE',
                message: `High memory usage: ${Math.round(stats.memoryUsage.heapUsed / 1024 / 1024)}MB`
            });
        }

        return issues;
    }

    /**
     * Log connection health summary
     * @param {Object} stats - Connection statistics
     */
    logConnectionHealth(stats) {
        if (this.logLevel === 'debug' || stats.activeConnections === 0) {
            console.log('[ConnectionDiagnostics] Connection Health Summary:');
            console.log(`  Active Connections: ${stats.activeConnections}`);
            console.log(`  Total Connections: ${stats.totalConnections}`);
            console.log(`  Reconnections: ${stats.reconnections}`);
            console.log(`  Disconnections: ${stats.disconnections}`);
            console.log(`  Timeouts: ${stats.timeouts}`);
            console.log(`  Recoveries: ${stats.recoveries}`);
            console.log(`  Errors: ${stats.errors}`);
            console.log(`  Active Rooms: ${stats.activeRooms}`);
            console.log(`  Server Uptime: ${Math.round(stats.serverUptime / 60)} minutes`);
        }
    }

    /**
     * Check health of individual connections
     */
    checkIndividualConnections() {
        const now = Date.now();

        for (const [socketId, healthData] of this.connectionStatusManager.connectionHealth.entries()) {
            const socket = this.socketManager.io.sockets.sockets.get(socketId);

            if (!socket) {
                continue;
            }

            const timeSinceLastPing = now - (healthData.lastPing || healthData.connectedAt);
            const avgLatency = healthData.latencyHistory && healthData.latencyHistory.length > 0
                ? healthData.latencyHistory.reduce((a, b) => a + b, 0) / healthData.latencyHistory.length
                : 0;

            // Log problematic connections
            if (timeSinceLastPing > 45000 || avgLatency > 2000 || (healthData.errorCount || 0) > 5) {
                console.warn(`[ConnectionDiagnostics] Problematic connection detected:`);
                console.warn(`  User: ${socket.username || 'Unknown'} (${socketId})`);
                console.warn(`  Time since last ping: ${Math.round(timeSinceLastPing / 1000)}s`);
                console.warn(`  Average latency: ${Math.round(avgLatency)}ms`);
                console.warn(`  Error count: ${healthData.errorCount || 0}`);
                console.warn(`  Connected: ${socket.connected}`);
            }
        }
    }

    /**
     * Generate detailed connection report
     * @returns {Object} Detailed connection report
     */
    generateReport() {
        const stats = this.connectionStatusManager.getDetailedStats();
        const issues = this.detectConnectionIssues(stats);
        const now = Date.now();

        const connectionDetails = [];
        for (const [socketId, healthData] of this.connectionStatusManager.connectionHealth.entries()) {
            const socket = this.socketManager.io.sockets.sockets.get(socketId);

            if (socket) {
                const timeSinceLastPing = now - (healthData.lastPing || healthData.connectedAt);
                const avgLatency = healthData.latencyHistory && healthData.latencyHistory.length > 0
                    ? healthData.latencyHistory.reduce((a, b) => a + b, 0) / healthData.latencyHistory.length
                    : 0;

                connectionDetails.push({
                    socketId,
                    username: socket.username || 'Unknown',
                    userId: socket.userId,
                    connected: socket.connected,
                    connectedAt: healthData.connectedAt,
                    lastPing: healthData.lastPing,
                    timeSinceLastPing,
                    avgLatency: Math.round(avgLatency),
                    errorCount: healthData.errorCount || 0,
                    reconnectAttempts: healthData.reconnectAttempts || 0
                });
            }
        }

        return {
            timestamp: new Date().toISOString(),
            serverUptime: Math.round(stats.serverUptime / 60),
            summary: stats,
            issues,
            connections: connectionDetails,
            recommendations: this.generateRecommendations(issues, stats)
        };
    }

    /**
     * Generate recommendations based on detected issues
     * @param {Array} issues - Detected issues
     * @param {Object} stats - Connection statistics
     * @returns {Array} Array of recommendations
     */
    generateRecommendations(issues, stats) {
        const recommendations = [];

        if (issues.some(i => i.type === 'HIGH_TIMEOUT_RATE')) {
            recommendations.push('Consider increasing connection timeout values or improving network stability');
        }

        if (issues.some(i => i.type === 'HIGH_ERROR_RATE')) {
            recommendations.push('Investigate error patterns and implement better error handling');
        }

        if (issues.some(i => i.type === 'FREQUENT_RECONNECTIONS')) {
            recommendations.push('Check for network issues or implement connection pooling');
        }

        if (issues.some(i => i.type === 'HIGH_MEMORY_USAGE')) {
            recommendations.push('Monitor memory leaks and consider garbage collection optimization');
        }

        if (stats.activeConnections === 0 && stats.totalConnections > 0) {
            recommendations.push('All connections are disconnected - check server health and network connectivity');
        }

        return recommendations;
    }

    /**
     * Set logging level
     * @param {string} level - Log level ('debug', 'info', 'warn', 'error')
     */
    setLogLevel(level) {
        this.logLevel = level;
        console.log(`[ConnectionDiagnostics] Log level set to: ${level}`);
    }

    /**
     * Force connection health check for all connections
     */
    forceHealthCheck() {
        console.log('[ConnectionDiagnostics] Forcing health check for all connections');
        this.connectionStatusManager.performHeartbeatCheck();
    }

    /**
     * Get connection statistics for a specific user
     * @param {string} userId - User ID
     * @returns {Object|null} User connection statistics
     */
    getUserConnectionStats(userId) {
        const socketId = this.socketManager.getUserSocket(userId);
        if (!socketId) {
            return null;
        }

        const socket = this.socketManager.io.sockets.sockets.get(socketId);
        const healthData = this.connectionStatusManager.getConnectionHealth(socketId);

        if (!socket || !healthData) {
            return null;
        }

        const now = Date.now();
        const timeSinceLastPing = now - (healthData.lastPing || healthData.connectedAt);
        const avgLatency = healthData.latencyHistory && healthData.latencyHistory.length > 0
            ? healthData.latencyHistory.reduce((a, b) => a + b, 0) / healthData.latencyHistory.length
            : 0;

        return {
            userId,
            username: socket.username,
            socketId,
            connected: socket.connected,
            connectedAt: new Date(healthData.connectedAt).toISOString(),
            lastPing: healthData.lastPing ? new Date(healthData.lastPing).toISOString() : null,
            timeSinceLastPing: Math.round(timeSinceLastPing / 1000),
            avgLatency: Math.round(avgLatency),
            errorCount: healthData.errorCount || 0,
            reconnectAttempts: healthData.reconnectAttempts || 0,
            isHealthy: timeSinceLastPing < 30000 && avgLatency < 1000 && (healthData.errorCount || 0) < 3
        };
    }

    /**
     * Cleanup diagnostics
     */
    cleanup() {
        this.stopMonitoring();
        console.log('[ConnectionDiagnostics] Cleaned up');
    }
}

export default ConnectionDiagnostics;