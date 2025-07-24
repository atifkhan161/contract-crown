import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer } from 'http';
import { Server } from 'socket.io';
import Client from 'socket.io-client';
import jwt from 'jsonwebtoken';
import SocketManager from '../websocket/socketManager.js';

describe('WebSocket Server Tests', () => {
  let httpServer;
  let io;
  let socketManager;
  let clientSocket;
  let serverSocket;
  let testToken;

  beforeAll(async () => {
    // Create test server
    httpServer = createServer();
    io = new Server(httpServer, {
      cors: {
        origin: true,
        credentials: true
      }
    });

    // Initialize socket manager
    socketManager = new SocketManager(io);

    // Start server
    await new Promise((resolve) => {
      httpServer.listen(0, resolve);
    });

    // Create test JWT token
    testToken = jwt.sign(
      {
        userId: 'test-user-1',
        username: 'testuser',
        email: 'test@example.com'
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    if (clientSocket) {
      clientSocket.close();
    }
    io.close();
    httpServer.close();
  });

  beforeEach(async () => {
    // Clean up any existing connections
    if (clientSocket) {
      clientSocket.close();
    }

    // Create new client connection with authentication
    const port = httpServer.address().port;
    clientSocket = new Client(`http://localhost:${port}`, {
      auth: {
        token: testToken
      }
    });

    // Wait for connection
    await new Promise((resolve, reject) => {
      clientSocket.on('connect', resolve);
      clientSocket.on('connect_error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    // Get server socket
    serverSocket = Array.from(io.sockets.sockets.values())[0];
  });

  describe('Authentication', () => {
    it('should authenticate valid JWT token', (done) => {
      clientSocket.on('connection-confirmed', (data) => {
        expect(data.userId).toBe('test-user-1');
        expect(data.username).toBe('testuser');
        expect(data.socketId).toBeDefined();
        done();
      });
    });

    it('should reject connection without token', async () => {
      const port = httpServer.address().port;
      const unauthorizedClient = new Client(`http://localhost:${port}`);

      await new Promise((resolve) => {
        unauthorizedClient.on('connect_error', (error) => {
          expect(error.message).toContain('Authentication token required');
          unauthorizedClient.close();
          resolve();
        });
      });
    });

    it('should reject connection with invalid token', async () => {
      const port = httpServer.address().port;
      const invalidClient = new Client(`http://localhost:${port}`, {
        auth: {
          token: 'invalid-token'
        }
      });

      await new Promise((resolve) => {
        invalidClient.on('connect_error', (error) => {
          expect(error.message).toContain('Invalid authentication token');
          invalidClient.close();
          resolve();
        });
      });
    });
  });

  describe('Room Management', () => {
    it('should allow joining a game room', (done) => {
      const gameId = 'test-game-1';

      clientSocket.on('room-joined', (data) => {
        expect(data.gameId).toBe(gameId);
        expect(data.players).toHaveLength(1);
        expect(data.players[0].userId).toBe('test-user-1');
        expect(data.players[0].username).toBe('testuser');
        done();
      });

      clientSocket.emit('join-game-room', { gameId });
    });

    it('should broadcast player joined to other players', async () => {
      const gameId = 'test-game-2';
      
      // Create second client
      const port = httpServer.address().port;
      const testToken2 = jwt.sign(
        {
          userId: 'test-user-2',
          username: 'testuser2',
          email: 'test2@example.com'
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '1h' }
      );

      const client2 = new Client(`http://localhost:${port}`, {
        auth: {
          token: testToken2
        }
      });

      await new Promise((resolve) => {
        client2.on('connect', resolve);
      });

      // First client joins room
      clientSocket.emit('join-game-room', { gameId });

      // Wait for first client to join
      await new Promise((resolve) => {
        clientSocket.on('room-joined', resolve);
      });

      // Second client should receive player-joined event when they join
      const playerJoinedPromise = new Promise((resolve) => {
        clientSocket.on('player-joined', (data) => {
          expect(data.gameId).toBe(gameId);
          expect(data.player.userId).toBe('test-user-2');
          expect(data.players).toHaveLength(2);
          resolve();
        });
      });

      client2.emit('join-game-room', { gameId });
      await playerJoinedPromise;

      client2.close();
    });

    it('should handle player ready status', (done) => {
      const gameId = 'test-game-3';

      clientSocket.on('room-joined', () => {
        clientSocket.emit('player-ready', { gameId, isReady: true });
      });

      clientSocket.on('player-ready-changed', (data) => {
        expect(data.gameId).toBe(gameId);
        expect(data.playerId).toBe('test-user-1');
        expect(data.isReady).toBe(true);
        expect(data.players[0].isReady).toBe(true);
        done();
      });

      clientSocket.emit('join-game-room', { gameId });
    });

    it('should handle leaving a game room', (done) => {
      const gameId = 'test-game-4';

      clientSocket.on('room-joined', () => {
        clientSocket.emit('leave-game-room', { gameId });
      });

      clientSocket.on('room-left', (data) => {
        expect(data.gameId).toBe(gameId);
        done();
      });

      clientSocket.emit('join-game-room', { gameId });
    });
  });

  describe('Game Events', () => {
    it('should handle trump declaration', (done) => {
      const gameId = 'test-game-5';

      clientSocket.on('room-joined', () => {
        clientSocket.emit('declare-trump', { gameId, trumpSuit: 'Hearts' });
      });

      clientSocket.on('trump-declared', (data) => {
        expect(data.gameId).toBe(gameId);
        expect(data.trumpSuit).toBe('Hearts');
        expect(data.declaredBy).toBe('test-user-1');
        expect(data.declaredByName).toBe('testuser');
        done();
      });

      clientSocket.emit('join-game-room', { gameId });
    });

    it('should handle card play', (done) => {
      const gameId = 'test-game-6';
      const testCard = { suit: 'Hearts', rank: 'A' };

      clientSocket.on('room-joined', () => {
        clientSocket.emit('play-card', { gameId, card: testCard });
      });

      clientSocket.on('card-played', (data) => {
        expect(data.gameId).toBe(gameId);
        expect(data.card).toEqual(testCard);
        expect(data.playedBy).toBe('test-user-1');
        expect(data.playedByName).toBe('testuser');
        done();
      });

      clientSocket.emit('join-game-room', { gameId });
    });
  });

  describe('Connection Status', () => {
    it('should respond to ping with pong', (done) => {
      clientSocket.on('pong', (data) => {
        expect(data.timestamp).toBeDefined();
        done();
      });

      clientSocket.emit('ping');
    });

    it('should handle test events', (done) => {
      const testData = { message: 'Hello WebSocket!' };

      clientSocket.on('test-response', (data) => {
        expect(data.message).toBe('Server received test event');
        expect(data.from).toBe('testuser');
        expect(data.timestamp).toBeDefined();
        done();
      });

      clientSocket.emit('test', testData);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing game ID in join room', (done) => {
      clientSocket.on('error', (data) => {
        expect(data.message).toBe('Game ID is required');
        done();
      });

      clientSocket.emit('join-game-room', {});
    });

    it('should handle invalid ready status', (done) => {
      clientSocket.on('error', (data) => {
        expect(data.message).toBe('Game ID and ready status are required');
        done();
      });

      clientSocket.emit('player-ready', { gameId: 'test-game' });
    });
  });

  describe('Socket Manager Utilities', () => {
    it('should track user connections', () => {
      expect(socketManager.isUserConnected('test-user-1')).toBe(true);
      expect(socketManager.isUserConnected('non-existent-user')).toBe(false);
    });

    it('should get user socket ID', () => {
      const socketId = socketManager.getUserSocket('test-user-1');
      expect(socketId).toBeDefined();
      expect(typeof socketId).toBe('string');
    });

    it('should provide connection statistics', () => {
      const stats = socketManager.getStats();
      expect(stats.connectedUsers).toBeGreaterThan(0);
      expect(stats.activeRooms).toBeGreaterThanOrEqual(0);
      expect(stats.totalPlayersInRooms).toBeGreaterThanOrEqual(0);
    });
  });
});