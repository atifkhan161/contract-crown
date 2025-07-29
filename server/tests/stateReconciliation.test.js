/**
 * State Reconciliation Engine Tests
 * Tests for state comparison, conflict resolution, and atomic updates
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import StateReconciliationEngine from '../src/services/StateReconciliationEngine.js';
import Room from '../src/models/Room.js';
import dbConnection from '../database/connection.js';

// Mock dependencies
vi.mock('../src/models/Room.js');
vi.mock('../database/connection.js');

describe('StateReconciliationEngine', () => {
    let engine;
    let mockRoom;
    let mockDbConnection;

    beforeEach(() => {
        engine = new StateReconciliationEngine();
        
        // Mock Room model
        mockRoom = {
            room_id: 'test-room-123',
            owner_id: 'user-1',
            status: 'waiting',
            players: [
                {
                    id: 'user-1',
                    username: 'Player1',
                    isReady: true,
                    teamAssignment: 1,
                    joinedAt: '2024-01-01T00:00:00Z'
                },
                {
                    id: 'user-2',
                    username: 'Player2',
                    isReady: false,
                    teamAssignment: 2,
                    joinedAt: '2024-01-01T00:01:00Z'
                }
            ]
        };

        Room.findById = vi.fn().mockResolvedValue(mockRoom);

        // Mock database connection
        mockDbConnection = {
            transaction: vi.fn(),
            execute: vi.fn()
        };
        dbConnection.transaction = mockDbConnection.transaction;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('detectStateInconsistencies', () => {
        it('should detect no inconsistencies when states match', () => {
            const wsState = {
                hostId: 'user-1',
                players: new Map([
                    ['user-1', { userId: 'user-1', username: 'Player1', isReady: true, teamAssignment: 1, isConnected: true }],
                    ['user-2', { userId: 'user-2', username: 'Player2', isReady: false, teamAssignment: 2, isConnected: true }]
                ])
            };

            const dbState = mockRoom;
            const inconsistencies = engine.detectStateInconsistencies(wsState, dbState, 'test-room-123');

            expect(inconsistencies).toHaveLength(0);
        });

        it('should detect player missing inconsistency', () => {
            const wsState = {
                hostId: 'user-1',
                players: new Map([
                    ['user-1', { userId: 'user-1', username: 'Player1', isReady: true, teamAssignment: 1, isConnected: true }]
                    // user-2 is missing from websocket state
                ])
            };

            const dbState = mockRoom;
            const inconsistencies = engine.detectStateInconsistencies(wsState, dbState, 'test-room-123');

            expect(inconsistencies).toHaveLength(1);
            expect(inconsistencies[0]).toMatchObject({
                type: 'player_missing',
                gameId: 'test-room-123',
                playerId: 'user-2',
                websocketValue: null,
                severity: 'high'
            });
        });

        it('should detect ready status mismatch', () => {
            const wsState = {
                hostId: 'user-1',
                players: new Map([
                    ['user-1', { userId: 'user-1', username: 'Player1', isReady: false, teamAssignment: 1, isConnected: true }], // Different ready status
                    ['user-2', { userId: 'user-2', username: 'Player2', isReady: false, teamAssignment: 2, isConnected: true }]
                ])
            };

            const dbState = mockRoom;
            const inconsistencies = engine.detectStateInconsistencies(wsState, dbState, 'test-room-123');

            expect(inconsistencies).toHaveLength(1);
            expect(inconsistencies[0]).toMatchObject({
                type: 'ready_status_mismatch',
                gameId: 'test-room-123',
                playerId: 'user-1',
                websocketValue: false,
                databaseValue: true,
                severity: 'medium'
            });
        });

        it('should detect team assignment conflict', () => {
            const wsState = {
                hostId: 'user-1',
                players: new Map([
                    ['user-1', { userId: 'user-1', username: 'Player1', isReady: true, teamAssignment: 2, isConnected: true }], // Different team
                    ['user-2', { userId: 'user-2', username: 'Player2', isReady: false, teamAssignment: 2, isConnected: true }]
                ])
            };

            const dbState = mockRoom;
            const inconsistencies = engine.detectStateInconsistencies(wsState, dbState, 'test-room-123');

            expect(inconsistencies).toHaveLength(1);
            expect(inconsistencies[0]).toMatchObject({
                type: 'team_assignment_conflict',
                gameId: 'test-room-123',
                playerId: 'user-1',
                websocketValue: 2,
                databaseValue: 1,
                severity: 'medium'
            });
        });

        it('should detect host mismatch', () => {
            const wsState = {
                hostId: 'user-2', // Different host
                players: new Map([
                    ['user-1', { userId: 'user-1', username: 'Player1', isReady: true, teamAssignment: 1, isConnected: true }],
                    ['user-2', { userId: 'user-2', username: 'Player2', isReady: false, teamAssignment: 2, isConnected: true }]
                ])
            };

            const dbState = mockRoom;
            const inconsistencies = engine.detectStateInconsistencies(wsState, dbState, 'test-room-123');

            expect(inconsistencies).toHaveLength(1);
            expect(inconsistencies[0]).toMatchObject({
                type: 'host_mismatch',
                gameId: 'test-room-123',
                websocketValue: 'user-2',
                databaseValue: 'user-1',
                severity: 'critical'
            });
        });

        it('should detect connection status mismatch', () => {
            const wsState = {
                hostId: 'user-1',
                players: new Map([
                    ['user-1', { userId: 'user-1', username: 'Player1', isReady: true, teamAssignment: 1, isConnected: false }], // Different connection status
                    ['user-2', { userId: 'user-2', username: 'Player2', isReady: false, teamAssignment: 2, isConnected: true }]
                ])
            };

            const dbState = {
                ...mockRoom,
                players: mockRoom.players.map(p => ({ ...p, isConnected: true })) // All connected in DB
            };

            const inconsistencies = engine.detectStateInconsistencies(wsState, dbState, 'test-room-123');

            expect(inconsistencies).toHaveLength(1);
            expect(inconsistencies[0]).toMatchObject({
                type: 'connection_status_mismatch',
                gameId: 'test-room-123',
                playerId: 'user-1',
                websocketValue: false,
                databaseValue: true,
                severity: 'low'
            });
        });

        it('should detect multiple inconsistencies', () => {
            const wsState = {
                hostId: 'user-2', // Host mismatch
                players: new Map([
                    ['user-1', { userId: 'user-1', username: 'Player1', isReady: false, teamAssignment: 2, isConnected: true }] // Ready and team mismatch
                    // user-2 missing
                ])
            };

            const dbState = mockRoom;
            const inconsistencies = engine.detectStateInconsistencies(wsState, dbState, 'test-room-123');

            expect(inconsistencies).toHaveLength(4); // host_mismatch, ready_status_mismatch, team_assignment_conflict, player_missing
            
            const types = inconsistencies.map(i => i.type);
            expect(types).toContain('host_mismatch');
            expect(types).toContain('ready_status_mismatch');
            expect(types).toContain('team_assignment_conflict');
            expect(types).toContain('player_missing');
        });
    });

    describe('resolveConflicts', () => {
        it('should resolve conflicts in severity order', async () => {
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

            const dbState = mockRoom;
            const wsState = { hostId: 'user-2' };

            const resolvedState = await engine.resolveConflicts(inconsistencies, dbState, wsState);

            // Critical issues should be resolved first
            expect(resolvedState.hostId).toBe('user-1'); // Database value wins
            expect(resolvedState.owner_id).toBe('user-1');
        });

        it('should handle unknown inconsistency types gracefully', async () => {
            const inconsistencies = [
                {
                    type: 'unknown_inconsistency_type',
                    gameId: 'test-room-123',
                    severity: 'medium'
                }
            ];

            const dbState = mockRoom;
            const wsState = {};

            // Should not throw error
            const resolvedState = await engine.resolveConflicts(inconsistencies, dbState, wsState);
            expect(resolvedState).toEqual(dbState);
        });
    });

    describe('resolvePlayerMissing', () => {
        it('should add missing player to resolved state', async () => {
            const inconsistency = {
                type: 'player_missing',
                playerId: 'user-3',
                databaseValue: {
                    id: 'user-3',
                    username: 'Player3',
                    isReady: false,
                    teamAssignment: null,
                    joinedAt: '2024-01-01T00:02:00Z'
                }
            };

            const resolvedState = { playersMap: new Map() };
            const wsState = {};

            const result = await engine.resolvePlayerMissing(inconsistency, resolvedState, wsState);

            expect(result.playersMap.has('user-3')).toBe(true);
            expect(result.playersMap.get('user-3')).toMatchObject({
                userId: 'user-3',
                username: 'Player3',
                isReady: false,
                teamAssignment: null,
                isConnected: false
            });
        });
    });

    describe('resolveReadyStatusMismatch', () => {
        it('should use database value for ready status', async () => {
            const inconsistency = {
                type: 'ready_status_mismatch',
                playerId: 'user-1',
                websocketValue: false,
                databaseValue: true
            };

            const resolvedState = {
                players: [
                    { id: 'user-1', isReady: false }
                ]
            };
            const wsState = {};

            const result = await engine.resolveReadyStatusMismatch(inconsistency, resolvedState, wsState);

            expect(result.players[0].isReady).toBe(true); // Database value
        });
    });

    describe('resolveTeamAssignmentConflict', () => {
        it('should use database value for team assignment', async () => {
            const inconsistency = {
                type: 'team_assignment_conflict',
                playerId: 'user-1',
                websocketValue: 2,
                databaseValue: 1
            };

            const resolvedState = {
                players: [
                    { id: 'user-1', teamAssignment: 2 }
                ]
            };
            const wsState = {};

            const result = await engine.resolveTeamAssignmentConflict(inconsistency, resolvedState, wsState);

            expect(result.players[0].teamAssignment).toBe(1); // Database value
        });
    });

    describe('resolveHostMismatch', () => {
        it('should use database value for host', async () => {
            const inconsistency = {
                type: 'host_mismatch',
                websocketValue: 'user-2',
                databaseValue: 'user-1'
            };

            const resolvedState = { hostId: 'user-2' };
            const wsState = {};

            const result = await engine.resolveHostMismatch(inconsistency, resolvedState, wsState);

            expect(result.hostId).toBe('user-1'); // Database value
            expect(result.owner_id).toBe('user-1');
        });
    });

    describe('resolveConnectionStatusMismatch', () => {
        it('should use websocket value for connection status', async () => {
            const inconsistency = {
                type: 'connection_status_mismatch',
                playerId: 'user-1',
                websocketValue: false,
                databaseValue: true
            };

            const resolvedState = {
                players: [
                    { id: 'user-1', isConnected: true }
                ]
            };
            const wsState = {};

            const result = await engine.resolveConnectionStatusMismatch(inconsistency, resolvedState, wsState);

            expect(result.players[0].isConnected).toBe(false); // Websocket value
        });
    });

    describe('atomicStateUpdate', () => {
        it('should perform atomic update with transaction', async () => {
            const mockConnection = {
                execute: vi.fn().mockResolvedValue([])
            };

            mockDbConnection.transaction.mockImplementation(async (callback) => {
                return await callback(mockConnection);
            });

            Room.findById.mockResolvedValue(mockRoom);

            const stateUpdates = {
                players: {
                    'user-1': { isReady: true, teamAssignment: 1 },
                    'user-2': { isReady: false }
                },
                room: {
                    status: 'playing',
                    owner_id: 'user-1'
                }
            };

            const result = await engine.atomicStateUpdate('test-room-123', stateUpdates);

            // Verify transaction was used
            expect(mockDbConnection.transaction).toHaveBeenCalledOnce();
            
            // Verify room was locked
            expect(mockConnection.execute).toHaveBeenCalledWith(
                'SELECT room_id FROM rooms WHERE room_id = ? FOR UPDATE',
                ['test-room-123']
            );

            // Verify player updates
            expect(mockConnection.execute).toHaveBeenCalledWith(
                'UPDATE room_players SET is_ready = ?, team_assignment = ? WHERE room_id = ? AND user_id = ?',
                [true, 1, 'test-room-123', 'user-1']
            );

            expect(mockConnection.execute).toHaveBeenCalledWith(
                'UPDATE room_players SET is_ready = ? WHERE room_id = ? AND user_id = ?',
                [false, 'test-room-123', 'user-2']
            );

            // Verify room updates
            expect(mockConnection.execute).toHaveBeenCalledWith(
                'UPDATE rooms SET status = ?, owner_id = ?, updated_at = NOW() WHERE room_id = ?',
                ['playing', 'user-1', 'test-room-123']
            );

            expect(result).toEqual(mockRoom);
        });

        it('should handle transaction rollback on error', async () => {
            const error = new Error('Database error');
            mockDbConnection.transaction.mockRejectedValue(error);

            const stateUpdates = { players: { 'user-1': { isReady: true } } };

            await expect(engine.atomicStateUpdate('test-room-123', stateUpdates))
                .rejects.toThrow('Database error');
        });
    });

    describe('reconcileRoomState', () => {
        it('should prevent concurrent reconciliation', async () => {
            // Mock a long-running reconciliation
            Room.findById.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(mockRoom), 100)));

            const promise1 = engine.reconcileRoomState('test-room-123');
            const promise2 = engine.reconcileRoomState('test-room-123');

            const [result1, result2] = await Promise.all([promise1, promise2]);

            // Second call should return null (already in progress)
            expect(result1).toEqual(mockRoom);
            expect(result2).toBeNull();
        });

        it('should return null for non-existent room', async () => {
            Room.findById.mockResolvedValue(null);

            const result = await engine.reconcileRoomState('non-existent-room');

            expect(result).toBeNull();
        });

        it('should complete full reconciliation flow', async () => {
            const wsState = {
                hostId: 'user-2', // Mismatch
                players: new Map([
                    ['user-1', { userId: 'user-1', username: 'Player1', isReady: false, teamAssignment: 1, isConnected: true }] // Ready mismatch
                ])
            };

            const result = await engine.reconcileRoomState('test-room-123', wsState);

            // Check that the result contains the expected reconciled values
            expect(result.room_id).toBe('test-room-123');
            expect(result.owner_id).toBe('user-1'); // Database value should win
            expect(result.hostId).toBe('user-1'); // Should be set by reconciliation
            expect(result.status).toBe('waiting');
            expect(result.players).toHaveLength(2);
            
            // Verify reconciliation was recorded
            const stats = engine.getReconciliationStats();
            expect(stats.totalReconciliations).toBe(1);
        });
    });

    describe('getReconciliationStats', () => {
        it('should return correct statistics', () => {
            // Add some test reconciliation records
            engine.recordReconciliation('room-1', [
                { type: 'ready_status_mismatch' },
                { type: 'host_mismatch' }
            ], mockRoom);

            engine.recordReconciliation('room-2', [
                { type: 'ready_status_mismatch' }
            ], mockRoom);

            const stats = engine.getReconciliationStats();

            expect(stats.totalReconciliations).toBe(2);
            expect(stats.activeRooms).toBe(2);
            expect(stats.inProgressReconciliations).toBe(0);
            expect(stats.commonInconsistencyTypes).toEqual({
                'ready_status_mismatch': 2,
                'host_mismatch': 1
            });
            expect(stats.averageInconsistenciesPerReconciliation).toBe(1.5);
        });

        it('should handle empty history', () => {
            const stats = engine.getReconciliationStats();

            expect(stats.totalReconciliations).toBe(0);
            expect(stats.activeRooms).toBe(0);
            expect(stats.averageInconsistenciesPerReconciliation).toBe(0);
        });
    });

    describe('schedulePeriodicReconciliation', () => {
        it('should schedule periodic reconciliation', () => {
            vi.useFakeTimers();
            
            const reconcileSpy = vi.spyOn(engine, 'reconcileRoomState').mockResolvedValue(mockRoom);

            const intervalId = engine.schedulePeriodicReconciliation('test-room-123', 1000);

            // Fast-forward time
            vi.advanceTimersByTime(2500);

            expect(reconcileSpy).toHaveBeenCalledTimes(2);
            expect(reconcileSpy).toHaveBeenCalledWith('test-room-123');

            clearInterval(intervalId);
            vi.useRealTimers();
        });
    });
});