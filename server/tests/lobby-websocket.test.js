/**
 * Test file for real-time lobby updates WebSocket functionality
 * Tests the implementation of task 5.4
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Server } from 'socket.io';
import { createServer } from 'http';
import Client from 'socket.io-client';
import jwt from 'jsonwebtoken';
import SocketManager from '../websocket/socketManager.js';

describe('Real-time Lobby Updates', () => {
  let httpServer;
  let io;
  let socketManager;
  let clientSocket1;
  let clientSocket2;
  let clientSocket3;
  let clientSocket4;
  const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
  const gameId = 'test-game-123';

  // Test users
  const users = [
    { userId: 'user1', username: 'Player1', email: 'player1@test.com' },
    { userId: 'user2', username: 'Player2', email: 'player2@test.com' },
    { userId: 'user3', username: 'Player3', email: 'player3@test.com' },
    { userId: 'user4', username: 'Player4', email: 'player4@test.com' }
  ];

  beforeEach(async () => {
    // Create HTTP server and Socket.IO instance
    httpServer = createServer();
    io = new Server(httpServer);
    socketManager = new SocketManager(io);

    // Start server
    await new Promise((resolve) => {
      httpServer.listen(0, resolve);
    });

    const port = httpServer.address().port;

    // Create client connections with JWT tokens
    const createClient = (user) => {
      const token = jwt.sign(user, JWT_SECRET);
      return Client(`http://localhost:${port}`, {
        auth: { token },
        transports: ['websocket']
      });
    };

    clientSocket1 = createClient(users[0]);
    clientSocket2 = createClient(users[1]);
    clientSocket3 = createClient(users[2]);
    clientSocket4 = createClient(users[3]);

    // Wait for all connections
    await Promise.all([
      new Promise(resolve => clientSocket1.on('connect', resolve)),
      new Promise(resolve => clientSocket2.on('connect', resolve)),
      new Promise(resolve => clientSocket3.on('connect', resolve)),
      new Promise(resolve => clientSocket4.on('connect', resolve))
    ]);
  });

  afterEach(async () => {
    // Clean up
    clientSocket1?.disconnect();
    clientSocket2?.disconnect();
    clientSocket3?.disconnect();
    clientSocket4?.disconnect();
    
    await new Promise(resolve => {
      httpServer.close(resolve);
    });
  });

  describe('Player Joining/Leaving', () => {
    it('should broadcast when a player joins the room', (done) => {
      let joinEventCount = 0;

      // Set up listeners for player joined event
      [clientSocket2, clientSocket3, clientSocket4].forEach(socket => {
        socket.on('player-joined', (data) => {
          expect(data.gameId).toBe(gameId);
          expect(data.player.username).toBe('Player1');
          expect(data.playerCount).toBe(1);
          expect(data.players).toHaveLength(1);
          
          joinEventCount++;
          if (joinEventCount === 3) {
            done();
          }
        });
      });

      // Player 1 joins the room
      clientSocket1.emit('join-game-room', { gameId });
    });

    it('should broadcast when a player leaves the room', (done) => {
      let leaveEventCount = 0;

      // First, have players join
      clientSocket1.emit('join-game-room', { gameId });
      clientSocket2.emit('join-game-room', { gameId });

      setTimeout(() => {
        // Set up listeners for player left event
        [clientSocket1, clientSocket3, clientSocket4].forEach(socket => {
          socket.on('player-left', (data) => {
            expect(data.gameId).toBe(gameId);
            expect(data.playerName).toBe('Player2');
            expect(data.playerCount).toBe(1);
            expect(data.players).toHaveLength(1);
            
            leaveEventCount++;
            if (leaveEventCount === 3) {
              done();
            }
          });
        });

        // Player 2 leaves the room
        clientSocket2.emit('leave-game-room', { gameId });
      }, 100);
    });

    it('should handle host transfer when host leaves', (done) => {
      // Player 1 joins first (becomes host)
      clientSocket1.emit('join-game-room', { gameId });
      
      setTimeout(() => {
        // Player 2 joins
        clientSocket2.emit('join-game-room', { gameId });
        
        setTimeout(() => {
          // Listen for host transfer
          clientSocket2.on('player-left', (data) => {
            expect(data.newHostId).toBe('user2');
            done();
          });

          // Host (Player 1) leaves
          clientSocket1.emit('leave-game-room', { gameId });
        }, 100);
      }, 100);
    });
  });

  describe('Ready Status Synchronization', () => {
    beforeEach(async () => {
      // Have all players join the room
      clientSocket1.emit('join-game-room', { gameId });
      clientSocket2.emit('join-game-room', { gameId });
      clientSocket3.emit('join-game-room', { gameId });
      clientSocket4.emit('join-game-room', { gameId });
      
      // Wait a bit for joins to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should broadcast ready status changes to all players', (done) => {
      let readyEventCount = 0;

      // Set up listeners for ready status change
      [clientSocket2, clientSocket3, clientSocket4].forEach(socket => {
        socket.on('player-ready-changed', (data) => {
          expect(data.gameId).toBe(gameId);
          expect(data.playerId).toBe('user1');
          expect(data.playerName).toBe('Player1');
          expect(data.isReady).toBe(true);
          expect(data.readyCount).toBe(1);
          expect(data.totalPlayers).toBe(4);
          
          readyEventCount++;
          if (readyEventCount === 3) {
            done();
          }
        });
      });

      // Player 1 sets ready status
      clientSocket1.emit('player-ready', { gameId, isReady: true });
    });

    it('should indicate when all players are ready', (done) => {
      let allReadyReceived = false;

      clientSocket1.on('player-ready-changed', (data) => {
        if (data.allReady && data.canStartGame && !allReadyReceived) {
          allReadyReceived = true;
          expect(data.readyCount).toBe(4);
          expect(data.totalPlayers).toBe(4);
          done();
        }
      });

      // Set all players ready
      clientSocket1.emit('player-ready', { gameId, isReady: true });
      setTimeout(() => clientSocket2.emit('player-ready', { gameId, isReady: true }), 50);
      setTimeout(() => clientSocket3.emit('player-ready', { gameId, isReady: true }), 100);
      setTimeout(() => clientSocket4.emit('player-ready', { gameId, isReady: true }), 150);
    });
  });

  describe('Team Formation Broadcasting', () => {
    beforeEach(async () => {
      // Have all players join the room
      clientSocket1.emit('join-game-room', { gameId });
      clientSocket2.emit('join-game-room', { gameId });
      clientSocket3.emit('join-game-room', { gameId });
      clientSocket4.emit('join-game-room', { gameId });
      
      // Wait for joins to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should broadcast team formation to all players', (done) => {
      let teamEventCount = 0;

      // Set up listeners for team formation
      [clientSocket2, clientSocket3, clientSocket4].forEach(socket => {
        socket.on('teams-formed', (data) => {
          expect(data.gameId).toBe(gameId);
          expect(data.teams.team1).toHaveLength(2);
          expect(data.teams.team2).toHaveLength(2);
          expect(data.formedBy).toBe('Player1');
          
          teamEventCount++;
          if (teamEventCount === 3) {
            done();
          }
        });
      });

      // Host (Player 1) forms teams
      clientSocket1.emit('form-teams', { gameId });
    });

    it('should only allow host to form teams', (done) => {
      clientSocket2.on('error', (data) => {
        expect(data.message).toBe('Only the host can form teams');
        done();
      });

      // Non-host tries to form teams
      clientSocket2.emit('form-teams', { gameId });
    });
  });

  describe('Game Start Coordination', () => {
    beforeEach(async () => {
      // Have all players join and get ready
      clientSocket1.emit('join-game-room', { gameId });
      clientSocket2.emit('join-game-room', { gameId });
      clientSocket3.emit('join-game-room', { gameId });
      clientSocket4.emit('join-game-room', { gameId });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Set all players ready
      clientSocket1.emit('player-ready', { gameId, isReady: true });
      clientSocket2.emit('player-ready', { gameId, isReady: true });
      clientSocket3.emit('player-ready', { gameId, isReady: true });
      clientSocket4.emit('player-ready', { gameId, isReady: true });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Form teams
      clientSocket1.emit('form-teams', { gameId });
      
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should broadcast game start to all players', (done) => {
      let startEventCount = 0;

      // Set up listeners for game starting
      [clientSocket2, clientSocket3, clientSocket4].forEach(socket => {
        socket.on('game-starting', (data) => {
          expect(data.gameId).toBe(gameId);
          expect(data.startedBy).toBe('Player1');
          expect(data.playerCount).toBe(4);
          expect(data.players).toHaveLength(4);
          
          startEventCount++;
          if (startEventCount === 3) {
            done();
          }
        });
      });

      // Host starts the game
      clientSocket1.emit('start-game', { gameId });
    });

    it('should only allow host to start game', (done) => {
      clientSocket2.on('error', (data) => {
        expect(data.message).toBe('Only the host can start the game');
        done();
      });

      // Non-host tries to start game
      clientSocket2.emit('start-game', { gameId });
    });

    it('should require all players to be ready before starting', (done) => {
      // Reset one player's ready status
      clientSocket4.emit('player-ready', { gameId, isReady: false });
      
      setTimeout(() => {
        clientSocket1.on('error', (data) => {
          expect(data.message).toBe('All players must be ready to start game');
          done();
        });

        // Try to start game with not all players ready
        clientSocket1.emit('start-game', { gameId });
      }, 100);
    });
  });

  describe('Connection Status Handling', () => {
    it('should handle player disconnection gracefully', (done) => {
      // Player 1 joins
      clientSocket1.emit('join-game-room', { gameId });
      
      setTimeout(() => {
        // Player 2 joins
        clientSocket2.emit('join-game-room', { gameId });
        
        setTimeout(() => {
          // Listen for disconnection event
          clientSocket1.on('player-disconnected', (data) => {
            expect(data.gameId).toBe(gameId);
            expect(data.playerName).toBe('Player2');
            expect(data.connectedCount).toBe(1);
            done();
          });

          // Simulate disconnection
          clientSocket2.disconnect();
        }, 100);
      }, 100);
    });
  });
});