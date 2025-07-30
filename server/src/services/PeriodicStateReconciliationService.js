/**
 * Periodic State Reconciliation Service
 * Handles scheduled state reconciliation between websocket and database,
 * state version tracking, background cleanup, and monitoring
 */

import StateReconciliationEngine from './StateReconciliationEngine.js';
import Room from '../models/Room.js';
import dbConnection from '../../database/connection.js';

class PeriodicStateReconciliationService {
    constructor(socketManager) {
        this.socketManager = socketManager;
        this.stateReconciliationEngine = new StateReconciliationEngine();
        
        // Configuration
        this.reconciliationInterval = 30000; // 30 seconds
        this.cleanupInterval = 300000; // 5 minutes
        this.monitoringInterval = 60000; // 1 minute
        this.staleConnectionThreshold = 600000; // 10 minutes
        
        // State tracking
        this.roomVersions = new Map(); // gameId -> version number
        this.activeRooms = new Set();
        this.reconciliationStats = {
            totalReconciliations: 0,
            successfulReconciliations: 0,
            failedReconciliations: 0,
            inconsistenciesFound: 0,
            staleConnectionsCleanedUp: 0,
            lastReconciliationTime: null,
            lastCleanupTime: null
        };
        
        // Monitoring and alerting
        this.alertThresholds = {
            maxFailureRate: 0.1, // 10% failure rate
            maxInconsistencyRate: 0.2, // 20% inconsistency rate
            maxStaleConnections: 10
        };
        
        // Interval references
        this.reconciliationTimer = null;
        this.cleanupTimer = null;
        this.monitoringTimer = null;
        
        // Initialize
        this.isRunning = false;
    }

    /**
     * Start the periodic reconciliation service
     */
    start() {
        if (this.isRunning) {
            console.log('[PeriodicReconciliation] Service already running');
            return;
        }

        console.log('[PeriodicReconciliation] Starting periodic state reconciliation service');
        
        this.isRunning = true;
        
        // Start periodic reconciliation
        this.reconciliationTimer = setInterval(() => {
            this.performPeriodicReconciliation();
        }, this.reconciliationInterval);
        
        // Start background cleanup
        this.cleanupTimer = setInterval(() => {
            this.performBackgroundCleanup();
        }, this.cleanupInterval);
        
        // Start monitoring
        this.monitoringTimer = setInterval(() => {
            this.performMonitoring();
        }, this.monitoringInterval);
        
        console.log(`[PeriodicReconciliation] Service started with intervals: reconciliation=${this.reconciliationInterval}ms, cleanup=${this.cleanupInterval}ms, monitoring=${this.monitoringInterval}ms`);
    }

    /**
     * Stop the periodic reconciliation service
     */
    stop() {
        if (!this.isRunning) {
            console.log('[PeriodicReconciliation] Service not running');
            return;
        }

        console.log('[PeriodicReconciliation] Stopping periodic state reconciliation service');
        
        this.isRunning = false;
        
        if (this.reconciliationTimer) {
            clearInterval(this.reconciliationTimer);
            this.reconciliationTimer = null;
        }
        
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        
        if (this.monitoringTimer) {
            clearInterval(this.monitoringTimer);
            this.monitoringTimer = null;
        }
        
        console.log('[PeriodicReconciliation] Service stopped');
    }

    /**
     * Perform periodic reconciliation for all active rooms
     */
    async performPeriodicReconciliation() {
        try {
            console.log('[PeriodicReconciliation] Starting periodic reconciliation cycle');
            
            // Get all active rooms from websocket manager
            const activeRooms = this.getActiveRooms();
            
            if (activeRooms.length === 0) {
                console.log('[PeriodicReconciliation] No active rooms to reconcile');
                return;
            }
            
            console.log(`[PeriodicReconciliation] Reconciling ${activeRooms.length} active rooms`);
            
            const reconciliationPromises = activeRooms.map(gameId => 
                this.reconcileRoomWithVersionControl(gameId)
            );
            
            const results = await Promise.allSettled(reconciliationPromises);
            
            // Process results
            let successful = 0;
            let failed = 0;
            let totalInconsistencies = 0;
            
            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    successful++;
                    if (result.value && result.value.inconsistenciesCount) {
                        totalInconsistencies += result.value.inconsistenciesCount;
                    }
                } else {
                    failed++;
                    console.error(`[PeriodicReconciliation] Failed to reconcile room ${activeRooms[index]}:`, result.reason);
                }
            });
            
            // Update statistics
            this.reconciliationStats.totalReconciliations += activeRooms.length;
            this.reconciliationStats.successfulReconciliations += successful;
            this.reconciliationStats.failedReconciliations += failed;
            this.reconciliationStats.inconsistenciesFound += totalInconsistencies;
            this.reconciliationStats.lastReconciliationTime = new Date().toISOString();
            
            console.log(`[PeriodicReconciliation] Reconciliation cycle completed: ${successful} successful, ${failed} failed, ${totalInconsistencies} inconsistencies found`);
            
        } catch (error) {
            console.error('[PeriodicReconciliation] Error during periodic reconciliation:', error);
            this.reconciliationStats.failedReconciliations++;
        }
    }

    /**
     * Reconcile a room with version control for optimistic concurrency
     */
    async reconcileRoomWithVersionControl(gameId) {
        try {
            // Get current version
            const currentVersion = this.roomVersions.get(gameId) || 0;
            
            // Get websocket state
            const websocketState = this.getWebsocketRoomState(gameId);
            if (!websocketState) {
                console.log(`[PeriodicReconciliation] No websocket state found for room ${gameId}`);
                return null;
            }
            
            // Add version to websocket state for comparison
            websocketState.version = currentVersion;
            
            // Perform reconciliation
            const reconciliationResult = await this.stateReconciliationEngine.reconcileRoomState(gameId, websocketState);
            
            if (reconciliationResult) {
                // Increment version after successful reconciliation
                const newVersion = currentVersion + 1;
                this.roomVersions.set(gameId, newVersion);
                
                // Update websocket state with new version if inconsistencies were found
                const inconsistencies = this.stateReconciliationEngine.detectStateInconsistencies(websocketState, reconciliationResult, gameId);
                
                if (inconsistencies.length > 0) {
                    console.log(`[PeriodicReconciliation] Updating websocket state for room ${gameId} with version ${newVersion}`);
                    await this.updateWebsocketStateFromReconciliation(gameId, reconciliationResult, newVersion);
                }
                
                return {
                    gameId,
                    version: newVersion,
                    inconsistenciesCount: inconsistencies.length,
                    reconciled: inconsistencies.length > 0
                };
            }
            
            return null;
            
        } catch (error) {
            console.error(`[PeriodicReconciliation] Error reconciling room ${gameId} with version control:`, error);
            throw error;
        }
    }

    /**
     * Update websocket state from reconciliation results
     */
    async updateWebsocketStateFromReconciliation(gameId, reconciledState, version) {
        try {
            const room = this.socketManager.gameRooms.get(gameId);
            if (!room) {
                console.log(`[PeriodicReconciliation] Room ${gameId} not found in websocket manager`);
                return;
            }
            
            // Update room data with reconciled state
            if (reconciledState.players) {
                for (const dbPlayer of reconciledState.players) {
                    const playerId = String(dbPlayer.id);
                    const wsPlayer = room.players.get(playerId);
                    
                    if (wsPlayer) {
                        // Update existing player with database values
                        wsPlayer.isReady = dbPlayer.isReady;
                        wsPlayer.teamAssignment = dbPlayer.teamAssignment;
                        wsPlayer.username = dbPlayer.username;
                        // Keep connection status from websocket as it's more accurate
                    } else if (dbPlayer.isConnected !== false) {
                        // Add missing player from database (but mark as disconnected)
                        room.players.set(playerId, {
                            userId: playerId,
                            username: dbPlayer.username,
                            socketId: null,
                            isReady: dbPlayer.isReady,
                            teamAssignment: dbPlayer.teamAssignment,
                            joinedAt: dbPlayer.joinedAt || new Date().toISOString(),
                            isConnected: false
                        });
                    }
                }
            }
            
            // Update host if needed
            if (reconciledState.owner_id && String(room.hostId) !== String(reconciledState.owner_id)) {
                room.hostId = String(reconciledState.owner_id);
            }
            
            // Update room status
            if (reconciledState.status) {
                room.status = reconciledState.status;
            }
            
            // Add version tracking
            room.version = version;
            room.lastReconciled = new Date().toISOString();
            
            // Broadcast state update to all players in the room
            const players = Array.from(room.players.values()).map(p => ({
                userId: p.userId,
                username: p.username,
                isReady: p.isReady,
                teamAssignment: p.teamAssignment,
                isConnected: p.isConnected
            }));
            
            this.socketManager.io.to(gameId).emit('state-reconciled', {
                gameId,
                version,
                players,
                hostId: room.hostId,
                status: room.status,
                timestamp: new Date().toISOString(),
                message: 'Room state has been synchronized with database'
            });
            
            console.log(`[PeriodicReconciliation] Updated websocket state for room ${gameId} to version ${version}`);
            
        } catch (error) {
            console.error(`[PeriodicReconciliation] Error updating websocket state for room ${gameId}:`, error);
            throw error;
        }
    }

    /**
     * Perform background cleanup of stale connection data
     */
    async performBackgroundCleanup() {
        try {
            console.log('[PeriodicReconciliation] Starting background cleanup');
            
            const now = Date.now();
            let cleanedUpConnections = 0;
            
            // Clean up stale websocket connections
            for (const [gameId, room] of this.socketManager.gameRooms.entries()) {
                const playersToRemove = [];
                
                for (const [playerId, player] of room.players.entries()) {
                    // Check if player is marked as connected but socket doesn't exist
                    if (player.isConnected && player.socketId) {
                        const socket = this.socketManager.io.sockets.sockets.get(player.socketId);
                        if (!socket) {
                            console.log(`[PeriodicReconciliation] Found stale connection for player ${player.username} in room ${gameId}`);
                            player.isConnected = false;
                            player.socketId = null;
                            player.disconnectedAt = new Date().toISOString();
                            cleanedUpConnections++;
                        }
                    }
                    
                    // Check for players disconnected for too long
                    if (!player.isConnected && player.disconnectedAt) {
                        const disconnectedTime = new Date(player.disconnectedAt).getTime();
                        if (now - disconnectedTime > this.staleConnectionThreshold) {
                            console.log(`[PeriodicReconciliation] Marking player ${player.username} for removal from room ${gameId} (disconnected too long)`);
                            playersToRemove.push(playerId);
                        }
                    }
                }
                
                // Remove stale players
                for (const playerId of playersToRemove) {
                    room.players.delete(playerId);
                    
                    // Remove from teams
                    room.teams.team1 = room.teams.team1.filter(id => id !== playerId);
                    room.teams.team2 = room.teams.team2.filter(id => id !== playerId);
                    
                    cleanedUpConnections++;
                    
                    // Update database to reflect removal
                    try {
                        await dbConnection.execute(
                            'DELETE FROM room_players WHERE room_id = ? AND user_id = ?',
                            [gameId, playerId]
                        );
                    } catch (dbError) {
                        console.error(`[PeriodicReconciliation] Failed to remove stale player ${playerId} from database:`, dbError);
                    }
                }
                
                // Clean up empty rooms
                if (room.players.size === 0) {
                    console.log(`[PeriodicReconciliation] Removing empty room ${gameId}`);
                    this.socketManager.gameRooms.delete(gameId);
                    this.roomVersions.delete(gameId);
                    this.activeRooms.delete(gameId);
                    
                    // Update database room status
                    try {
                        await dbConnection.execute(
                            'UPDATE rooms SET status = ?, updated_at = NOW() WHERE room_id = ?',
                            ['abandoned', gameId]
                        );
                    } catch (dbError) {
                        console.error(`[PeriodicReconciliation] Failed to update abandoned room ${gameId} in database:`, dbError);
                    }
                }
            }
            
            // Clean up orphaned database entries
            await this.cleanupOrphanedDatabaseEntries();
            
            this.reconciliationStats.staleConnectionsCleanedUp += cleanedUpConnections;
            this.reconciliationStats.lastCleanupTime = new Date().toISOString();
            
            console.log(`[PeriodicReconciliation] Background cleanup completed: ${cleanedUpConnections} stale connections cleaned up`);
            
        } catch (error) {
            console.error('[PeriodicReconciliation] Error during background cleanup:', error);
        }
    }

    /**
     * Clean up orphaned database entries
     */
    async cleanupOrphanedDatabaseEntries() {
        try {
            // Remove room_players entries for rooms that no longer exist in websocket manager
            const activeGameIds = Array.from(this.socketManager.gameRooms.keys());
            
            if (activeGameIds.length === 0) {
                return;
            }
            
            const placeholders = activeGameIds.map(() => '?').join(',');
            
            // Find rooms in database that are not active in websocket manager
            const [orphanedRooms] = await dbConnection.execute(`
                SELECT DISTINCT room_id FROM room_players 
                WHERE room_id NOT IN (${placeholders})
                AND created_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)
            `, activeGameIds);
            
            for (const row of orphanedRooms) {
                const roomId = row.room_id;
                console.log(`[PeriodicReconciliation] Cleaning up orphaned room ${roomId}`);
                
                // Remove room players
                await dbConnection.execute(
                    'DELETE FROM room_players WHERE room_id = ?',
                    [roomId]
                );
                
                // Update room status
                await dbConnection.execute(
                    'UPDATE rooms SET status = ?, updated_at = NOW() WHERE room_id = ?',
                    ['abandoned', roomId]
                );
            }
            
            if (orphanedRooms.length > 0) {
                console.log(`[PeriodicReconciliation] Cleaned up ${orphanedRooms.length} orphaned database entries`);
            }
            
        } catch (error) {
            console.error('[PeriodicReconciliation] Error cleaning up orphaned database entries:', error);
        }
    }

    /**
     * Perform monitoring and alerting
     */
    async performMonitoring() {
        try {
            const stats = this.getDetailedStats();
            
            // Check for alert conditions
            const alerts = this.checkAlertConditions(stats);
            
            if (alerts.length > 0) {
                console.warn('[PeriodicReconciliation] ALERTS TRIGGERED:', alerts);
                
                // Emit alerts to monitoring systems
                this.socketManager.io.emit('reconciliation-alerts', {
                    alerts,
                    stats,
                    timestamp: new Date().toISOString()
                });
            }
            
            // Log periodic stats
            if (stats.totalReconciliations > 0) {
                console.log(`[PeriodicReconciliation] Stats: ${stats.successRate.toFixed(2)}% success rate, ${stats.inconsistencyRate.toFixed(2)}% inconsistency rate, ${stats.activeRooms} active rooms`);
            }
            
        } catch (error) {
            console.error('[PeriodicReconciliation] Error during monitoring:', error);
        }
    }

    /**
     * Check for alert conditions
     */
    checkAlertConditions(stats) {
        const alerts = [];
        
        // Check failure rate
        if (stats.successRate < (1 - this.alertThresholds.maxFailureRate) * 100) {
            alerts.push({
                type: 'HIGH_FAILURE_RATE',
                message: `Reconciliation failure rate is ${(100 - stats.successRate).toFixed(2)}% (threshold: ${this.alertThresholds.maxFailureRate * 100}%)`,
                severity: 'high',
                value: 100 - stats.successRate,
                threshold: this.alertThresholds.maxFailureRate * 100
            });
        }
        
        // Check inconsistency rate
        if (stats.inconsistencyRate > this.alertThresholds.maxInconsistencyRate * 100) {
            alerts.push({
                type: 'HIGH_INCONSISTENCY_RATE',
                message: `State inconsistency rate is ${stats.inconsistencyRate.toFixed(2)}% (threshold: ${this.alertThresholds.maxInconsistencyRate * 100}%)`,
                severity: 'medium',
                value: stats.inconsistencyRate,
                threshold: this.alertThresholds.maxInconsistencyRate * 100
            });
        }
        
        // Check stale connections
        if (stats.staleConnectionsCleanedUp > this.alertThresholds.maxStaleConnections) {
            alerts.push({
                type: 'HIGH_STALE_CONNECTIONS',
                message: `High number of stale connections cleaned up: ${stats.staleConnectionsCleanedUp} (threshold: ${this.alertThresholds.maxStaleConnections})`,
                severity: 'medium',
                value: stats.staleConnectionsCleanedUp,
                threshold: this.alertThresholds.maxStaleConnections
            });
        }
        
        return alerts;
    }

    /**
     * Get active rooms from websocket manager
     */
    getActiveRooms() {
        const activeRooms = [];
        
        for (const [gameId, room] of this.socketManager.gameRooms.entries()) {
            // Only include rooms with connected players
            const hasConnectedPlayers = Array.from(room.players.values()).some(p => p.isConnected);
            if (hasConnectedPlayers) {
                activeRooms.push(gameId);
                this.activeRooms.add(gameId);
            } else {
                this.activeRooms.delete(gameId);
            }
        }
        
        return activeRooms;
    }

    /**
     * Get websocket room state
     */
    getWebsocketRoomState(gameId) {
        const room = this.socketManager.gameRooms.get(gameId);
        if (!room) {
            return null;
        }
        
        return {
            gameId,
            players: room.players,
            teams: room.teams,
            status: room.status,
            hostId: room.hostId,
            version: this.roomVersions.get(gameId) || 0
        };
    }

    /**
     * Get detailed statistics
     */
    getDetailedStats() {
        const total = this.reconciliationStats.totalReconciliations;
        const successful = this.reconciliationStats.successfulReconciliations;
        const failed = this.reconciliationStats.failedReconciliations;
        const inconsistencies = this.reconciliationStats.inconsistenciesFound;
        
        return {
            ...this.reconciliationStats,
            activeRooms: this.activeRooms.size,
            successRate: total > 0 ? (successful / total) * 100 : 100,
            failureRate: total > 0 ? (failed / total) * 100 : 0,
            inconsistencyRate: total > 0 ? (inconsistencies / total) * 100 : 0,
            averageInconsistenciesPerReconciliation: total > 0 ? inconsistencies / total : 0
        };
    }

    /**
     * Get service status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            intervals: {
                reconciliation: this.reconciliationInterval,
                cleanup: this.cleanupInterval,
                monitoring: this.monitoringInterval
            },
            thresholds: this.alertThresholds,
            stats: this.getDetailedStats(),
            activeRooms: Array.from(this.activeRooms),
            roomVersions: Object.fromEntries(this.roomVersions)
        };
    }

    /**
     * Update configuration
     */
    updateConfig(config) {
        if (config.reconciliationInterval) {
            this.reconciliationInterval = config.reconciliationInterval;
        }
        if (config.cleanupInterval) {
            this.cleanupInterval = config.cleanupInterval;
        }
        if (config.monitoringInterval) {
            this.monitoringInterval = config.monitoringInterval;
        }
        if (config.staleConnectionThreshold) {
            this.staleConnectionThreshold = config.staleConnectionThreshold;
        }
        if (config.alertThresholds) {
            this.alertThresholds = { ...this.alertThresholds, ...config.alertThresholds };
        }
        
        // Restart service with new configuration if running
        if (this.isRunning) {
            this.stop();
            this.start();
        }
        
        console.log('[PeriodicReconciliation] Configuration updated:', config);
    }

    /**
     * Force reconciliation for a specific room
     */
    async forceReconciliation(gameId) {
        try {
            console.log(`[PeriodicReconciliation] Forcing reconciliation for room ${gameId}`);
            const result = await this.reconcileRoomWithVersionControl(gameId);
            return result;
        } catch (error) {
            console.error(`[PeriodicReconciliation] Error forcing reconciliation for room ${gameId}:`, error);
            throw error;
        }
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.reconciliationStats = {
            totalReconciliations: 0,
            successfulReconciliations: 0,
            failedReconciliations: 0,
            inconsistenciesFound: 0,
            staleConnectionsCleanedUp: 0,
            lastReconciliationTime: null,
            lastCleanupTime: null
        };
        console.log('[PeriodicReconciliation] Statistics reset');
    }
}

export default PeriodicStateReconciliationService;