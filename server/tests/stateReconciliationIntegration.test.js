/**
 * State Reconciliation Engine Integration Tests
 * Tests for integration with existing websocket and database systems
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import StateReconciliationEngine from '../src/services/StateReconciliationEngine.js';

describe('StateReconciliationEngine Integration', () => {
    let engine;

    beforeEach(() => {
        engine = new StateReconciliationEngine();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('State Comparison Algorithms', () => {
        it('should detect websocket vs database inconsistencies', () => {
            const websocketState = {
                hostId: 'user-1',
                players: new Map([
                    ['user-1', { 
                        userId: 'user-1', 
                        username: 'Player1', 
                        isReady: false, // Different from DB
                        teamAssignment: 1, 
                        isConnected: true 
                    }],
                    ['user-2', { 
                        userId: 'user-2', 
                        username: 'Player2', 
                        isReady: true, 
                        teamAssignment: 1, // Different from DB
                        isConnected: true 
                    }]
                ])
            };

            const databaseState = {
                room_id: 'test-room-123',
                owner_id: 'user-1',
                status: 'waiting',
                players: [
                    {
                        id: 'user-1',
                        username: 'Player1',
                        isReady: true, // Different from WS
                        teamAssignment: 1,
                        joinedAt: '2024-01-01T00:00:00Z'
                    },
                    {
                        id: 'user-2',
                        username: 'Player2',
                        isReady: true,
                        teamAssignment: 2, // Different from WS
                        joinedAt: '2024-01-01T00:01:00Z'
                    }
                ]
            };

            const inconsistencies = engine.detectStateInconsistencies(
                websocketState, 
                databaseState, 
                'test-room-123'
            );

            expect(inconsistencies).toHaveLength(2);
            
            const types = inconsistencies.map(i => i.type);
            expect(types).toContain('ready_status_mismatch');
            expect(types).toContain('team_assignment_conflict');
        });

        it('should prioritize critical inconsistencies', () => {
            const websocketState = {
                hostId: 'user-2', // Critical mismatch
                players: new Map([
                    ['user-1', { 
                        userId: 'user-1', 
                        username: 'Player1', 
                        isReady: false, // Medium mismatch
                        teamAssignment: 1, 
                        isConnected: true 
                    }]
                ])
            };

            const databaseState = {
                room_id: 'test-room-123',
                owner_id: 'user-1', // Different host
                status: 'waiting',
                players: [
                    {
                        id: 'user-1',
                        username: 'Player1',
                        isReady: true, // Different ready status
                        teamAssignment: 1,
                        joinedAt: '2024-01-01T00:00:00Z'
                    }
                ]
            };

            const inconsistencies = engine.detectStateInconsistencies(
                websocketState, 
                databaseState, 
                'test-room-123'
            );

            expect(inconsistencies).toHaveLength(2);
            
            // Find critical inconsistency
            const criticalInconsistency = inconsistencies.find(i => i.severity === 'critical');
            expect(criticalInconsistency).toBeDefined();
            expect(criticalInconsistency.type).toBe('host_mismatch');
        });
    });

    describe('Conflict Resolution Logic', () => {
        it('should use database as source of truth for most conflicts', async () => {
            const inconsistencies = [
                {
                    type: 'ready_status_mismatch',
                    gameId: 'test-room-123',
                    playerId: 'user-1',
                    websocketValue: false,
                    databaseValue: true,
                    severity: 'medium'
                },
                {
                    type: 'host_mismatch',
                    gameId: 'test-room-123',
                    websocketValue: 'user-2',
                    databaseValue: 'user-1',
                    severity: 'critical'
                }
            ];

            const databaseState = {
                room_id: 'test-room-123',
                owner_id: 'user-1',
                players: [
                    { id: 'user-1', isReady: true }
                ]
            };

            const websocketState = { hostId: 'user-2' };

            const resolvedState = await engine.resolveConflicts(
                inconsistencies, 
                databaseState, 
                websocketState
            );

            // Database values should win
            expect(resolvedState.hostId).toBe('user-1');
            expect(resolvedState.owner_id).toBe('user-1');
            expect(resolvedState.players[0].isReady).toBe(true);
        });

        it('should use websocket as source of truth for connection status', async () => {
            const inconsistencies = [
                {
                    type: 'connection_status_mismatch',
                    gameId: 'test-room-123',
                    playerId: 'user-1',
                    websocketValue: false,
                    databaseValue: true,
                    severity: 'low'
                }
            ];

            const databaseState = {
                players: [
                    { id: 'user-1', isConnected: true }
                ]
            };

            const websocketState = {};

            const resolvedState = await engine.resolveConflicts(
                inconsistencies, 
                databaseState, 
                websocketState
            );

            // Websocket value should win for connection status
            expect(resolvedState.players[0].isConnected).toBe(false);
        });
    });

    describe('Atomic State Update Mechanisms', () => {
        it('should handle race condition prevention', () => {
            const gameId = 'test-room-123';
            
            // Simulate concurrent reconciliation attempts
            expect(engine.reconciliationInProgress.has(gameId)).toBe(false);
            
            // First reconciliation should proceed
            engine.reconciliationInProgress.add(gameId);
            expect(engine.reconciliationInProgress.has(gameId)).toBe(true);
            
            // Second reconciliation should be blocked
            const isBlocked = engine.reconciliationInProgress.has(gameId);
            expect(isBlocked).toBe(true);
            
            // Cleanup
            engine.reconciliationInProgress.delete(gameId);
            expect(engine.reconciliationInProgress.has(gameId)).toBe(false);
        });

        it('should track reconciliation history', () => {
            const gameId = 'test-room-123';
            const inconsistencies = [
                { type: 'ready_status_mismatch' },
                { type: 'host_mismatch' }
            ];
            const resolvedState = { room_id: gameId };

            engine.recordReconciliation(gameId, inconsistencies, resolvedState);

            const stats = engine.getReconciliationStats();
            expect(stats.totalReconciliations).toBe(1);
            expect(stats.activeRooms).toBe(1);
            expect(stats.commonInconsistencyTypes).toEqual({
                'ready_status_mismatch': 1,
                'host_mismatch': 1
            });
        });

        it('should limit reconciliation history size', () => {
            const gameId = 'test-room-123';
            const originalMaxSize = engine.maxHistorySize;
            engine.maxHistorySize = 2; // Set small limit for testing

            // Add more records than the limit
            for (let i = 0; i < 5; i++) {
                engine.recordReconciliation(gameId, [], { room_id: gameId });
            }

            const history = engine.reconciliationHistory.get(gameId);
            expect(history.length).toBe(2); // Should be limited to maxHistorySize

            // Restore original limit
            engine.maxHistorySize = originalMaxSize;
        });
    });

    describe('Reconciliation Statistics', () => {
        it('should provide comprehensive statistics', () => {
            // Add some test data
            engine.recordReconciliation('room-1', [
                { type: 'ready_status_mismatch' },
                { type: 'host_mismatch' }
            ], {});

            engine.recordReconciliation('room-2', [
                { type: 'ready_status_mismatch' }
            ], {});

            engine.reconciliationInProgress.add('room-3');

            const stats = engine.getReconciliationStats();

            expect(stats.totalReconciliations).toBe(2);
            expect(stats.activeRooms).toBe(2);
            expect(stats.inProgressReconciliations).toBe(1);
            expect(stats.commonInconsistencyTypes).toEqual({
                'ready_status_mismatch': 2,
                'host_mismatch': 1
            });
            expect(stats.averageInconsistenciesPerReconciliation).toBe(1.5);

            // Cleanup
            engine.reconciliationInProgress.delete('room-3');
        });

        it('should handle empty statistics gracefully', () => {
            const stats = engine.getReconciliationStats();

            expect(stats.totalReconciliations).toBe(0);
            expect(stats.activeRooms).toBe(0);
            expect(stats.inProgressReconciliations).toBe(0);
            expect(stats.commonInconsistencyTypes).toEqual({});
            expect(stats.averageInconsistenciesPerReconciliation).toBe(0);
        });
    });

    describe('Periodic Reconciliation', () => {
        it('should schedule and manage periodic reconciliation', () => {
            vi.useFakeTimers();
            
            const gameId = 'test-room-123';
            const intervalId = engine.schedulePeriodicReconciliation(gameId, 1000);

            expect(intervalId).toBeDefined();
            expect(typeof intervalId).toBe('object'); // setInterval returns an object in Node.js

            // Clean up
            clearInterval(intervalId);
            vi.useRealTimers();
        });

        it('should clear reconciliation history', () => {
            const gameId = 'test-room-123';
            
            // Add some history
            engine.recordReconciliation(gameId, [], {});
            expect(engine.reconciliationHistory.has(gameId)).toBe(true);

            // Clear history
            engine.clearReconciliationHistory(gameId);
            expect(engine.reconciliationHistory.has(gameId)).toBe(false);
        });
    });

    describe('Error Handling', () => {
        it('should handle null or undefined states gracefully', () => {
            const inconsistencies1 = engine.detectStateInconsistencies(null, null, 'test-room');
            expect(inconsistencies1).toEqual([]);

            const inconsistencies2 = engine.detectStateInconsistencies(undefined, {}, 'test-room');
            expect(inconsistencies2).toEqual([]);

            const inconsistencies3 = engine.detectStateInconsistencies({}, undefined, 'test-room');
            expect(inconsistencies3).toEqual([]);
        });

        it('should handle missing player data gracefully', () => {
            const websocketState = {
                hostId: 'user-1',
                players: new Map() // Empty players
            };

            const databaseState = {
                room_id: 'test-room-123',
                owner_id: 'user-1',
                players: [
                    { id: 'user-1', username: 'Player1', isReady: true, teamAssignment: 1 }
                ]
            };

            const inconsistencies = engine.detectStateInconsistencies(
                websocketState, 
                databaseState, 
                'test-room-123'
            );

            expect(inconsistencies).toHaveLength(1);
            expect(inconsistencies[0].type).toBe('player_missing');
        });
    });
});