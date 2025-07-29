/**
 * Ready Status Synchronization Tests
 * Tests for real-time ready status updates, database sync, and HTTP fallback
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as SocketIOClient } from 'socket.io-client';
import SocketManager from '../websocket/socketManager.js';
import ReliableSocketManager from '../websocket/reliableSocketManager.js';

// Mock the JWT validator and related modules
vi.mock('../src/utils/jwtValidator.js', () => ({
    default: class MockJWTValidator {
        extractToken(socket) {
            return socket.handshake.auth?.token || 'mock-token';
        }
        
        async validateWebsocketToken(token) {
            const userId = token.replace('mock-jwt-token-', '');
            return {
                userId,
                username: `User${userId}`,
                email: `user${userId}@test.com`
            };
        }
        
        createAuthContext(user) {
            return {
                userId: user.userId,
                username: user.username,
                validatedAt: new Date().toISOString()
            };
        }
    }
}));

vi.mock('../src/utils/userIdNormalizer.js', () => ({
    default: {
        createNormalizedUserData: (user) => ({
            userId: user.userId,
            username: user.username,
            email: user.email
        }),
        validateUserIdFormat: (userId) => ({
            isValid: true,
            format: 'string'
        })
    }
}));

vi.mock('../src/models/Room.js', () => ({
    default: {
        findById: vi.fn().mockResolvedValue({
            setPlayerReady: vi.fn().mockResolvedValue(true)
        })
    }
}));

describe('Ready Status Synchronization', () => {
    let httpServer;
    let io;
    let socketManager;
    let reliableSocketManager;
    let clientSockets = [];
    let serverPort;

    beforeEach(async () => {
        // Create HTTP server and Socket.IO instance
        httpServer = createServer();
        io = new SocketIOServer(httpServer, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });

        // Initialize socket manager
        socketManager = new SocketManager(io);
        reliableSocketManager = new ReliableSocketManager(socketManager);

        // Start server on random port
        await new Promise((resolve) => {
            httpServer.listen(() => {
                serverPort = httpServer.address().port;
                resolve();
            });
        });

        // Reset mocks
        vi.clearAllMocks();
    });

    afterEach(async () => {
        // Disconnect all client sockets
        for (const socket of clientSockets) {
            if (socket.connected) {
                socket.disconnect();
            }
        }
        clientSockets = [];

        // Close server
        if (httpServer) {
            await new Promise((resolve) => {
                httpServer.close(resolve);
            });
        }
    });

    const createClientSocket = (userId, username) => {
        return new Promise((resolve, reject) => {
            const clientSocket = SocketIOClient(`http://localhost:${serverPort}`, {
                auth: {
                    token: `mock-jwt-token-${userId}`
                }
            });

            clientSocket.on('connect', () => {
                clientSockets.push(clientSocket);
                resolve(clientSocket);
            });

            clientSocket.on('connect_error', (error) => {
                console.error('Connection error:', error);
                reject(error);
            });

            setTimeout(() => reject(new Error('Connection timeout')), 5000);
        });
    };

    describe('Basic Ready Status Updates', () => {
        it('should update ready status and broadcast to all players', async () => {
            const gameId = 'test-game-1';
            
            // Create two client sockets
            const client1 = await createClientSocket('user1', 'Player1');
            const client2 = await createClientSocket('user2', 'Player2');

            // Join both players to the room
            await new Promise((resolve) => {
                client1.emit('join-game-room', { gameId, userId: 'user1', username: 'Player1' });
                client1.on('room-joined', resolve);
            });

            await new Promise((resolve) => {
                client2.emit('join-game-room', { gameId, userId: 'user2', username: 'Player2' });
                client2.on('room-joined', resolve);
            });

            // Set up listeners for ready status changes
            const readyStatusPromises = [
                new Promise((resolve) => {
                    client1.on('player-ready-changed', resolve);
                }),
                new Promise((resolve) => {
                    client2.on('player-ready-changed', resolve);
                })
            ];

            // Player 1 sets ready status
            client1.emit('player-ready', { gameId, isReady: true, userId: 'user1', username: 'Player1' });

            // Wait for both clients to receive the update
            const [update1, update2] = await Promise.all(readyStatusPromises);

            // Verify both clients received the same update
            expect(update1.playerId).toBe('user1');
            expect(update1.isReady).toBe(true);
            expect(update1.readyCount).toBe(1);
            expect(update1.connectedPlayers).toBe(2);
            expect(update1.canStartGame).toBe(false); // Need both players ready

            expect(update2).toEqual(update1);
        });

        it('should enable game start when all connected players are ready', async () => {
            const gameId = 'test-game-2';
            
            const client1 = await createClientSocket('user1', 'Player1');
            const client2 = await createClientSocket('user2', 'Player2');

            // Join both players
            await new Promise((resolve) => {
                client1.emit('join-game-room', { gameId, userId: 'user1', username: 'Player1' });
                client1.on('room-joined', resolve);
            });

            await new Promise((resolve) => {
                client2.emit('join-game-room', { gameId, userId: 'user2', username: 'Player2' });
                client2.on('room-joined', resolve);
            });

            // Player 1 ready
            await new Promise((resolve) => {
                client1.on('player-ready-changed', resolve);
                client1.emit('player-ready', { gameId, isReady: true, userId: 'user1', username: 'Player1' });
            });

            // Player 2 ready - should enable game start
            const finalUpdate = await new Promise((resolve) => {
                client2.on('player-ready-changed', resolve);
                client2.emit('player-ready', { gameId, isReady: true, userId: 'user2', username: 'Player2' });
            });

            expect(finalUpdate.readyCount).toBe(2);
            expect(finalUpdate.allReady).toBe(true);
            expect(finalUpdate.canStartGame).toBe(true);
            expect(finalUpdate.gameStartReason).toBe('Ready to start!');
        });

        it('should handle ready status confirmation', async () => {
            const gameId = 'test-game-3';
            const client1 = await createClientSocket('user1', 'Player1');

            await new Promise((resolve) => {
                client1.emit('join-game-room', { gameId, userId: 'user1', username: 'Player1' });
                client1.on('room-joined', resolve);
            });

            // Set ready and wait for confirmation
            const confirmation = await new Promise((resolve) => {
                client1.on('ready-status-confirmed', resolve);
                client1.emit('player-ready', { gameId, isReady: true, userId: 'user1', username: 'Player1' });
            });

            expect(confirmation.gameId).toBe(gameId);
            expect(confirmation.isReady).toBe(true);
            expect(confirmation.success).toBe(true);
            expect(confirmation.dbSynced).toBe(true);
        });
    });

    describe('Database Synchronization', () => {
        it('should sync ready status with database', async () => {
            const gameId = 'test-game-4';
            const client1 = await createClientSocket('user1', 'Player1');

            await new Promise((resolve) => {
                client1.emit('join-game-room', { gameId, userId: 'user1', username: 'Player1' });
                client1.on('room-joined', resolve);
            });

            // Mock Room model to verify database call
            const Room = await import('../src/models/Room.js');
            const testMockRoom = {
                setPlayerReady: vi.fn().mockResolvedValue(true)
            };
            Room.default.findById.mockResolvedValue(testMockRoom);

            // Set ready status
            await new Promise((resolve) => {
                client1.on('ready-status-confirmed', resolve);
                client1.emit('player-ready', { gameId, isReady: true, userId: 'user1', username: 'Player1' });
            });

            // Verify database was called
            expect(Room.default.findById).toHaveBeenCalledWith(gameId);
            expect(testMockRoom.setPlayerReady).toHaveBeenCalledWith('user1', true);
        });

        it('should handle database sync failures gracefully', async () => {
            const gameId = 'test-game-5';
            const client1 = await createClientSocket('user1', 'Player1');

            await new Promise((resolve) => {
                client1.emit('join-game-room', { gameId, userId: 'user1', username: 'Player1' });
                client1.on('room-joined', resolve);
            });

            // Mock database failure
            const Room = await import('../src/models/Room.js');
            const testMockRoom = {
                setPlayerReady: vi.fn().mockRejectedValue(new Error('Database connection failed'))
            };
            Room.default.findById.mockResolvedValue(testMockRoom);

            // Set up warning listener
            const warningPromise = new Promise((resolve) => {
                client1.on('warning', resolve);
            });

            // Set ready status
            client1.emit('player-ready', { gameId, isReady: true, userId: 'user1', username: 'Player1' });

            // Should receive warning about database sync failure
            const warning = await warningPromise;
            expect(warning.message).toContain('database sync failed');
            expect(warning.fallbackAvailable).toBe(true);
        });
    });

    describe('HTTP API Fallback', () => {
        it('should trigger HTTP fallback when websocket broadcast fails', async () => {
            const gameId = 'test-game-6';
            const client1 = await createClientSocket('user1', 'Player1');
            const client2 = await createClientSocket('user2', 'Player2');

            // Join both players
            await new Promise((resolve) => {
                client1.emit('join-game-room', { gameId, userId: 'user1', username: 'Player1' });
                client1.on('room-joined', resolve);
            });

            await new Promise((resolve) => {
                client2.emit('join-game-room', { gameId, userId: 'user2', username: 'Player2' });
                client2.on('room-joined', resolve);
            });

            // Mock websocket broadcast failure
            const originalEmit = io.to;
            io.to = vi.fn().mockImplementation(() => ({
                emit: vi.fn().mockImplementation(() => {
                    throw new Error('Websocket broadcast failed');
                })
            }));

            // Set up fallback listeners
            const fallbackPromises = [
                new Promise((resolve) => {
                    client1.on('websocket-fallback-active', resolve);
                }),
                new Promise((resolve) => {
                    client2.on('player-ready-changed-fallback', resolve);
                })
            ];

            // Trigger ready status change
            client1.emit('player-ready', { gameId, isReady: true, userId: 'user1', username: 'Player1' });

            // Wait for fallback notifications
            const [fallbackNotification, fallbackUpdate] = await Promise.all(fallbackPromises);

            expect(fallbackNotification.type).toBe('ready-status');
            expect(fallbackNotification.gameId).toBe(gameId);
            expect(fallbackUpdate.playerId).toBe('user1');
            expect(fallbackUpdate.isReady).toBe(true);

            // Restore original emit
            io.to = originalEmit;
        });
    });

    describe('Multi-Client Synchronization', () => {
        it('should synchronize ready status across 4 players', async () => {
            const gameId = 'test-game-7';
            const clients = [];
            
            // Create 4 clients
            for (let i = 1; i <= 4; i++) {
                const client = await createClientSocket(`user${i}`, `Player${i}`);
                clients.push(client);
                
                await new Promise((resolve) => {
                    client.emit('join-game-room', { gameId, userId: `user${i}`, username: `Player${i}` });
                    client.on('room-joined', resolve);
                });
            }

            // Set up listeners for all clients
            const readyStatusPromises = clients.map(client => 
                new Promise((resolve) => {
                    client.on('player-ready-changed', resolve);
                })
            );

            // Player 1 sets ready
            clients[0].emit('player-ready', { gameId, isReady: true, userId: 'user1', username: 'Player1' });

            // All clients should receive the update
            const updates = await Promise.all(readyStatusPromises);
            
            updates.forEach(update => {
                expect(update.playerId).toBe('user1');
                expect(update.isReady).toBe(true);
                expect(update.readyCount).toBe(1);
                expect(update.connectedPlayers).toBe(4);
                expect(update.canStartGame).toBe(false); // Need teams formed for 4 players
                expect(update.gameStartReason).toContain('Teams must be formed');
            });
        });

        it('should handle disconnection and reconnection during ready status changes', async () => {
            const gameId = 'test-game-8';
            const client1 = await createClientSocket('user1', 'Player1');
            const client2 = await createClientSocket('user2', 'Player2');

            // Join both players
            await new Promise((resolve) => {
                client1.emit('join-game-room', { gameId, userId: 'user1', username: 'Player1' });
                client1.on('room-joined', resolve);
            });

            await new Promise((resolve) => {
                client2.emit('join-game-room', { gameId, userId: 'user2', username: 'Player2' });
                client2.on('room-joined', resolve);
            });

            // Player 1 sets ready
            await new Promise((resolve) => {
                client1.on('player-ready-changed', resolve);
                client1.emit('player-ready', { gameId, isReady: true, userId: 'user1', username: 'Player1' });
            });

            // Disconnect client2
            client2.disconnect();

            // Wait a moment for disconnection to be processed
            await new Promise(resolve => setTimeout(resolve, 100));

            // Player 1 changes ready status - should only count connected players
            const update = await new Promise((resolve) => {
                client1.on('player-ready-changed', resolve);
                client1.emit('player-ready', { gameId, isReady: false, userId: 'user1', username: 'Player1' });
            });

            expect(update.connectedPlayers).toBe(1); // Only client1 connected
            expect(update.readyCount).toBe(0);
            expect(update.canStartGame).toBe(false);
            expect(update.gameStartReason).toBe('Need at least 2 connected players');
        });
    });

    describe('Game Start Button State Management', () => {
        it('should properly manage game start button state for 2-player game', async () => {
            const gameId = 'test-game-9';
            const client1 = await createClientSocket('user1', 'Player1');
            const client2 = await createClientSocket('user2', 'Player2');

            // Join both players
            await new Promise((resolve) => {
                client1.emit('join-game-room', { gameId, userId: 'user1', username: 'Player1' });
                client1.on('room-joined', resolve);
            });

            await new Promise((resolve) => {
                client2.emit('join-game-room', { gameId, userId: 'user2', username: 'Player2' });
                client2.on('room-joined', resolve);
            });

            // Both players ready - should enable start
            await new Promise((resolve) => {
                client1.on('player-ready-changed', resolve);
                client1.emit('player-ready', { gameId, isReady: true, userId: 'user1', username: 'Player1' });
            });

            const finalUpdate = await new Promise((resolve) => {
                client2.on('player-ready-changed', resolve);
                client2.emit('player-ready', { gameId, isReady: true, userId: 'user2', username: 'Player2' });
            });

            expect(finalUpdate.canStartGame).toBe(true);
            expect(finalUpdate.gameStartReason).toBe('Ready to start!');
        });

        it('should require team formation for 4-player games', async () => {
            const gameId = 'test-game-10';
            const clients = [];
            
            // Create 4 clients
            for (let i = 1; i <= 4; i++) {
                const client = await createClientSocket(`user${i}`, `Player${i}`);
                clients.push(client);
                
                await new Promise((resolve) => {
                    client.emit('join-game-room', { gameId, userId: `user${i}`, username: `Player${i}` });
                    client.on('room-joined', resolve);
                });
            }

            // All players ready but no teams formed
            for (let i = 0; i < 4; i++) {
                await new Promise((resolve) => {
                    clients[i].on('player-ready-changed', resolve);
                    clients[i].emit('player-ready', { 
                        gameId, 
                        isReady: true, 
                        userId: `user${i + 1}`, 
                        username: `Player${i + 1}` 
                    });
                });
            }

            // Final update should require team formation
            const finalUpdate = await new Promise((resolve) => {
                clients[3].on('player-ready-changed', resolve);
            });

            expect(finalUpdate.allReady).toBe(true);
            expect(finalUpdate.canStartGame).toBe(false);
            expect(finalUpdate.gameStartReason).toBe('Teams must be formed for 4-player games');
        });
    });
});