/**
 * Tests for Periodic State Reconciliation Service
 */

import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import PeriodicStateReconciliationService from '../src/services/PeriodicStateReconciliationService.js';

// Mock dependencies
const mockSocketManager = {
    gameRooms: new Map(),
    io: {
        to: vi.fn().mockReturnThis(),
        emit: vi.fn()
    }
};

const mockStateReconciliationEngine = {
    reconcileRoomState: vi.fn(),
    detectStateInconsistencies: vi.fn()
};

describe('PeriodicStateReconciliationService', () => {
    let service;

    beforeEach(() => {
        service = new PeriodicStateReconciliationService(mockSocketManager);
        service.stateReconciliationEngine = mockStateReconciliationEngine;
        
        // Clear mocks
        vi.clearAllMocks();
        
        // Reset service state
        service.roomVersions.clear();
        service.activeRooms.clear();
        service.resetStats();
    });

    afterEach(() => {
        if (service.isRunning) {
            service.stop();
        }
    });

    describe('Service Lifecycle', () => {
        test('should start and stop service correctly', () => {
            expect(service.isRunning).toBe(false);
            
            service.start();
            expect(service.isRunning).toBe(true);
            expect(service.reconciliationTimer).toBeDefined();
            expect(service.cleanupTimer).toBeDefined();
            expect(service.monitoringTimer).toBeDefined();
            
            service.stop();
            expect(service.isRunning).toBe(false);
            expect(service.reconciliationTimer).toBeNull();
            expect(service.cleanupTimer).toBeNull();
            expect(service.monitoringTimer).toBeNull();
        });

        test('should not start if already running', () => {
            service.start();
            const firstTimer = service.reconciliationTimer;
            
            service.start(); // Try to start again
            expect(service.reconciliationTimer).toBe(firstTimer);
            
            service.stop();
        });

        test('should not stop if not running', () => {
            expect(service.isRunning).toBe(false);
            service.stop(); // Should not throw
            expect(service.isRunning).toBe(false);
        });
    });

    describe('State Version Tracking', () => {
        test('should track room versions correctly', async () => {
            const gameId = 'test-room-1';
            
            // Mock websocket state
            mockSocketManager.gameRooms.set(gameId, {
                players: new Map([['user1', { isReady: true }]]),
                teams: { team1: [], team2: [] },
                status: 'waiting',
                hostId: 'user1'
            });

            // Mock reconciliation result
            const mockReconciledState = {
                players: [{ id: 'user1', isReady: true }],
                owner_id: 'user1',
                status: 'waiting'
            };
            
            mockStateReconciliationEngine.reconcileRoomState.mockResolvedValue(mockReconciledState);
            mockStateReconciliationEngine.detectStateInconsistencies.mockReturnValue([]);

            // Initial version should be 0
            expect(service.roomVersions.get(gameId)).toBeUndefined();

            // Perform reconciliation
            const result = await service.reconcileRoomWithVersionControl(gameId);

            // Version should be incremented
            expect(service.roomVersions.get(gameId)).toBe(1);
            expect(result.version).toBe(1);
        });

        test('should handle version conflicts', async () => {
            const gameId = 'test-room-1';
            
            // Set initial version
            service.roomVersions.set(gameId, 5);
            
            // Mock websocket state
            mockSocketManager.gameRooms.set(gameId, {
                players: new Map(),
                teams: { team1: [], team2: [] },
                status: 'waiting',
                hostId: 'user1',
                version: 5
            });

            // Mock reconciliation to throw version conflict
            mockStateReconciliationEngine.reconcileRoomState.mockRejectedValue(
                new Error('Optimistic concurrency conflict')
            );

            await expect(service.reconcileRoomWithVersionControl(gameId))
                .rejects.toThrow('Optimistic concurrency conflict');
        });
    });

    describe('Active Room Management', () => {
        test('should identify active rooms correctly', () => {
            // Add rooms with different connection states
            mockSocketManager.gameRooms.set('room1', {
                players: new Map([
                    ['user1', { isConnected: true }],
                    ['user2', { isConnected: false }]
                ])
            });
            
            mockSocketManager.gameRooms.set('room2', {
                players: new Map([
                    ['user3', { isConnected: false }],
                    ['user4', { isConnected: false }]
                ])
            });
            
            mockSocketManager.gameRooms.set('room3', {
                players: new Map([
                    ['user5', { isConnected: true }]
                ])
            });

            const activeRooms = service.getActiveRooms();
            
            expect(activeRooms).toContain('room1');
            expect(activeRooms).not.toContain('room2');
            expect(activeRooms).toContain('room3');
            expect(activeRooms.length).toBe(2);
        });

        test('should update active rooms set', () => {
            mockSocketManager.gameRooms.set('room1', {
                players: new Map([['user1', { isConnected: true }]])
            });

            service.getActiveRooms();
            expect(service.activeRooms.has('room1')).toBe(true);

            // Remove connected players
            mockSocketManager.gameRooms.set('room1', {
                players: new Map([['user1', { isConnected: false }]])
            });

            service.getActiveRooms();
            expect(service.activeRooms.has('room1')).toBe(false);
        });
    });

    describe('Statistics and Monitoring', () => {
        test('should track reconciliation statistics', () => {
            const stats = service.getDetailedStats();
            
            expect(stats.totalReconciliations).toBe(0);
            expect(stats.successfulReconciliations).toBe(0);
            expect(stats.failedReconciliations).toBe(0);
            expect(stats.inconsistenciesFound).toBe(0);
            expect(stats.successRate).toBe(100);
            expect(stats.failureRate).toBe(0);
        });

        test('should calculate rates correctly', () => {
            // Simulate some reconciliations
            service.reconciliationStats.totalReconciliations = 10;
            service.reconciliationStats.successfulReconciliations = 8;
            service.reconciliationStats.failedReconciliations = 2;
            service.reconciliationStats.inconsistenciesFound = 5;

            const stats = service.getDetailedStats();
            
            expect(stats.successRate).toBe(80);
            expect(stats.failureRate).toBe(20);
            expect(stats.inconsistencyRate).toBe(50);
            expect(stats.averageInconsistenciesPerReconciliation).toBe(0.5);
        });

        test('should reset statistics', () => {
            // Set some stats
            service.reconciliationStats.totalReconciliations = 10;
            service.reconciliationStats.successfulReconciliations = 8;
            
            service.resetStats();
            
            const stats = service.getDetailedStats();
            expect(stats.totalReconciliations).toBe(0);
            expect(stats.successfulReconciliations).toBe(0);
        });
    });

    describe('Alert System', () => {
        test('should detect high failure rate alerts', () => {
            // Set failure rate above threshold (10%)
            service.reconciliationStats.totalReconciliations = 10;
            service.reconciliationStats.successfulReconciliations = 8;
            service.reconciliationStats.failedReconciliations = 2;

            const stats = service.getDetailedStats();
            const alerts = service.checkAlertConditions(stats);

            const failureAlert = alerts.find(a => a.type === 'HIGH_FAILURE_RATE');
            expect(failureAlert).toBeDefined();
            expect(failureAlert.severity).toBe('high');
        });

        test('should detect high inconsistency rate alerts', () => {
            // Set inconsistency rate above threshold (20%)
            service.reconciliationStats.totalReconciliations = 10;
            service.reconciliationStats.successfulReconciliations = 10;
            service.reconciliationStats.inconsistenciesFound = 3; // 30% rate

            const stats = service.getDetailedStats();
            const alerts = service.checkAlertConditions(stats);

            const inconsistencyAlert = alerts.find(a => a.type === 'HIGH_INCONSISTENCY_RATE');
            expect(inconsistencyAlert).toBeDefined();
            expect(inconsistencyAlert.severity).toBe('medium');
        });

        test('should detect high stale connections alerts', () => {
            service.reconciliationStats.staleConnectionsCleanedUp = 15; // Above threshold of 10

            const stats = service.getDetailedStats();
            const alerts = service.checkAlertConditions(stats);

            const staleAlert = alerts.find(a => a.type === 'HIGH_STALE_CONNECTIONS');
            expect(staleAlert).toBeDefined();
            expect(staleAlert.severity).toBe('medium');
        });

        test('should not trigger alerts when within thresholds', () => {
            // Set stats within acceptable ranges
            service.reconciliationStats.totalReconciliations = 10;
            service.reconciliationStats.successfulReconciliations = 10;
            service.reconciliationStats.failedReconciliations = 0;
            service.reconciliationStats.inconsistenciesFound = 1; // 10% rate
            service.reconciliationStats.staleConnectionsCleanedUp = 5;

            const stats = service.getDetailedStats();
            const alerts = service.checkAlertConditions(stats);

            expect(alerts.length).toBe(0);
        });
    });

    describe('Configuration Management', () => {
        test('should update configuration', () => {
            const newConfig = {
                reconciliationInterval: 60000,
                cleanupInterval: 600000,
                alertThresholds: {
                    maxFailureRate: 0.05
                }
            };

            service.updateConfig(newConfig);

            expect(service.reconciliationInterval).toBe(60000);
            expect(service.cleanupInterval).toBe(600000);
            expect(service.alertThresholds.maxFailureRate).toBe(0.05);
        });

        test('should restart service when updating config while running', () => {
            service.start();
            const stopSpy = vi.spyOn(service, 'stop');
            const startSpy = vi.spyOn(service, 'start');

            service.updateConfig({ reconciliationInterval: 60000 });

            expect(stopSpy).toHaveBeenCalled();
            expect(startSpy).toHaveBeenCalled();
        });
    });

    describe('Service Status', () => {
        test('should return comprehensive status', () => {
            service.roomVersions.set('room1', 5);
            service.activeRooms.add('room1');

            const status = service.getStatus();

            expect(status.isRunning).toBe(false);
            expect(status.intervals.reconciliation).toBe(service.reconciliationInterval);
            expect(status.activeRooms).toContain('room1');
            expect(status.roomVersions.room1).toBe(5);
            expect(status.stats).toBeDefined();
            expect(status.thresholds).toBeDefined();
        });
    });

    describe('Error Handling', () => {
        test('should handle reconciliation errors gracefully', async () => {
            const gameId = 'test-room-1';
            
            mockSocketManager.gameRooms.set(gameId, {
                players: new Map(),
                teams: { team1: [], team2: [] },
                status: 'waiting',
                hostId: 'user1'
            });

            mockStateReconciliationEngine.reconcileRoomState.mockRejectedValue(
                new Error('Database connection failed')
            );

            await expect(service.reconcileRoomWithVersionControl(gameId))
                .rejects.toThrow('Database connection failed');
        });

        test('should handle missing websocket state', async () => {
            const gameId = 'nonexistent-room';
            
            const result = await service.reconcileRoomWithVersionControl(gameId);
            expect(result).toBeNull();
        });
    });
});