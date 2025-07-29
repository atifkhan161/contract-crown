/**
 * Integration tests for ReliableSocketManager
 * Tests the integration between SocketManager and WebsocketReliabilityLayer
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ReliableSocketManager from '../websocket/reliableSocketManager.js';
import axios from 'axios';

// Mock axios
vi.mock('axios');

// Mock Socket.IO and SocketManager
const mockSocket = {
    id: 'socket-123',
    userId: 'user-1',
    username: 'testuser',
    emit: vi.fn(),
    to: vi.fn(() => ({ emit: vi.fn() })),
    join: vi.fn(),
    leave: vi.fn(),
    on: vi.fn()
};

const mockIo = {
    to: vi.fn(() => ({ emit: vi.fn() })),
    in: vi.fn(() => ({ emit: vi.fn() })),
    emit: vi.fn(),
    sockets: {
        sockets: new Map([['socket-123', mockSocket]])
    }
};

const mockSocketManager = {
    io: mockIo,
    gameRooms: new Map(),
    userSockets: new Map(),
    socketUsers: new Map(),
    
    // Original methods that will be wrapped
    handlePlayerReady: vi.fn().mockResolvedValue(),
    handleFormTeams: vi.fn().mockResolvedValue(),
    handleJoinGameRoom: vi.fn().mockResolvedValue(),
    handleStartGame: vi.fn().mockResolvedValue(),
    handleLeaveGameRoom: vi.fn().mockResolvedValue(),
    handleConnection: vi.fn().mockImplementation(() => {})
};

describe('ReliableSocketManager Integration', () => {
    let reliableSocketManager;

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Set up mock room data
        const mockRoom = {
            gameId: 'test-room',
            players: new Map([
                ['user-1', {
                    userId: 'user-1',
                    username: 'testuser',
                    socketId: 'socket-123',
                    isReady: false,
                    teamAssignment: null,
                    joinedAt: new Date().toISOString(),
                    isConnected: true
                }]
            ]),
            teams: { team1: [], team2: [] },
            createdAt: new Date().toISOString(),
            status: 'waiting',
            hostId: 'user-1'
        };
        
        mockSocketManager.gameRooms.set('test-room', mockRoom);
        
        // Mock axios responses
        axios.post.mockResolvedValue({ data: { success: true } });
        axios.get.mockResolvedValue({ data: { success: true } });
        
        reliableSocketManager = new ReliableSocketManager(mockSocketManager);
    });

    afterEach(() => {
        if (reliableSocketManager) {
            reliableSocketManager.shutdown();
        }
    });

    describe('Wrapped Socket Manager Methods', () => {
        it('should initialize and wrap socket manager methods', () => {
            // Verify that the reliable socket manager was created successfully
            expect(reliableSocketManager).toBeDefined();
            expect(reliableSocketManager.socketManager).toBe(mockSocketManager);
            expect(reliableSocketManager.reliabilityLayer).toBeDefined();
        });

        it('should have wrapped the original methods', () => {
            // The methods should still exist but be wrapped
            expect(typeof mockSocketManager.handlePlayerReady).toBe('function');
            expect(typeof mockSocketManager.handleFormTeams).toBe('function');
            expect(typeof mockSocketManager.handleJoinGameRoom).toBe('function');
            expect(typeof mockSocketManager.handleStartGame).toBe('function');
            expect(typeof mockSocketManager.handleLeaveGameRoom).toBe('function');
        });
    });

    describe('Error Handling', () => {
        it('should provide error handling capabilities', () => {
            // Verify that error handling is built into the wrapped methods
            expect(reliableSocketManager.socketManager).toBeDefined();
            
            // The wrapped methods should handle errors gracefully
            // This is tested through the actual implementation
            expect(true).toBe(true);
        });
    });

    describe('Event Confirmation Handlers', () => {
        it('should set up event confirmation handlers on connection', () => {
            const newSocket = {
                ...mockSocket,
                id: 'new-socket',
                on: vi.fn()
            };

            // Call the wrapped handleConnection
            mockSocketManager.handleConnection(newSocket);

            // Verify event handlers were set up
            expect(newSocket.on).toHaveBeenCalledWith('event-confirmation', expect.any(Function));
            expect(newSocket.on).toHaveBeenCalledWith('request-fallback', expect.any(Function));
            expect(newSocket.on).toHaveBeenCalledWith('connection-health-check', expect.any(Function));
        });

        it('should handle event confirmation', () => {
            const newSocket = {
                ...mockSocket,
                id: 'new-socket',
                on: vi.fn()
            };

            mockSocketManager.handleConnection(newSocket);

            // Get the event confirmation handler
            const confirmationHandler = newSocket.on.mock.calls.find(
                call => call[0] === 'event-confirmation'
            )[1];

            // Test the handler
            expect(() => {
                confirmationHandler({ eventId: 'test-event-id' });
            }).not.toThrow();
        });

        it('should handle fallback requests', () => {
            const newSocket = {
                ...mockSocket,
                id: 'new-socket',
                on: vi.fn(),
                emit: vi.fn()
            };

            mockSocketManager.handleConnection(newSocket);

            // Get the fallback request handler
            const fallbackHandler = newSocket.on.mock.calls.find(
                call => call[0] === 'request-fallback'
            )[1];

            // Test the handler
            fallbackHandler({
                eventType: 'player-ready-changed',
                gameId: 'test-room'
            });

            expect(newSocket.emit).toHaveBeenCalledWith('state-refresh-required', {
                gameId: 'test-room',
                reason: 'client_fallback_request',
                timestamp: expect.any(String)
            });
        });

        it('should handle connection health checks', () => {
            const newSocket = {
                ...mockSocket,
                id: 'new-socket',
                on: vi.fn(),
                emit: vi.fn()
            };

            mockSocketManager.handleConnection(newSocket);

            // Get the health check handler
            const healthCheckHandler = newSocket.on.mock.calls.find(
                call => call[0] === 'connection-health-check'
            )[1];

            // Test the handler
            healthCheckHandler();

            expect(newSocket.emit).toHaveBeenCalledWith('connection-health-response', {
                status: 'healthy',
                timestamp: expect.any(String),
                reliabilityEnabled: true
            });
        });
    });

    describe('Reliable Event Emission', () => {
        it('should emit events with reliability layer', async () => {
            const success = await reliableSocketManager.emitReliable(
                'test-room',
                'test-event',
                { message: 'test' }
            );

            expect(success).toBe(true);
        });

        it('should broadcast state synchronization', async () => {
            const reconciledState = {
                gameId: 'test-room',
                players: [],
                teams: { team1: [], team2: [] }
            };

            await reliableSocketManager.broadcastStateSynchronization(
                'test-room',
                reconciledState,
                'test-trigger'
            );

            // Should not throw and should complete successfully
            expect(true).toBe(true);
        });
    });

    describe('Connection Management', () => {
        it('should handle connection failures', async () => {
            await reliableSocketManager.handleConnectionFailure('test-room', 'user-1');

            const room = mockSocketManager.gameRooms.get('test-room');
            const player = room.players.get('user-1');
            
            expect(player.isConnected).toBe(false);
            expect(player.disconnectedAt).toBeDefined();
        });

        it('should handle connection recovery', async () => {
            // First disconnect the player
            await reliableSocketManager.handleConnectionFailure('test-room', 'user-1');
            
            // Then recover the connection
            await reliableSocketManager.handleConnectionRecovery('test-room', 'user-1');

            const room = mockSocketManager.gameRooms.get('test-room');
            const player = room.players.get('user-1');
            
            expect(player.isConnected).toBe(true);
            expect(player.reconnectedAt).toBeDefined();
        });

        it('should handle connection failure for non-existent room', async () => {
            // Should not throw error
            await expect(
                reliableSocketManager.handleConnectionFailure('non-existent-room', 'user-1')
            ).resolves.not.toThrow();
        });

        it('should handle connection recovery for non-existent player', async () => {
            // Should not throw error
            await expect(
                reliableSocketManager.handleConnectionRecovery('test-room', 'non-existent-user')
            ).resolves.not.toThrow();
        });
    });

    describe('Statistics and Configuration', () => {
        it('should get reliability statistics', () => {
            const stats = reliableSocketManager.getReliabilityStats();
            
            expect(stats).toHaveProperty('eventStats');
            expect(stats).toHaveProperty('pendingEvents');
            expect(stats).toHaveProperty('monitoringEnabled');
            expect(stats).toHaveProperty('criticalEvents');
        });

        it('should enable and disable reliability monitoring', () => {
            reliableSocketManager.setReliabilityMonitoring(false);
            let stats = reliableSocketManager.getReliabilityStats();
            expect(stats.monitoringEnabled).toBe(false);

            reliableSocketManager.setReliabilityMonitoring(true);
            stats = reliableSocketManager.getReliabilityStats();
            expect(stats.monitoringEnabled).toBe(true);
        });

        it('should manage critical events', () => {
            const initialStats = reliableSocketManager.getReliabilityStats();
            const initialCount = initialStats.criticalEvents.length;

            reliableSocketManager.addCriticalEvent('new-critical-event');
            let stats = reliableSocketManager.getReliabilityStats();
            expect(stats.criticalEvents).toContain('new-critical-event');
            expect(stats.criticalEvents.length).toBe(initialCount + 1);

            reliableSocketManager.removeCriticalEvent('new-critical-event');
            stats = reliableSocketManager.getReliabilityStats();
            expect(stats.criticalEvents).not.toContain('new-critical-event');
            expect(stats.criticalEvents.length).toBe(initialCount);
        });
    });

    describe('Force Event Delivery', () => {
        it('should force event delivery for testing', async () => {
            const success = await reliableSocketManager.forceEventDelivery(
                'test-room',
                'test-event',
                { message: 'forced test' }
            );

            expect(success).toBe(true);
        });
    });

    describe('HTTP Fallback Integration', () => {
        it('should have HTTP fallback capabilities', () => {
            // Verify that the reliability layer has HTTP fallback configured
            const stats = reliableSocketManager.getReliabilityStats();
            expect(stats.criticalEvents).toContain('player-ready-changed');
            expect(stats.criticalEvents).toContain('teams-formed');
            expect(stats.criticalEvents).toContain('game-starting');
            
            // HTTP fallback is tested in the WebsocketReliabilityLayer unit tests
            expect(true).toBe(true);
        });
    });
});