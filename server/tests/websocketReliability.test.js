/**
 * Tests for WebsocketReliabilityLayer
 * Covers event delivery confirmation, retry mechanisms, and HTTP fallback
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import WebsocketReliabilityLayer from '../src/services/WebsocketReliabilityLayer.js';
import axios from 'axios';

// Mock axios
vi.mock('axios');

// Mock Socket.IO
const mockSocket = {
    emit: vi.fn(),
    to: vi.fn(() => ({ emit: vi.fn() }))
};

const mockIo = {
    to: vi.fn(() => ({ emit: vi.fn() })),
    emit: vi.fn(),
    sockets: {
        sockets: new Map()
    }
};

const mockSocketManager = {
    io: mockIo,
    gameRooms: new Map()
};

describe('WebsocketReliabilityLayer', () => {
    let reliabilityLayer;

    beforeEach(() => {
        vi.clearAllMocks();
        reliabilityLayer = new WebsocketReliabilityLayer(mockIo, mockSocketManager);
        
        // Mock axios responses
        axios.post.mockResolvedValue({ data: { success: true } });
        axios.get.mockResolvedValue({ data: { success: true } });
    });

    afterEach(() => {
        if (reliabilityLayer) {
            reliabilityLayer.shutdown();
        }
    });

    describe('Event Delivery', () => {
        it('should emit event to room successfully', async () => {
            const mockToEmit = vi.fn();
            mockIo.to.mockReturnValue({ emit: mockToEmit });

            const success = await reliabilityLayer.emitWithRetry(
                'test-room',
                'test-event',
                { message: 'test' }
            );

            expect(mockIo.to).toHaveBeenCalledWith('test-room');
            expect(mockToEmit).toHaveBeenCalledWith('test-event', expect.objectContaining({
                message: 'test',
                _eventId: expect.any(String),
                _timestamp: expect.any(String)
            }));
            expect(success).toBe(true);
        });

        it('should emit event to specific socket successfully', async () => {
            const mockSocketEmit = vi.fn();
            const testSocket = { emit: mockSocketEmit };
            mockIo.sockets.sockets.set('socket-123', testSocket);

            const success = await reliabilityLayer.emitWithRetry(
                'socket:socket-123',
                'test-event',
                { message: 'test' }
            );

            expect(mockSocketEmit).toHaveBeenCalledWith('test-event', expect.objectContaining({
                message: 'test',
                _eventId: expect.any(String),
                _timestamp: expect.any(String)
            }));
            expect(success).toBe(true);
        });

        it('should handle socket not found error', async () => {
            const success = await reliabilityLayer.emitWithRetry(
                'socket:nonexistent-socket',
                'test-event',
                { message: 'test' }
            );

            expect(success).toBe(false);
        });

        it('should generate unique event IDs', () => {
            const id1 = reliabilityLayer.generateEventId();
            const id2 = reliabilityLayer.generateEventId();
            
            expect(id1).toMatch(/^evt_\d+_[a-z0-9]+$/);
            expect(id2).toMatch(/^evt_\d+_[a-z0-9]+$/);
            expect(id1).not.toBe(id2);
        });
    });

    describe('Event Confirmation', () => {
        it('should handle event confirmation', async () => {
            const mockToEmit = vi.fn();
            mockIo.to.mockReturnValue({ emit: mockToEmit });

            // Start event emission
            const eventPromise = reliabilityLayer.emitWithRetry(
                'test-room',
                'test-event',
                { message: 'test' }
            );

            // Get the event ID from the call
            const eventData = mockToEmit.mock.calls[0][1];
            const eventId = eventData._eventId;

            // Confirm the event
            reliabilityLayer.confirmEventDelivery(eventId);

            const success = await eventPromise;
            expect(success).toBe(true);
        });

        it('should handle confirmation for non-existent event', () => {
            // Should not throw error
            expect(() => {
                reliabilityLayer.confirmEventDelivery('nonexistent-event-id');
            }).not.toThrow();
        });
    });

    describe('Retry Mechanism', () => {
        it('should retry failed events with exponential backoff', async () => {
            // Mock IO to fail initially
            const mockToEmit = vi.fn().mockImplementation(() => {
                throw new Error('Network error');
            });
            mockIo.to.mockReturnValue({ emit: mockToEmit });

            const success = await reliabilityLayer.emitWithRetry(
                'test-room',
                'test-event',
                { message: 'test' },
                { maxRetries: 2 }
            );

            expect(success).toBe(false);
            // Should have attempted multiple times
            expect(mockToEmit).toHaveBeenCalledTimes(1); // Initial attempt
        });

        it('should respect max retry limit', async () => {
            const mockToEmit = vi.fn().mockImplementation(() => {
                throw new Error('Network error');
            });
            mockIo.to.mockReturnValue({ emit: mockToEmit });

            const success = await reliabilityLayer.emitWithRetry(
                'test-room',
                'test-event',
                { message: 'test' },
                { maxRetries: 0 }
            );

            expect(success).toBe(false);
            expect(mockToEmit).toHaveBeenCalledTimes(1);
        });
    });

    describe('HTTP Fallback', () => {
        it('should attempt HTTP fallback for critical events', async () => {
            // Mock IO to fail
            const mockToEmit = vi.fn().mockImplementation(() => {
                throw new Error('Network error');
            });
            mockIo.to.mockReturnValue({ emit: mockToEmit });

            // Mock successful HTTP response
            axios.post.mockResolvedValue({ data: { success: true } });

            const success = await reliabilityLayer.emitWithRetry(
                'test-room',
                'player-ready-changed',
                {
                    gameId: 'test-room',
                    playerId: 'player-1',
                    isReady: true
                },
                { maxRetries: 1 }
            );

            expect(success).toBe(false); // Websocket failed
            // HTTP fallback should have been attempted
            expect(axios.post).toHaveBeenCalledWith(
                expect.stringContaining('/api/rooms/test-room/ready'),
                expect.objectContaining({
                    isReady: true,
                    playerId: 'player-1'
                }),
                expect.any(Object)
            );
        });

        it('should handle HTTP fallback for team formation', async () => {
            const mockToEmit = vi.fn().mockImplementation(() => {
                throw new Error('Network error');
            });
            mockIo.to.mockReturnValue({ emit: mockToEmit });

            axios.post.mockResolvedValue({ data: { success: true } });

            await reliabilityLayer.emitWithRetry(
                'test-room',
                'teams-formed',
                {
                    gameId: 'test-room',
                    teams: { team1: [], team2: [] }
                },
                { maxRetries: 1 }
            );

            expect(axios.post).toHaveBeenCalledWith(
                expect.stringContaining('/api/rooms/test-room/form-teams'),
                expect.objectContaining({
                    teams: { team1: [], team2: [] }
                }),
                expect.any(Object)
            );
        });

        it('should handle HTTP fallback for game starting', async () => {
            const mockToEmit = vi.fn().mockImplementation(() => {
                throw new Error('Network error');
            });
            mockIo.to.mockReturnValue({ emit: mockToEmit });

            axios.post.mockResolvedValue({ data: { success: true } });

            await reliabilityLayer.emitWithRetry(
                'test-room',
                'game-starting',
                {
                    gameId: 'test-room',
                    startedById: 'player-1'
                },
                { maxRetries: 1 }
            );

            expect(axios.post).toHaveBeenCalledWith(
                expect.stringContaining('/api/rooms/test-room/start'),
                expect.objectContaining({
                    startedBy: 'player-1'
                }),
                expect.any(Object)
            );
        });

        it('should handle HTTP fallback for room updates', async () => {
            const mockToEmit = vi.fn().mockImplementation(() => {
                throw new Error('Network error');
            });
            mockIo.to.mockReturnValue({ emit: mockToEmit });

            axios.get.mockResolvedValue({ data: { success: true } });

            await reliabilityLayer.emitWithRetry(
                'test-room',
                'player-joined',
                {
                    gameId: 'test-room',
                    playerId: 'player-1'
                },
                { maxRetries: 1 }
            );

            expect(axios.get).toHaveBeenCalledWith(
                expect.stringContaining('/api/rooms/test-room'),
                expect.any(Object)
            );
        });

        it('should handle HTTP fallback failure gracefully', async () => {
            const mockToEmit = vi.fn().mockImplementation(() => {
                throw new Error('Network error');
            });
            mockIo.to.mockReturnValue({ emit: mockToEmit });

            // Mock HTTP failure
            axios.post.mockRejectedValue(new Error('HTTP error'));

            const success = await reliabilityLayer.emitWithRetry(
                'test-room',
                'player-ready-changed',
                {
                    gameId: 'test-room',
                    playerId: 'player-1',
                    isReady: true
                },
                { maxRetries: 1 }
            );

            expect(success).toBe(false);
        });

        it('should not attempt HTTP fallback for non-critical events', async () => {
            const mockToEmit = vi.fn().mockImplementation(() => {
                throw new Error('Network error');
            });
            mockIo.to.mockReturnValue({ emit: mockToEmit });

            await reliabilityLayer.emitWithRetry(
                'test-room',
                'non-critical-event',
                { message: 'test' },
                { maxRetries: 1 }
            );

            expect(axios.post).not.toHaveBeenCalled();
            expect(axios.get).not.toHaveBeenCalled();
        });
    });

    describe('Statistics and Monitoring', () => {
        it('should track event delivery statistics', async () => {
            const mockToEmit = vi.fn();
            mockIo.to.mockReturnValue({ emit: mockToEmit });

            await reliabilityLayer.emitWithRetry(
                'test-room',
                'test-event',
                { message: 'test' }
            );

            const stats = reliabilityLayer.getDeliveryStats();
            expect(stats.eventStats['test-event']).toBeDefined();
            expect(stats.eventStats['test-event'].attempted).toBe(1);
        });

        it('should enable and disable monitoring', () => {
            expect(reliabilityLayer.monitoringEnabled).toBe(true);
            
            reliabilityLayer.setMonitoringEnabled(false);
            expect(reliabilityLayer.monitoringEnabled).toBe(false);
            
            reliabilityLayer.setMonitoringEnabled(true);
            expect(reliabilityLayer.monitoringEnabled).toBe(true);
        });

        it('should manage critical events list', () => {
            const initialSize = reliabilityLayer.criticalEvents.size;
            
            reliabilityLayer.addCriticalEvent('new-critical-event');
            expect(reliabilityLayer.criticalEvents.size).toBe(initialSize + 1);
            expect(reliabilityLayer.criticalEvents.has('new-critical-event')).toBe(true);
            
            reliabilityLayer.removeCriticalEvent('new-critical-event');
            expect(reliabilityLayer.criticalEvents.size).toBe(initialSize);
            expect(reliabilityLayer.criticalEvents.has('new-critical-event')).toBe(false);
        });

        it('should clean up expired events', () => {
            // Add a mock expired event
            const expiredEventId = 'expired-event';
            const expiredEvent = {
                id: expiredEventId,
                createdAt: new Date(Date.now() - 400000).toISOString(), // 6+ minutes ago
                status: 'pending'
            };
            
            reliabilityLayer.pendingEvents.set(expiredEventId, expiredEvent);
            
            // Trigger cleanup
            reliabilityLayer.cleanupExpiredEvents();
            
            expect(reliabilityLayer.pendingEvents.has(expiredEventId)).toBe(false);
        });
    });

    describe('Error Handling', () => {
        it('should handle malformed event data gracefully', async () => {
            const mockToEmit = vi.fn();
            mockIo.to.mockReturnValue({ emit: mockToEmit });

            const success = await reliabilityLayer.emitWithRetry(
                'test-room',
                'test-event',
                null // Malformed data
            );

            expect(success).toBe(true); // Should still succeed with null data
            expect(mockToEmit).toHaveBeenCalledWith('test-event', expect.objectContaining({
                _eventId: expect.any(String),
                _timestamp: expect.any(String)
            }));
        });

        it('should handle empty target gracefully', async () => {
            const success = await reliabilityLayer.emitWithRetry(
                '',
                'test-event',
                { message: 'test' }
            );

            expect(success).toBe(true); // Should still attempt emission
        });

        it('should extract room ID from various target formats', () => {
            expect(reliabilityLayer.extractRoomId('room:test-room')).toBe('test-room');
            expect(reliabilityLayer.extractRoomId('test-room')).toBe('test-room');
            expect(reliabilityLayer.extractRoomId('socket:socket-123')).toBe('socket:socket-123');
        });
    });

    describe('Shutdown', () => {
        it('should clean up resources on shutdown', () => {
            // Add some pending events and timeouts
            reliabilityLayer.pendingEvents.set('test-event', { id: 'test-event' });
            reliabilityLayer.eventTimeouts.set('test-timeout', setTimeout(() => {}, 1000));
            
            reliabilityLayer.shutdown();
            
            expect(reliabilityLayer.pendingEvents.size).toBe(0);
            expect(reliabilityLayer.eventTimeouts.size).toBe(0);
        });
    });
});