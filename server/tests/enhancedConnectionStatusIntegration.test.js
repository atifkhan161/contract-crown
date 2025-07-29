/**
 * Enhanced Connection Status Manager Integration Tests
 * Tests integration with SocketManager and real-world scenarios
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import SocketManager from '../websocket/socketManager.js';
import EnhancedConnectionStatusManager from '../websocket/enhancedConnectionStatusManager.js';

// Mock Socket.IO
const createMockIO = () => ({
    use: vi.fn(),
    on: vi.fn(),
    to: vi.fn().mockReturnValue({
        emit: vi.fn()
    }),
    emit: vi.fn(),
    sockets: {
        sockets: new Map()
    }
});

// Mock socket
const createMockSocket = (userId, username, socketId = 'socket123') => ({
    id: socketId,
    userId,
    username,
    connected: true,
    emit: vi.fn(),
    on: vi.fn(),
    disconnect: vi.fn(),
    join: vi.fn(),
    leave: vi.fn(),
    to: vi.fn().mockReturnValue({
        emit: vi.fn()
    })
});

describe('Enhanced Connection Status Manager Integration', () => {
    let mockIO;
    let socketManager;
    let enhancedConnectionManager;
    let mockSocket;

    beforeEach(() => {
        // Set test environment
        process.env.NODE_ENV = 'test';
        
        mockIO = createMockIO();
        socketManager = new SocketManager(mockIO);
        enhancedConnectionManager = socketManager.enhancedConnectionStatusManager;
        mockSocket = createMockSocket('user123', 'TestUser');
        
        // Mock timers
        vi.useFakeTimers();
    });

    afterEach(() => {
        if (enhancedConnectionManager) {
            enhancedConnectionManager.cleanup();
        }
        vi.useRealTimers();
        vi.clearAllMocks();
        delete process.env.NODE_ENV;
    });

    describe('Integration with SocketManager', () => {
        it('should be properly initialized in SocketManager', () => {
            expect(socketManager.enhancedConnectionStatusManager).toBeInstanceOf(EnhancedConnectionStatusManager);
            expect(enhancedConnectionManager.socketManager).toBe(socketManager);
        });

        it('should handle connection through SocketManager', () => {
            // Simulate connection handling
            enhancedConnectionManager.handlePlayerConnection(mockSocket);

            expect(enhancedConnectionManager.isPlayerConnected('user123')).toBe(true);
            expect(enhancedConnectionManager.playerConnections.has('user123')).toBe(true);
        });

        it('should handle disconnection through SocketManager', () => {
            // Setup connection first
            enhancedConnectionManager.handlePlayerConnection(mockSocket);
            expect(enhancedConnectionManager.isPlayerConnected('user123')).toBe(true);

            // Handle disconnection
            socketManager.handleDisconnection(mockSocket, 'client disconnect');

            expect(enhancedConnectionManager.isPlayerConnected('user123')).toBe(false);
        });
    });

    describe('Room Integration', () => {
        beforeEach(() => {
            // Set up a mock room
            const mockRoom = {
                players: new Map([
                    ['user123', {
                        userId: 'user123',
                        username: 'TestUser',
                        isReady: false,
                        teamAssignment: null,
                        isConnected: true
                    }]
                ])
            };
            socketManager.gameRooms.set('room123', mockRoom);
            
            enhancedConnectionManager.handlePlayerConnection(mockSocket);
        });

        it('should update player connection status in rooms', () => {
            const room = socketManager.gameRooms.get('room123');
            const player = room.players.get('user123');
            
            expect(player.isConnected).toBe(true);

            // Simulate disconnection
            enhancedConnectionManager.handlePlayerDisconnection('user123', 'network error');

            expect(player.isConnected).toBe(false);
        });

        it('should broadcast connection status to room members', () => {
            enhancedConnectionManager.broadcastPlayerConnectionStatus('user123', true);

            expect(mockIO.to).toHaveBeenCalledWith('room123');
            expect(mockIO.to().emit).toHaveBeenCalledWith('player-connected', expect.objectContaining({
                gameId: 'room123',
                playerId: 'user123',
                isConnected: true
            }));
        });

        it('should get connected players for a room', () => {
            const connectedPlayers = enhancedConnectionManager.getConnectedPlayers('room123');
            
            expect(connectedPlayers).toHaveLength(1);
            expect(connectedPlayers[0].userId).toBe('user123');
            expect(connectedPlayers[0].username).toBe('TestUser');
        });
    });

    describe('Reconnection Scenarios', () => {
        beforeEach(() => {
            // Set up room and initial connection
            const mockRoom = {
                players: new Map([
                    ['user123', {
                        userId: 'user123',
                        username: 'TestUser',
                        isReady: true,
                        teamAssignment: 1,
                        isConnected: true
                    }]
                ])
            };
            socketManager.gameRooms.set('room123', mockRoom);
            
            enhancedConnectionManager.handlePlayerConnection(mockSocket);
        });

        it('should handle reconnection with state restoration', async () => {
            // Simulate disconnection
            enhancedConnectionManager.handlePlayerDisconnection('user123', 'network error');
            
            const room = socketManager.gameRooms.get('room123');
            const player = room.players.get('user123');
            expect(player.isConnected).toBe(false);

            // Simulate reconnection
            const newSocket = createMockSocket('user123', 'TestUser', 'socket456');
            await enhancedConnectionManager.handlePlayerReconnection('user123', newSocket);

            expect(player.isConnected).toBe(true);
            expect(enhancedConnectionManager.isPlayerConnected('user123')).toBe(true);
            expect(enhancedConnectionManager.userToSocket.get('user123')).toBe('socket456');
        });

        it('should restore player state from websocket room data', async () => {
            // Set up player with specific state
            const room = socketManager.gameRooms.get('room123');
            const player = room.players.get('user123');
            player.isReady = true;
            player.teamAssignment = 2;

            // Simulate disconnection
            enhancedConnectionManager.handlePlayerDisconnection('user123', 'network error');
            expect(player.isConnected).toBe(false);

            // Simulate reconnection
            const newSocket = createMockSocket('user123', 'TestUser', 'socket456');
            await enhancedConnectionManager.handlePlayerReconnection('user123', newSocket);

            // Verify state is restored
            expect(player.isConnected).toBe(true);
            expect(player.isReady).toBe(true);
            expect(player.teamAssignment).toBe(2);
        });
    });

    describe('Heartbeat Monitoring Integration', () => {
        beforeEach(() => {
            enhancedConnectionManager.handlePlayerConnection(mockSocket);
        });

        it('should start heartbeat monitoring on connection', () => {
            expect(enhancedConnectionManager.heartbeatTimers.has('user123')).toBe(true);
            expect(enhancedConnectionManager.lastHeartbeats.has('user123')).toBe(true);
        });

        it('should handle heartbeat responses and update connection quality', () => {
            const responseData = { timestamp: Date.now() - 100 };
            
            enhancedConnectionManager.handleHeartbeatResponse('user123', responseData);
            
            const connectionData = enhancedConnectionManager.playerConnections.get('user123');
            expect(connectionData.latency).toBeGreaterThan(0);
            // The latency calculation might vary, so just check it's a valid quality
            expect(['excellent', 'good', 'fair', 'poor']).toContain(connectionData.connectionQuality);
        });

        it('should stop heartbeat monitoring on disconnection', () => {
            expect(enhancedConnectionManager.heartbeatTimers.has('user123')).toBe(true);
            
            enhancedConnectionManager.handlePlayerDisconnection('user123', 'client disconnect');
            
            expect(enhancedConnectionManager.heartbeatTimers.has('user123')).toBe(false);
        });
    });

    describe('Multi-Player Scenarios', () => {
        beforeEach(() => {
            // Set up room with multiple players
            const mockRoom = {
                players: new Map([
                    ['user123', {
                        userId: 'user123',
                        username: 'Player1',
                        isReady: false,
                        teamAssignment: null,
                        isConnected: true
                    }],
                    ['user456', {
                        userId: 'user456',
                        username: 'Player2',
                        isReady: true,
                        teamAssignment: 1,
                        isConnected: true
                    }],
                    ['user789', {
                        userId: 'user789',
                        username: 'Player3',
                        isReady: false,
                        teamAssignment: 2,
                        isConnected: false
                    }]
                ])
            };
            socketManager.gameRooms.set('room123', mockRoom);
            
            // Connect first two players
            enhancedConnectionManager.handlePlayerConnection(mockSocket);
            const socket2 = createMockSocket('user456', 'Player2', 'socket456');
            enhancedConnectionManager.handlePlayerConnection(socket2);
        });

        it('should track multiple player connections', () => {
            expect(enhancedConnectionManager.isPlayerConnected('user123')).toBe(true);
            expect(enhancedConnectionManager.isPlayerConnected('user456')).toBe(true);
            expect(enhancedConnectionManager.isPlayerConnected('user789')).toBe(false);
        });

        it('should get only connected players for a room', () => {
            const connectedPlayers = enhancedConnectionManager.getConnectedPlayers('room123');
            
            expect(connectedPlayers).toHaveLength(2);
            expect(connectedPlayers.map(p => p.userId)).toEqual(['user123', 'user456']);
        });

        it('should broadcast to all players when one disconnects', () => {
            enhancedConnectionManager.handlePlayerDisconnection('user123', 'network error');
            
            expect(mockIO.to).toHaveBeenCalledWith('room123');
            expect(mockIO.to().emit).toHaveBeenCalledWith('player-disconnected', expect.objectContaining({
                gameId: 'room123',
                playerId: 'user123',
                isConnected: false,
                connectedPlayerCount: 1 // Only user456 should be connected now
            }));
        });

        it('should handle simultaneous disconnections', () => {
            enhancedConnectionManager.handlePlayerDisconnection('user123', 'network error');
            enhancedConnectionManager.handlePlayerDisconnection('user456', 'client disconnect');
            
            expect(enhancedConnectionManager.isPlayerConnected('user123')).toBe(false);
            expect(enhancedConnectionManager.isPlayerConnected('user456')).toBe(false);
            
            const connectedPlayers = enhancedConnectionManager.getConnectedPlayers('room123');
            expect(connectedPlayers).toHaveLength(0);
        });
    });

    describe('Connection Statistics', () => {
        it('should track connection statistics accurately', () => {
            const initialStats = enhancedConnectionManager.getConnectionStats();
            
            // Connect a player
            enhancedConnectionManager.handlePlayerConnection(mockSocket);
            
            let stats = enhancedConnectionManager.getConnectionStats();
            expect(stats.totalConnections).toBe(initialStats.totalConnections + 1);
            expect(stats.activeConnections).toBe(initialStats.activeConnections + 1);
            
            // Disconnect the player
            enhancedConnectionManager.handlePlayerDisconnection('user123', 'test');
            
            stats = enhancedConnectionManager.getConnectionStats();
            expect(stats.disconnections).toBe(initialStats.disconnections + 1);
            expect(stats.activeConnections).toBe(initialStats.activeConnections);
        });

        it('should track reconnection statistics', async () => {
            const initialStats = enhancedConnectionManager.getConnectionStats();
            
            // Initial connection
            enhancedConnectionManager.handlePlayerConnection(mockSocket);
            
            // Disconnection
            enhancedConnectionManager.handlePlayerDisconnection('user123', 'network error');
            
            // Reconnection
            const newSocket = createMockSocket('user123', 'TestUser', 'socket456');
            await enhancedConnectionManager.handlePlayerReconnection('user123', newSocket);
            
            const stats = enhancedConnectionManager.getConnectionStats();
            expect(stats.reconnections).toBe(initialStats.reconnections + 1);
        });
    });

    describe('Error Handling Integration', () => {
        it('should handle socket manager errors gracefully', () => {
            // Simulate error in socket manager
            expect(() => {
                socketManager.handleDisconnection(null, 'error');
            }).not.toThrow();
        });

        it('should handle room cleanup when player disconnects', () => {
            // Set up room with single player
            const mockRoom = {
                players: new Map([
                    ['user123', {
                        userId: 'user123',
                        username: 'TestUser',
                        isReady: false,
                        teamAssignment: null,
                        isConnected: true
                    }]
                ])
            };
            socketManager.gameRooms.set('room123', mockRoom);
            
            enhancedConnectionManager.handlePlayerConnection(mockSocket);
            
            // Disconnect player
            enhancedConnectionManager.handlePlayerDisconnection('user123', 'client disconnect');
            
            // Room should still exist but player should be marked as disconnected
            expect(socketManager.gameRooms.has('room123')).toBe(true);
            const player = socketManager.gameRooms.get('room123').players.get('user123');
            expect(player.isConnected).toBe(false);
        });
    });
});