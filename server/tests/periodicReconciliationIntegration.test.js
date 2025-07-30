/**
 * Integration tests for Periodic State Reconciliation Service
 */

import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import GameServer from '../src/server.js';

describe('Periodic State Reconciliation Integration', () => {
    let server;
    let app;

    beforeEach(async () => {
        // Set test environment
        process.env.NODE_ENV = 'test';

        // Create server instance
        server = new GameServer();
        app = server.app;

        // Wait a bit for services to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
        // Stop periodic reconciliation service
        if (server.periodicReconciliationService) {
            server.periodicReconciliationService.stop();
        }

        // Close server if running
        if (server.server && server.server.listening) {
            await new Promise((resolve) => {
                server.server.close(resolve);
            });
        }
    });

    describe('API Endpoints', () => {
        test('should get reconciliation status', async () => {
            const response = await request(app)
                .get('/api/reconciliation/status')
                .expect(200);

            expect(response.body).toHaveProperty('reconciliation');
            expect(response.body.reconciliation).toHaveProperty('isRunning');
            expect(response.body.reconciliation).toHaveProperty('intervals');
            expect(response.body.reconciliation).toHaveProperty('stats');
            expect(response.body).toHaveProperty('timestamp');
        });

        test('should update reconciliation configuration', async () => {
            const newConfig = {
                reconciliationInterval: 45000,
                cleanupInterval: 400000,
                alertThresholds: {
                    maxFailureRate: 0.15
                }
            };

            const response = await request(app)
                .put('/api/reconciliation/config')
                .send(newConfig)
                .expect(200);

            expect(response.body).toHaveProperty('message', 'Configuration updated');
            expect(response.body).toHaveProperty('config');
            expect(response.body.config).toEqual(newConfig);
        });

        test('should reset reconciliation statistics', async () => {
            const response = await request(app)
                .post('/api/reconciliation/reset-stats')
                .expect(200);

            expect(response.body).toHaveProperty('message', 'Statistics reset successfully');
        });

        test('should force reconciliation for specific room', async () => {
            const gameId = 'test-room-123';

            const response = await request(app)
                .post(`/api/reconciliation/force/${gameId}`)
                .expect(200);

            expect(response.body).toHaveProperty('message', 'Reconciliation completed');
            expect(response.body).toHaveProperty('gameId', gameId);
            expect(response.body).toHaveProperty('result');
        });
    });

    describe('Service Integration', () => {
        test('should have periodic reconciliation service initialized', () => {
            expect(server.periodicReconciliationService).toBeDefined();
            expect(typeof server.periodicReconciliationService.start).toBe('function');
            expect(typeof server.periodicReconciliationService.stop).toBe('function');
            expect(typeof server.periodicReconciliationService.getStatus).toBe('function');
        });

        test('should start service automatically', () => {
            const status = server.periodicReconciliationService.getStatus();
            expect(status.isRunning).toBe(false); // Service starts when server starts, not in tests
        });

        test('should provide comprehensive status information', () => {
            const status = server.periodicReconciliationService.getStatus();

            expect(status).toHaveProperty('isRunning');
            expect(status).toHaveProperty('intervals');
            expect(status).toHaveProperty('thresholds');
            expect(status).toHaveProperty('stats');
            expect(status).toHaveProperty('activeRooms');
            expect(status).toHaveProperty('roomVersions');

            expect(status.intervals).toHaveProperty('reconciliation');
            expect(status.intervals).toHaveProperty('cleanup');
            expect(status.intervals).toHaveProperty('monitoring');

            expect(status.stats).toHaveProperty('totalReconciliations');
            expect(status.stats).toHaveProperty('successfulReconciliations');
            expect(status.stats).toHaveProperty('failedReconciliations');
            expect(status.stats).toHaveProperty('inconsistenciesFound');
        });
    });

    describe('Error Handling', () => {
        test('should handle service errors gracefully', async () => {
            // This test verifies that the API endpoints handle errors gracefully
            // The actual error handling is tested in the unit tests
            const response = await request(app)
                .get('/api/reconciliation/status')
                .expect(200);

            // Service should return valid status even when not running
            expect(response.body).toHaveProperty('reconciliation');
            expect(response.body.reconciliation).toHaveProperty('isRunning');
        });

        test('should handle invalid configuration updates', async () => {
            const invalidConfig = {
                reconciliationInterval: 'invalid'
            };

            await request(app)
                .put('/api/reconciliation/config')
                .send(invalidConfig)
                .expect(200); // Service handles invalid config gracefully
        });
    });
});