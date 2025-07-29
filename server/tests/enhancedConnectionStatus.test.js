/**
 * Enhanced Connection Status Manager Tests
 * Tests for accurate connection tracking, heartbeat monitoring,
 * reconnection handling, and status broadcasting
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import EnhancedConnectionStatusManager from '../websocket/enhancedConnectionStatusManager.js';

// Mock socket manager
const createMockSocketManager = () => ({
    io: {
        sockets: {
            sockets: new Map()
        },
        to: vi.fn().mockReturnValue({
            emit: vi.fn()
        }),
        emit: vi.fn(),
        on: vi.fn() // Add the missing on method
    },
    gameRooms: new Map(),
    userSockets: new Map(),
    socketUsers: new Map()
});

// Mock socket
const createMockSocket = (userId, username, socketId = 'socket123') => ({
    id: socketId,
    userId,
    username,
    connected: true,
    emit: vi.fn(),
    on: vi.fn(),
    disconnect: vi.fn()
});

describe('EnhancedConnectionStatusManager', () => {
    let connectionManager;
    let mockSocketManager;
    let mockSocket;

    beforeEach(() => {
        // Set test environment
        process.env.NODE_ENV = 'test';
        
        mockSocketManager = createMockSocketManager();
        connectionManager = new EnhancedConnectionStatusManager(mockSocketManager);
        mockSocket = createMockSocket('user123', 'TestUser');
        
        // Mock timers
        vi.useFakeTimers();
    });

    afterEach(() => {
        if (connectionManager) {
            connectionManager.cleanup();
        }
        vi.useRealTimers();
        vi.clearAllMocks();
        delete process.env.NODE_ENV;
    });

    describe('Connection Tracking', () => {
        it('should track new player connections accurately', () => {
            // Requirement 5.1: Accurate player connection status tracking
            connectionManager.handlePlayerConnection(mockSocket);

            expect(connectionManager.playerConnections.has('user123')).toBe(true);
            expect(connectionManager.userToSocket.get('user123')).toBe('socket123');
            expect(connectionManager.socketToUser.get('socket123')).toBe('user123');

            const connectionData = connectionManager.playerConnections.get('user123');
            expect(connectionData.isConnected).toBe(true);
            expect(connectionData.username).toBe('TestUser');
            expect(connectionData.socketId).toBe('socket123');
        });

        it('should update connection statistics on new connections', () => {
            const initialStats = connectionManager.getConnectionStats();
            
            connectionManager.handlePlayerConnection(mockSocket);
            
            const updatedStats = connectionManager.getConnectionStats();
            expect(updatedStats.totalConnections).toBe(initialStats.totalConnections + 1);
            expect(updatedStats.activeConnections).toBe(initialStats.activeConnections + 1);
        });

        it('should handle connections without user info gracefully', () => {
            const invalidSocket = { id: 'invalid', emit: vi.fn() };
            
            connectionManager.handlePlayerConnection(invalidSocket);
            
            expect(connectionManager.playerConnections.size).toBe(0);
        });

        it('should track reconnections correctly', () => {
            // Initial connection
            connectionManager.handlePlayerConnection(mockSocket);
            
            // Simulate disconnection
            connectionManager.handlePlayerDisconnection('user123', 'transport close');
            
            // Reconnection
            const newSocket = createMockSocket('user123', 'TestUser', 'socket456');
            connectionManager.handlePlayerReconnection('user123', newSocket);
            
            const connectionData = connectionManager.playerConnections.get('user123');
            expect(connectionData.reconnectionCount).toBe(1);
            expect(connectionData.isConnected).toBe(true);
            expect(connectionData.socketId).toBe('socket456');
        });
    });

    describe('Heartbeat Monitoring', () => {
        beforeEach(() => {
            connectionManager.handlePlayerConnection(mockSocket);
        });

        it('should start heartbeat monitoring for connected players', () => {
            // Requirement 5.2: Heartbeat monitoring for connection validation
            expect(connectionManager.heartbeatTimers.has('user123')).toBe(true);
            expect(connectionManager.lastHeartbeats.has('user123')).toBe(true);
        });

        it('should send heartbeat pings periodically', () => {
            mockSocketManager.io.sockets.sockets.set('socket123', mockSocket);
            
            // Fast forward time to trigger heartbeat
            vi.advanceTimersByTime(connectionManager.heartbeatInterval);
            
            expect(mockSocket.emit).toHaveBeenCalledWith('heartbeat-ping', expect.objectContaining({
                userId: 'user123',
                timestamp: expect.any(Number)
            }));
        });

        it('should handle heartbeat responses correctly', () => {
            const responseData = { timestamp: Date.now() - 100 };
            
            connectionManager.handleHeartbeatResponse('user123', responseData);
            
            const connectionData = connectionManager.playerConnections.get('user123');
            expect(connectionData.latency).toBeGreaterThan(0);
            expect(connectionData.isConnected).toBe(true);
        });

        it('should update connection quality based on latency', () => {
            // Test excellent connection (< 100ms)
            connectionManager.handleHeartbeatResponse('user123', { timestamp: Date.now() - 50 });
            let connectionData = connectionManager.playerConnections.get('user123');
            expect(connectionData.connectionQuality).toBe('excellent');

            // Test good connection (100-300ms)
            connectionManager.handleHeartbeatResponse('user123', { timestamp: Date.now() - 200 });
            connectionData = connectionManager.playerConnections.get('user123');
            expect(connectionData.connectionQuality).toBe('good');

            // Test fair connection (300-1000ms)
            connectionManager.handleHeartbeatResponse('user123', { timestamp: Date.now() - 500 });
            connectionData = connectionManager.playerConnections.get('user123');
            expect(connectionData.connectionQuality).toBe('fair');

            // Test poor connection (> 1000ms)
            connectionManager.handleHeartbeatResponse('user123', { timestamp: Date.now() - 1500 });
            connectionData = connectionManager.playerConnections.get('user123');
            expect(connectionData.connectionQuality).toBe('poor');
        });

        it('should detect connection timeouts', () => {
            mockSocketManager.io.sockets.sockets.set('socket123', mockSocket);
            
            // Manually trigger timeout by calling the timeout handler
            connectionManager.handleConnectionTimeout('user123');
            
            const connectionData = connectionManager.playerConnections.get('user123');
            expect(connectionData.isConnected).toBe(false);
        });

        it('should stop heartbeat monitoring on disconnection', () => {
            connectionManager.handlePlayerDisconnection('user123', 'client disconnect');
            
            expect(connectionManager.heartbeatTimers.has('user123')).toBe(false);
            expect(connectionManager.lastHeartbeats.has('user123')).toBe(false);
        });
    });

    describe('Reconnection Handling', () => {
        beforeEach(() => {
            // Set up a room with the player
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
            mockSocketManager.gameRooms.set('room123', mockRoom);
            
            connectionManager.handlePlayerConnection(mockSocket);
        });

        it('should handle reconnection with state restoration', async () => {
            // Requirement 5.3: Reconnection handling with state restoration
            
            // Simulate disconnection
            connectionManager.handlePlayerDisconnection('user123', 'transport close');
            
            // Mock Room.findByPlayerId to return room data
            const mockRoom = {
                id: 'room123',
                players: [{
                    id: 'user123',
                    isReady: true,
                    teamAssignment: 1
                }]
            };
            
            // Mock the Room import
            vi.doMock('../src/models/Room.js', () => ({
                default: {
                    findByPlayerId: vi.fn().mockResolvedValue([mockRoom])
                }
            }));
            
            // Reconnection
            const newSocket = createMockSocket('user123', 'TestUser', 'socket456');
            await connectionManager.handlePlayerReconnection('user123', newSocket);
            
            const connectionData = connectionManager.playerConnections.get('user123');
            expect(connectionData.isConnected).toBe(true);
            expect(connectionData.reconnectionCount).toBe(1);
            
            // Verify state restoration
            const roomPlayer = mockSocketManager.gameRooms.get('room123').players.get('user123');
            expect(roomPlayer.isConnected).toBe(true);
            expect(roomPlayer.isReady).toBe(true);
            expect(roomPlayer.teamAssignment).toBe(1);
        });

        it('should send connection restored confirmation', async () => {
            connectionManager.handlePlayerDisconnection('user123', 'transport close');
            
            const newSocket = createMockSocket('user123', 'TestUser', 'socket456');
            await connectionManager.handlePlayerReconnection('user123', newSocket);
            
            expect(newSocket.emit).toHaveBeenCalledWith('connection-restored', expect.objectContaining({
                userId: 'user123',
                reconnectionCount: 1,
                message: 'Connection restored and state synchronized'
            }));
        });

        it('should update connection mappings on reconnection', async () => {
            connectionManager.handlePlayerDisconnection('user123', 'transport close');
            
            const newSocket = createMockSocket('user123', 'TestUser', 'socket456');
            await connectionManager.handlePlayerReconnection('user123', newSocket);
            
            expect(connectionManager.userToSocket.get('user123')).toBe('socket456');
            expect(connectionManager.socketToUser.get('socket456')).toBe('user123');
        });
    });

    describe('Connection Status Broadcasting', () => {
        beforeEach(() => {
            // Set up a room with multiple players
            const mockRoom = {
                players: new Map([
                    ['user123', {
                        userId: 'user123',
                        username: 'TestUser1',
                        isReady: false,
                        teamAssignment: null,
                        isConnected: true
                    }],
                    ['user456', {
                        userId: 'user456',
                        username: 'TestUser2',
                        isReady: true,
                        teamAssignment: 1,
                        isConnected: true
                    }]
                ])
            };
            mockSocketManager.gameRooms.set('room123', mockRoom);
            
            connectionManager.handlePlayerConnection(mockSocket);
        });

        it('should broadcast connection status to all room members', () => {
            // Requirement 5.4: Connection status broadcasting
            
            connectionManager.broadcastPlayerConnectionStatus('user123', true);
            
            expect(mockSocketManager.io.to).toHaveBeenCalledWith('room123');
            expect(mockSocketManager.io.to().emit).toHaveBeenCalledWith('player-connected', expect.objectContaining({
                gameId: 'room123',
                playerId: 'user123',
                playerName: 'TestUser',
                isConnected: true,
                players: expect.arrayContaining([
                    expect.objectContaining({
                        userId: 'user123',
                        username: 'TestUser1',
                        isConnected: true
                    }),
                    expect.objectContaining({
                        userId: 'user456',
                        username: 'TestUser2',
                        isConnected: true
                    })
                ])
            }));
        });

        it('should broadcast disconnection status', () => {
            connectionManager.broadcastPlayerConnectionStatus('user123', false);
            
            expect(mockSocketManager.io.to().emit).toHaveBeenCalledWith('player-disconnected', expect.objectContaining({
                gameId: 'room123',
                playerId: 'user123',
                isConnected: false
            }));
        });

        it('should broadcast reconnection status', () => {
            connectionManager.broadcastPlayerConnectionStatus('user123', true, true);
            
            expect(mockSocketManager.io.to().emit).toHaveBeenCalledWith('player-reconnected', expect.objectContaining({
                gameId: 'room123',
                playerId: 'user123',
                isConnected: true,
                isReconnection: true
            }));
        });

        it('should include connected player count in broadcasts', () => {
            connectionManager.broadcastPlayerConnectionStatus('user123', true);
            
            expect(mockSocketManager.io.to().emit).toHaveBeenCalledWith('player-connected', expect.objectContaining({
                connectedPlayerCount: 2
            }));
        });
    });

    describe('Connection Quality Monitoring', () => {
        beforeEach(() => {
            connectionManager.handlePlayerConnection(mockSocket);
        });

        it('should track connection quality metrics', () => {
            const qualityData = {
                quality: 'good',
                latency: 150
            };
            
            connectionManager.updateConnectionQuality('user123', qualityData);
            
            const connectionData = connectionManager.playerConnections.get('user123');
            expect(connectionData.connectionQuality).toBe('good');
            expect(connectionData.latency).toBe(150);
        });

        it('should provide connection quality in player data', () => {
            connectionManager.updateConnectionQuality('user123', { quality: 'excellent', latency: 50 });
            
            expect(connectionManager.getPlayerConnectionQuality('user123')).toBe('excellent');
            expect(connectionManager.getPlayerLatency('user123')).toBe(50);
        });
    });

    describe('Utility Methods', () => {
        beforeEach(() => {
            connectionManager.handlePlayerConnection(mockSocket);
        });

        it('should check if player is connected', () => {
            expect(connectionManager.isPlayerConnected('user123')).toBe(true);
            
            connectionManager.handlePlayerDisconnection('user123', 'test');
            
            expect(connectionManager.isPlayerConnected('user123')).toBe(false);
        });

        it('should get connected players for a room', () => {
            const mockRoom = {
                players: new Map([
                    ['user123', {
                        userId: 'user123',
                        username: 'TestUser1',
                        isReady: false,
                        teamAssignment: null,
                        isConnected: true
                    }],
                    ['user456', {
                        userId: 'user456',
                        username: 'TestUser2',
                        isReady: true,
                        teamAssignment: 1,
                        isConnected: false
                    }]
                ])
            };
            mockSocketManager.gameRooms.set('room123', mockRoom);
            
            const connectedPlayers = connectionManager.getConnectedPlayers('room123');
            
            expect(connectedPlayers).toHaveLength(1);
            expect(connectedPlayers[0].userId).toBe('user123');
            expect(connectedPlayers[0].username).toBe('TestUser1');
        });

        it('should provide connection statistics', () => {
            const stats = connectionManager.getConnectionStats();
            
            expect(stats).toHaveProperty('totalConnections');
            expect(stats).toHaveProperty('activeConnections');
            expect(stats).toHaveProperty('trackedPlayers');
            expect(stats).toHaveProperty('heartbeatMonitoring');
        });

        it('should force disconnect players', () => {
            mockSocketManager.io.sockets.sockets.set('socket123', mockSocket);
            connectionManager.userToSocket.set('user123', 'socket123');
            
            const result = connectionManager.forceDisconnectPlayer('user123', 'Admin action');
            
            expect(result).toBe(true);
            expect(mockSocket.emit).toHaveBeenCalledWith('force-disconnect', expect.objectContaining({
                reason: 'Admin action'
            }));
            expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
        });

        it('should cleanup user connections', () => {
            connectionManager.cleanupUserConnection('user123');
            
            expect(connectionManager.playerConnections.has('user123')).toBe(false);
            expect(connectionManager.userToSocket.has('user123')).toBe(false);
            expect(connectionManager.heartbeatTimers.has('user123')).toBe(false);
        });
    });

    describe('Error Handling', () => {
        it('should handle missing connection data gracefully', () => {
            expect(() => {
                connectionManager.handleHeartbeatResponse('nonexistent', { timestamp: Date.now() });
            }).not.toThrow();
        });

        it('should handle disconnection of unknown users', () => {
            expect(() => {
                connectionManager.handlePlayerDisconnection('nonexistent', 'test');
            }).not.toThrow();
        });

        it('should handle reconnection attempts for unknown users', async () => {
            const newSocket = createMockSocket('unknown', 'Unknown', 'socket999');
            
            await expect(
                connectionManager.handlePlayerReconnection('unknown', newSocket)
            ).resolves.not.toThrow();
        });
    });
});