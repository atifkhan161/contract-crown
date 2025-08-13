/**
 * State Reconciliation Engine
 * Maintains consistency between websocket state and database state
 * with automatic conflict resolution using database as source of truth
 */

import Room from '../models/Room.js';
// Legacy MariaDB connection removed - now using LokiJS
// import dbConnection from '../../database/connection.js';

class StateReconciliationEngine {
    constructor() {
        this.reconciliationInProgress = new Set(); // Track ongoing reconciliations
        this.reconciliationHistory = new Map(); // Track reconciliation history
        this.maxHistorySize = 100;
        this.conflictResolutionStrategies = {
            'player_missing': this.resolvePlayerMissing.bind(this),
            'ready_status_mismatch': this.resolveReadyStatusMismatch.bind(this),
            'team_assignment_conflict': this.resolveTeamAssignmentConflict.bind(this),
            'host_mismatch': this.resolveHostMismatch.bind(this),
            'connection_status_mismatch': this.resolveConnectionStatusMismatch.bind(this)
        };
    }

    /**
     * Reconcile room state between websocket and database
     * @param {string} gameId - Game/Room ID
     * @param {Object} websocketState - Current websocket state
     * @returns {Promise<Object>} Reconciled state
     */
    async reconcileRoomState(gameId, websocketState = null) {
        // Prevent concurrent reconciliation for the same room
        if (this.reconciliationInProgress.has(gameId)) {
            console.log(`[StateReconciliation] Reconciliation already in progress for room ${gameId}`);
            return null;
        }

        this.reconciliationInProgress.add(gameId);

        try {
            console.log(`[StateReconciliation] Starting reconciliation for room ${gameId}`);

            // Fetch authoritative database state
            const dbState = await this.fetchDatabaseState(gameId);
            if (!dbState) {
                console.log(`[StateReconciliation] Room ${gameId} not found in database`);
                return null;
            }

            // Get current websocket state if not provided
            if (!websocketState) {
                websocketState = await this.fetchWebsocketState(gameId);
            }

            // Detect inconsistencies
            const inconsistencies = this.detectStateInconsistencies(websocketState, dbState, gameId);

            if (inconsistencies.length === 0) {
                console.log(`[StateReconciliation] No inconsistencies found for room ${gameId}`);
                return dbState;
            }

            console.log(`[StateReconciliation] Found ${inconsistencies.length} inconsistencies for room ${gameId}:`, 
                inconsistencies.map(i => i.type));

            // Resolve conflicts using database as source of truth
            const resolvedState = await this.resolveConflicts(inconsistencies, dbState, websocketState);

            // Record reconciliation
            this.recordReconciliation(gameId, inconsistencies, resolvedState);

            console.log(`[StateReconciliation] Completed reconciliation for room ${gameId}`);
            return resolvedState;

        } catch (error) {
            console.error(`[StateReconciliation] Error reconciling room ${gameId}:`, error);
            throw error;
        } finally {
            this.reconciliationInProgress.delete(gameId);
        }
    }

    /**
     * Detect state inconsistencies between websocket and database
     * @param {Object} wsState - Websocket state
     * @param {Object} dbState - Database state
     * @param {string} gameId - Game ID
     * @returns {Array} Array of inconsistencies
     */
    detectStateInconsistencies(wsState, dbState, gameId) {
        const inconsistencies = [];

        if (!wsState || !dbState) {
            return inconsistencies;
        }

        // Check for player inconsistencies
        const wsPlayers = new Map(wsState.players || []);
        const dbPlayers = new Map(dbState.players.map(p => [p.id, p]));

        // Check for missing players in websocket state
        for (const [playerId, dbPlayer] of dbPlayers) {
            if (!wsPlayers.has(playerId)) {
                inconsistencies.push({
                    type: 'player_missing',
                    gameId,
                    playerId,
                    websocketValue: null,
                    databaseValue: dbPlayer,
                    severity: 'high',
                    timestamp: new Date().toISOString()
                });
            }
        }

        // Check for ready status mismatches
        for (const [playerId, wsPlayer] of wsPlayers) {
            const dbPlayer = dbPlayers.get(playerId);
            if (dbPlayer && wsPlayer.isReady !== dbPlayer.isReady) {
                inconsistencies.push({
                    type: 'ready_status_mismatch',
                    gameId,
                    playerId,
                    websocketValue: wsPlayer.isReady,
                    databaseValue: dbPlayer.isReady,
                    severity: 'medium',
                    timestamp: new Date().toISOString()
                });
            }
        }

        // Check for team assignment conflicts
        for (const [playerId, wsPlayer] of wsPlayers) {
            const dbPlayer = dbPlayers.get(playerId);
            if (dbPlayer && wsPlayer.teamAssignment !== dbPlayer.teamAssignment) {
                inconsistencies.push({
                    type: 'team_assignment_conflict',
                    gameId,
                    playerId,
                    websocketValue: wsPlayer.teamAssignment,
                    databaseValue: dbPlayer.teamAssignment,
                    severity: 'medium',
                    timestamp: new Date().toISOString()
                });
            }
        }

        // Check for host mismatch
        if (wsState.hostId && dbState.owner_id && 
            String(wsState.hostId) !== String(dbState.owner_id)) {
            inconsistencies.push({
                type: 'host_mismatch',
                gameId,
                websocketValue: wsState.hostId,
                databaseValue: dbState.owner_id,
                severity: 'critical',
                timestamp: new Date().toISOString()
            });
        }

        // Check for connection status mismatches (websocket should be authoritative for this)
        for (const [playerId, wsPlayer] of wsPlayers) {
            const dbPlayer = dbPlayers.get(playerId);
            if (dbPlayer && typeof wsPlayer.isConnected === 'boolean' && 
                wsPlayer.isConnected !== (dbPlayer.isConnected !== false)) {
                inconsistencies.push({
                    type: 'connection_status_mismatch',
                    gameId,
                    playerId,
                    websocketValue: wsPlayer.isConnected,
                    databaseValue: dbPlayer.isConnected,
                    severity: 'low',
                    timestamp: new Date().toISOString()
                });
            }
        }

        return inconsistencies;
    }

    /**
     * Resolve conflicts using appropriate strategies
     * @param {Array} inconsistencies - Array of inconsistencies
     * @param {Object} dbState - Database state
     * @param {Object} wsState - Websocket state
     * @returns {Promise<Object>} Resolved state
     */
    async resolveConflicts(inconsistencies, dbState, wsState) {
        let resolvedState = { ...dbState };

        // Sort inconsistencies by severity (critical first)
        const sortedInconsistencies = inconsistencies.sort((a, b) => {
            const severityOrder = { 'critical': 0, 'high': 1, 'medium': 2, 'low': 3 };
            return severityOrder[a.severity] - severityOrder[b.severity];
        });

        for (const inconsistency of sortedInconsistencies) {
            const strategy = this.conflictResolutionStrategies[inconsistency.type];
            if (strategy) {
                try {
                    resolvedState = await strategy(inconsistency, resolvedState, wsState);
                } catch (error) {
                    console.error(`[StateReconciliation] Error resolving ${inconsistency.type}:`, error);
                }
            } else {
                console.warn(`[StateReconciliation] No strategy found for inconsistency type: ${inconsistency.type}`);
            }
        }

        return resolvedState;
    }

    /**
     * Resolve player missing inconsistency
     */
    async resolvePlayerMissing(inconsistency, resolvedState, wsState) {
        const { playerId, databaseValue } = inconsistency;
        
        // Database is authoritative - player should exist in websocket state
        console.log(`[StateReconciliation] Resolving player missing: ${playerId}`);
        
        // Add player to resolved state with database values
        if (!resolvedState.playersMap) {
            resolvedState.playersMap = new Map();
        }
        
        resolvedState.playersMap.set(playerId, {
            userId: databaseValue.id,
            username: databaseValue.username,
            isReady: databaseValue.isReady,
            teamAssignment: databaseValue.teamAssignment,
            isConnected: false, // Default to disconnected until websocket confirms
            joinedAt: databaseValue.joinedAt
        });

        return resolvedState;
    }

    /**
     * Resolve ready status mismatch
     */
    async resolveReadyStatusMismatch(inconsistency, resolvedState, wsState) {
        const { playerId, databaseValue } = inconsistency;
        
        // Database is authoritative for ready status
        console.log(`[StateReconciliation] Resolving ready status mismatch for ${playerId}: using database value ${databaseValue}`);
        
        // Update player ready status in resolved state
        const player = resolvedState.players.find(p => p.id === playerId);
        if (player) {
            player.isReady = databaseValue;
        }

        return resolvedState;
    }

    /**
     * Resolve team assignment conflict
     */
    async resolveTeamAssignmentConflict(inconsistency, resolvedState, wsState) {
        const { playerId, databaseValue } = inconsistency;
        
        // Database is authoritative for team assignments
        console.log(`[StateReconciliation] Resolving team assignment conflict for ${playerId}: using database value ${databaseValue}`);
        
        // Update player team assignment in resolved state
        const player = resolvedState.players.find(p => p.id === playerId);
        if (player) {
            player.teamAssignment = databaseValue;
        }

        return resolvedState;
    }

    /**
     * Resolve host mismatch
     */
    async resolveHostMismatch(inconsistency, resolvedState, wsState) {
        const { databaseValue } = inconsistency;
        
        // Database is authoritative for host
        console.log(`[StateReconciliation] Resolving host mismatch: using database value ${databaseValue}`);
        
        resolvedState.hostId = databaseValue;
        resolvedState.owner_id = databaseValue;

        return resolvedState;
    }

    /**
     * Resolve connection status mismatch
     */
    async resolveConnectionStatusMismatch(inconsistency, resolvedState, wsState) {
        const { playerId, websocketValue } = inconsistency;
        
        // Websocket is authoritative for connection status
        console.log(`[StateReconciliation] Resolving connection status mismatch for ${playerId}: using websocket value ${websocketValue}`);
        
        // Update player connection status in resolved state
        const player = resolvedState.players.find(p => p.id === playerId);
        if (player) {
            player.isConnected = websocketValue;
        }

        return resolvedState;
    }

    /**
     * Perform atomic state update to prevent race conditions
     * @param {string} gameId - Game ID
     * @param {Object} stateUpdates - State updates to apply
     * @returns {Promise<Object>} Updated state
     */
    async atomicStateUpdate(gameId, stateUpdates) {
        return await dbConnection.transaction(async (connection) => {
            try {
                console.log(`[StateReconciliation] Starting atomic update for room ${gameId}`);

                // Lock the room record for update
                await connection.execute(
                    'SELECT room_id FROM rooms WHERE room_id = ? FOR UPDATE',
                    [gameId]
                );

                // Apply player updates if provided
                if (stateUpdates.players) {
                    for (const [playerId, playerUpdates] of Object.entries(stateUpdates.players)) {
                        const updateFields = [];
                        const updateValues = [];

                        if (typeof playerUpdates.isReady === 'boolean') {
                            updateFields.push('is_ready = ?');
                            updateValues.push(playerUpdates.isReady);
                        }

                        if (playerUpdates.teamAssignment !== undefined) {
                            updateFields.push('team_assignment = ?');
                            updateValues.push(playerUpdates.teamAssignment);
                        }

                        if (updateFields.length > 0) {
                            updateValues.push(gameId, playerId);
                            await connection.execute(
                                `UPDATE room_players SET ${updateFields.join(', ')} WHERE room_id = ? AND user_id = ?`,
                                updateValues
                            );
                        }
                    }
                }

                // Apply room updates if provided
                if (stateUpdates.room) {
                    const roomUpdateFields = [];
                    const roomUpdateValues = [];

                    if (stateUpdates.room.status) {
                        roomUpdateFields.push('status = ?');
                        roomUpdateValues.push(stateUpdates.room.status);
                    }

                    if (stateUpdates.room.owner_id) {
                        roomUpdateFields.push('owner_id = ?');
                        roomUpdateValues.push(stateUpdates.room.owner_id);
                    }

                    if (roomUpdateFields.length > 0) {
                        roomUpdateFields.push('updated_at = NOW()');
                        roomUpdateValues.push(gameId);
                        await connection.execute(
                            `UPDATE rooms SET ${roomUpdateFields.join(', ')} WHERE room_id = ?`,
                            roomUpdateValues
                        );
                    }
                }

                // Fetch updated state
                const updatedRoom = await Room.findById(gameId);
                
                console.log(`[StateReconciliation] Completed atomic update for room ${gameId}`);
                return updatedRoom;

            } catch (error) {
                console.error(`[StateReconciliation] Atomic update failed for room ${gameId}:`, error);
                throw error;
            }
        });
    }

    /**
     * Fetch current database state for a room
     * @param {string} gameId - Game ID
     * @returns {Promise<Object>} Database state
     */
    async fetchDatabaseState(gameId) {
        try {
            const room = await Room.findById(gameId);
            return room;
        } catch (error) {
            console.error(`[StateReconciliation] Error fetching database state for ${gameId}:`, error);
            return null;
        }
    }

    /**
     * Fetch current websocket state for a room
     * @param {string} gameId - Game ID
     * @returns {Promise<Object>} Websocket state
     */
    async fetchWebsocketState(gameId) {
        // This would typically interface with the websocket manager
        // For now, return null to indicate websocket state should be provided
        return null;
    }

    /**
     * Record reconciliation for history tracking
     * @param {string} gameId - Game ID
     * @param {Array} inconsistencies - Resolved inconsistencies
     * @param {Object} resolvedState - Final resolved state
     */
    recordReconciliation(gameId, inconsistencies, resolvedState) {
        const record = {
            gameId,
            timestamp: new Date().toISOString(),
            inconsistenciesCount: inconsistencies.length,
            inconsistencyTypes: inconsistencies.map(i => i.type),
            resolvedState: {
                playerCount: resolvedState.players ? resolvedState.players.length : 0,
                hostId: resolvedState.owner_id,
                status: resolvedState.status
            }
        };

        // Store in history (with size limit)
        const history = this.reconciliationHistory.get(gameId) || [];
        history.push(record);
        
        if (history.length > this.maxHistorySize) {
            history.shift(); // Remove oldest record
        }
        
        this.reconciliationHistory.set(gameId, history);
    }

    /**
     * Get reconciliation statistics
     * @returns {Object} Statistics
     */
    getReconciliationStats() {
        const allRecords = Array.from(this.reconciliationHistory.values()).flat();
        
        return {
            totalReconciliations: allRecords.length,
            activeRooms: this.reconciliationHistory.size,
            inProgressReconciliations: this.reconciliationInProgress.size,
            commonInconsistencyTypes: this.getCommonInconsistencyTypes(allRecords),
            averageInconsistenciesPerReconciliation: allRecords.length > 0 
                ? allRecords.reduce((sum, r) => sum + r.inconsistenciesCount, 0) / allRecords.length 
                : 0
        };
    }

    /**
     * Get common inconsistency types from history
     * @param {Array} records - Reconciliation records
     * @returns {Object} Inconsistency type counts
     */
    getCommonInconsistencyTypes(records) {
        const typeCounts = {};
        
        for (const record of records) {
            for (const type of record.inconsistencyTypes) {
                typeCounts[type] = (typeCounts[type] || 0) + 1;
            }
        }
        
        return typeCounts;
    }

    /**
     * Clear reconciliation history for a specific room
     * @param {string} gameId - Game ID
     */
    clearReconciliationHistory(gameId) {
        this.reconciliationHistory.delete(gameId);
    }

    /**
     * Schedule periodic reconciliation for a room
     * @param {string} gameId - Game ID
     * @param {number} intervalMs - Interval in milliseconds
     * @returns {NodeJS.Timeout} Interval ID
     */
    schedulePeriodicReconciliation(gameId, intervalMs = 30000) {
        console.log(`[StateReconciliation] Scheduling periodic reconciliation for room ${gameId} every ${intervalMs}ms`);
        
        return setInterval(async () => {
            try {
                await this.reconcileRoomState(gameId);
            } catch (error) {
                console.error(`[StateReconciliation] Periodic reconciliation failed for room ${gameId}:`, error);
            }
        }, intervalMs);
    }
}

export default StateReconciliationEngine;
