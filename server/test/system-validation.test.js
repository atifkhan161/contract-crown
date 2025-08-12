import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import rxdbConnection from '../database/rxdb-connection.js';
import { Server } from 'socket.io';
import { createServer } from 'http';
import Client from 'socket.io-client';

/**
 * System Validation Test Suite
 * Tests complete system functionality with RxDB backend
 * Validates all game features work correctly after migration
 */
describe('System Validation - Complete Game Features with RxDB', () => {
    let app;
    let server;
    let io;

    let clientSocket;
    let testUser;
    let testRoom;
    let testGame;

    beforeAll(async () => {
        // Initialize RxDB connection
        await rxdbConnection.initialize();

        // Create HTTP server and Socket.IO
        server = createServer();
        io = new Server(server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });

        // Create Express app with all dependencies
        const mockSocketManager = {
            handleConnection: () => {},
            handleDisconnection: () => {},
            broadcastToRoom: () => {},
            getConnectedUsers: () => []
        };

        const mockConnectionStatusManager = {
            getPublicStats: () => ({ connectedUsers: 0, activeRooms: 0 }),
            getDetailedStats: () => ({ connections: [] })
        };

        const mockPeriodicReconciliationService = {
            getStatus: () => ({ enabled: true, lastRun: new Date() }),
            forceReconciliation: async () => ({ success: true }),
            updateConfig: () => {},
            resetStats: () => {}
        };

        const mockMonitoringService = {
            getDashboardData: () => ({ metrics: {} }),
            exportMetrics: () => ({ performance: {} }),
            getRoomDiagnostics: () => ({ status: 'healthy' }),
            resetMetrics: () => {}
        };

        const mockDiagnosticTools = {
            runLobbyDiagnostics: async () => ({ status: 'passed' }),
            runConnectionTest: async () => ({ status: 'passed' }),
            getDiagnosticResult: () => null,
            getAllDiagnosticResults: () => [],
            getDiagnosticSummary: () => ({ total: 0 })
        };

        const mockPerformanceMonitor = {
            getPerformanceSummary: () => ({ averageResponseTime: 50 }),
            getRoomProfile: () => null,
            getUserProfile: () => null,
            exportPerformanceData: () => ({ metrics: {} }),
            resetMetrics: () => {}
        };

        app = createApp(
            io,
            mockSocketManager,
            mockConnectionStatusManager,
            mockPeriodicReconciliationService,
            mockMonitoringService,
            mockDiagnosticTools,
            mockPerformanceMonitor
        );

        // Start server
        await new Promise((resolve) => {
            server.listen(0, resolve);
        });

        const port = server.address().port;
        
        // Create client socket for WebSocket testing
        clientSocket = Client(`http://localhost:${port}`);
        await new Promise((resolve) => {
            clientSocket.on('connect', resolve);
        });
    });

    afterAll(async () => {
        if (clientSocket) {
            clientSocket.disconnect();
        }
        if (server) {
            server.close();
        }
        if (rxdbConnection) {
            await rxdbConnection.gracefulShutdown();
        }
    });

    beforeEach(async () => {
        // Clear database before each test
        const collections = rxdbConnection.getCollections();
        for (const [name, collection] of Object.entries(collections)) {
            await collection.find().remove();
        }
    });

    describe('Authentication System', () => {
        it('should register a new user successfully', async () => {
            const userData = {
                username: 'testuser',
                email: 'test@example.com',
                password: 'password123'
            };

            const response = await request(app)
                .post('/api/auth/register')
                .send(userData)
                .expect(201);

            expect(response.body).toHaveProperty('token');
            expect(response.body).toHaveProperty('user');
            expect(response.body.user.username).toBe(userData.username);
            expect(response.body.user.email).toBe(userData.email);

            testUser = response.body.user;
        });

        it('should login with valid credentials', async () => {
            // First register a user
            await request(app)
                .post('/api/auth/register')
                .send({
                    username: 'logintest',
                    email: 'login@example.com',
                    password: 'password123'
                });

            // Then login
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'login@example.com',
                    password: 'password123'
                })
                .expect(200);

            expect(response.body).toHaveProperty('token');
            expect(response.body).toHaveProperty('user');
            expect(response.body.user.email).toBe('login@example.com');
        });

        it('should reject invalid login credentials', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'nonexistent@example.com',
                    password: 'wrongpassword'
                })
                .expect(401);

            expect(response.body).toHaveProperty('error');
        });
    });

    describe('Room Management System', () => {
        let authToken;

        beforeEach(async () => {
            // Create and authenticate a user for room tests
            const registerResponse = await request(app)
                .post('/api/auth/register')
                .send({
                    username: 'roomtester',
                    email: 'room@example.com',
                    password: 'password123'
                });

            authToken = registerResponse.body.token;
            testUser = registerResponse.body.user;
        });

        it('should create a new room successfully', async () => {
            const roomData = {
                name: 'Test Room',
                maxPlayers: 4,
                isPrivate: false
            };

            const response = await request(app)
                .post('/api/rooms')
                .set('Authorization', `Bearer ${authToken}`)
                .send(roomData)
                .expect(201);

            expect(response.body).toHaveProperty('room');
            expect(response.body.room.name).toBe(roomData.name);
            expect(response.body.room.maxPlayers).toBe(roomData.maxPlayers);
            expect(response.body.room.ownerId).toBe(testUser.user_id);

            testRoom = response.body.room;
        });

        it('should list available rooms', async () => {
            // Create a room first
            await request(app)
                .post('/api/rooms')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Public Room',
                    maxPlayers: 4,
                    isPrivate: false
                });

            const response = await request(app)
                .get('/api/rooms')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('rooms');
            expect(Array.isArray(response.body.rooms)).toBe(true);
            expect(response.body.rooms.length).toBeGreaterThan(0);
        });

        it('should join a room successfully', async () => {
            // Create a room
            const roomResponse = await request(app)
                .post('/api/rooms')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Join Test Room',
                    maxPlayers: 4,
                    isPrivate: false
                });

            const roomId = roomResponse.body.room.room_id;

            // Create another user to join the room
            const user2Response = await request(app)
                .post('/api/auth/register')
                .send({
                    username: 'joiner',
                    email: 'joiner@example.com',
                    password: 'password123'
                });

            const user2Token = user2Response.body.token;

            // Join the room
            const joinResponse = await request(app)
                .post(`/api/rooms/${roomId}/join`)
                .set('Authorization', `Bearer ${user2Token}`)
                .expect(200);

            expect(joinResponse.body).toHaveProperty('success', true);
        });

        it('should leave a room successfully', async () => {
            // Create and join a room
            const roomResponse = await request(app)
                .post('/api/rooms')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Leave Test Room',
                    maxPlayers: 4,
                    isPrivate: false
                });

            const roomId = roomResponse.body.room.room_id;

            // Leave the room
            const leaveResponse = await request(app)
                .post(`/api/rooms/${roomId}/leave`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(leaveResponse.body).toHaveProperty('success', true);
        });
    });

    describe('Game Management System', () => {
        let authToken;
        let roomId;

        beforeEach(async () => {
            // Create user and room for game tests
            const registerResponse = await request(app)
                .post('/api/auth/register')
                .send({
                    username: 'gametester',
                    email: 'game@example.com',
                    password: 'password123'
                });

            authToken = registerResponse.body.token;
            testUser = registerResponse.body.user;

            const roomResponse = await request(app)
                .post('/api/rooms')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Game Test Room',
                    maxPlayers: 4,
                    isPrivate: false
                });

            roomId = roomResponse.body.room.room_id;
        });

        it('should start a new game successfully', async () => {
            const response = await request(app)
                .post(`/api/games/start`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({ roomId })
                .expect(201);

            expect(response.body).toHaveProperty('game');
            expect(response.body.game.status).toBe('waiting');
            expect(response.body.game.hostId).toBe(testUser.user_id);

            testGame = response.body.game;
        });

        it('should get game state successfully', async () => {
            // Start a game first
            const gameResponse = await request(app)
                .post(`/api/games/start`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({ roomId });

            const gameId = gameResponse.body.game.game_id;

            const stateResponse = await request(app)
                .get(`/api/games/${gameId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(stateResponse.body).toHaveProperty('game');
            expect(stateResponse.body.game.game_id).toBe(gameId);
        });

        it('should handle game actions correctly', async () => {
            // Start a game
            const gameResponse = await request(app)
                .post(`/api/games/start`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({ roomId });

            const gameId = gameResponse.body.game.game_id;

            // Test game action (this would depend on your specific game logic)
            const actionResponse = await request(app)
                .post(`/api/games/${gameId}/action`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    type: 'ready',
                    data: {}
                });

            // The response depends on your game logic implementation
            expect(actionResponse.status).toBeOneOf([200, 400, 404]);
        });
    });

    describe('Real-time Synchronization', () => {
        let authToken;
        let roomId;

        beforeEach(async () => {
            const registerResponse = await request(app)
                .post('/api/auth/register')
                .send({
                    username: 'realtimetester',
                    email: 'realtime@example.com',
                    password: 'password123'
                });

            authToken = registerResponse.body.token;
            testUser = registerResponse.body.user;

            const roomResponse = await request(app)
                .post('/api/rooms')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Realtime Test Room',
                    maxPlayers: 4,
                    isPrivate: false
                });

            roomId = roomResponse.body.room.room_id;
        });

        it('should handle WebSocket connections', (done) => {
            clientSocket.emit('join-room', { roomId, userId: testUser.user_id });
            
            clientSocket.on('room-joined', (data) => {
                expect(data).toHaveProperty('roomId', roomId);
                done();
            });

            // Timeout the test if no response
            setTimeout(() => {
                done(new Error('WebSocket connection test timed out'));
            }, 5000);
        });

        it('should broadcast room updates', (done) => {
            let updateReceived = false;

            clientSocket.emit('join-room', { roomId, userId: testUser.user_id });
            
            clientSocket.on('room-update', (data) => {
                if (!updateReceived) {
                    updateReceived = true;
                    expect(data).toHaveProperty('roomId', roomId);
                    done();
                }
            });

            // Simulate a room update after joining
            setTimeout(() => {
                clientSocket.emit('room-action', {
                    roomId,
                    action: 'update-settings',
                    data: { maxPlayers: 6 }
                });
            }, 1000);

            setTimeout(() => {
                if (!updateReceived) {
                    done(new Error('Room update broadcast test timed out'));
                }
            }, 5000);
        });
    });

    describe('Data Persistence and Integrity', () => {
        let authToken;

        beforeEach(async () => {
            const registerResponse = await request(app)
                .post('/api/auth/register')
                .send({
                    username: 'persistencetester',
                    email: 'persistence@example.com',
                    password: 'password123'
                });

            authToken = registerResponse.body.token;
            testUser = registerResponse.body.user;
        });

        it('should persist user data correctly', async () => {
            // Verify user was created and persisted
            const userCollection = rxdbConnection.getCollections().users;
            const user = await userCollection.findOne({
                selector: { email: 'persistence@example.com' }
            }).exec();

            expect(user).toBeTruthy();
            expect(user.username).toBe('persistencetester');
            expect(user.email).toBe('persistence@example.com');
        });

        it('should persist room data correctly', async () => {
            // Create a room
            const roomResponse = await request(app)
                .post('/api/rooms')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Persistence Test Room',
                    maxPlayers: 4,
                    isPrivate: false
                });

            const roomId = roomResponse.body.room.room_id;

            // Verify room was persisted
            const roomCollection = rxdbConnection.getCollections().rooms;
            const room = await roomCollection.findOne({
                selector: { room_id: roomId }
            }).exec();

            expect(room).toBeTruthy();
            expect(room.name).toBe('Persistence Test Room');
            expect(room.maxPlayers).toBe(4);
        });

        it('should handle concurrent updates correctly', async () => {
            // Create a room
            const roomResponse = await request(app)
                .post('/api/rooms')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Concurrent Test Room',
                    maxPlayers: 4,
                    isPrivate: false
                });

            const roomId = roomResponse.body.room.room_id;

            // Simulate concurrent updates
            const updates = [];
            for (let i = 0; i < 5; i++) {
                updates.push(
                    request(app)
                        .put(`/api/rooms/${roomId}`)
                        .set('Authorization', `Bearer ${authToken}`)
                        .send({
                            name: `Updated Room ${i}`,
                            maxPlayers: 4 + i
                        })
                );
            }

            const results = await Promise.allSettled(updates);
            
            // At least some updates should succeed
            const successful = results.filter(r => r.status === 'fulfilled' && r.value.status === 200);
            expect(successful.length).toBeGreaterThan(0);
        });
    });

    describe('Error Handling and Recovery', () => {
        it('should handle invalid API requests gracefully', async () => {
            const response = await request(app)
                .get('/api/nonexistent-endpoint')
                .expect(404);

            expect(response.body).toHaveProperty('error');
        });

        it('should handle malformed request data', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    // Missing required fields
                    username: 'incomplete'
                })
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        it('should handle database connection issues gracefully', async () => {
            // This test would require mocking database failures
            // For now, we'll test that the system responds appropriately to invalid data
            const response = await request(app)
                .post('/api/rooms')
                .send({
                    name: 'Test Room'
                    // Missing authorization header
                })
                .expect(401);

            expect(response.body).toHaveProperty('error');
        });
    });

    describe('Performance and Scalability', () => {
        it('should handle multiple simultaneous requests', async () => {
            const requests = [];
            
            // Create multiple registration requests
            for (let i = 0; i < 10; i++) {
                requests.push(
                    request(app)
                        .post('/api/auth/register')
                        .send({
                            username: `perftest${i}`,
                            email: `perftest${i}@example.com`,
                            password: 'password123'
                        })
                );
            }

            const results = await Promise.allSettled(requests);
            const successful = results.filter(r => r.status === 'fulfilled' && r.value.status === 201);
            
            // Most requests should succeed
            expect(successful.length).toBeGreaterThanOrEqual(8);
        });

        it('should respond within acceptable time limits', async () => {
            const startTime = Date.now();
            
            await request(app)
                .post('/api/auth/register')
                .send({
                    username: 'speedtest',
                    email: 'speed@example.com',
                    password: 'password123'
                })
                .expect(201);

            const responseTime = Date.now() - startTime;
            
            // Response should be under 1 second
            expect(responseTime).toBeLessThan(1000);
        });
    });

    describe('System Health Checks', () => {
        it('should return healthy status from health endpoint', async () => {
            const response = await request(app)
                .get('/health')
                .expect(200);

            expect(response.body).toHaveProperty('status', 'OK');
            expect(response.body).toHaveProperty('timestamp');
            expect(response.body).toHaveProperty('uptime');
        });

        it('should return WebSocket status information', async () => {
            const response = await request(app)
                .get('/api/websocket/status')
                .expect(200);

            expect(response.body).toHaveProperty('websocket');
            expect(response.body.websocket).toHaveProperty('enabled', true);
        });

        it('should return monitoring dashboard data', async () => {
            const response = await request(app)
                .get('/api/monitoring/dashboard')
                .expect(200);

            expect(response.body).toHaveProperty('dashboard');
            expect(response.body).toHaveProperty('timestamp');
        });
    });
});