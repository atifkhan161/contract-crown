/**
 * WebSocket Client Example for Contract Crown PWA
 * Demonstrates how to connect and interact with the WebSocket server
 */

import { io } from 'socket.io-client';
import jwt from 'jsonwebtoken';

// Example usage of the WebSocket client
class ContractCrownWebSocketClient {
  constructor(serverUrl = 'http://localhost:3030') {
    this.serverUrl = serverUrl;
    this.socket = null;
    this.isConnected = false;
    this.userId = null;
    this.username = null;
  }

  /**
   * Connect to the WebSocket server with authentication
   */
  async connect(userId, username, email) {
    try {
      // Generate JWT token (in real app, this would come from login)
      const token = jwt.sign(
        { userId, username, email },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '24h' }
      );

      // Connect with authentication
      this.socket = io(this.serverUrl, {
        auth: {
          token: token
        },
        transports: ['websocket', 'polling']
      });

      this.userId = userId;
      this.username = username;

      // Set up event listeners
      this.setupEventListeners();

      // Wait for connection
      await new Promise((resolve, reject) => {
        this.socket.on('connect', () => {
          this.isConnected = true;
          console.log(`✅ Connected to WebSocket server as ${username}`);
          resolve();
        });

        this.socket.on('connect_error', (error) => {
          console.error('❌ Connection failed:', error.message);
          reject(error);
        });

        setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);
      });

    } catch (error) {
      console.error('Failed to connect:', error.message);
      throw error;
    }
  }

  /**
   * Set up all WebSocket event listeners
   */
  setupEventListeners() {
    // Connection events
    this.socket.on('connection-confirmed', (data) => {
      console.log('🔗 Connection confirmed:', data);
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      console.log('🔌 Disconnected:', reason);
    });

    // Room events
    this.socket.on('room-joined', (data) => {
      console.log('🏠 Joined room:', data.gameId);
      console.log('👥 Players in room:', data.players.length);
    });

    this.socket.on('player-joined', (data) => {
      console.log('👤 Player joined:', data.player.username);
      console.log('👥 Total players:', data.players.length);
    });

    this.socket.on('player-left', (data) => {
      console.log('👋 Player left:', data.playerName);
    });

    this.socket.on('player-ready-changed', (data) => {
      console.log(`🎯 ${data.playerName} ready status: ${data.isReady}`);
      if (data.allReady) {
        console.log('✅ All players ready!');
      }
    });

    // Game events
    this.socket.on('game-starting', (data) => {
      console.log('🎮 Game starting!');
      console.log('👥 Players:', data.players.map(p => p.username).join(', '));
    });

    this.socket.on('trump-declared', (data) => {
      console.log(`♠️ Trump declared: ${data.trumpSuit} by ${data.declaredByName}`);
    });

    this.socket.on('card-played', (data) => {
      console.log(`🃏 Card played: ${data.card.rank} of ${data.card.suit} by ${data.playedByName}`);
    });

    // Connection status events
    this.socket.on('pong', (data) => {
      console.log('🏓 Pong received:', data.timestamp);
    });

    // Error handling
    this.socket.on('error', (error) => {
      console.error('❌ WebSocket error:', error.message);
    });

    // Test events
    this.socket.on('test-response', (data) => {
      console.log('🧪 Test response:', data);
    });
  }

  /**
   * Join a game room
   */
  joinGameRoom(gameId) {
    if (!this.isConnected) {
      throw new Error('Not connected to server');
    }

    console.log(`🏠 Joining game room: ${gameId}`);
    this.socket.emit('join-game-room', { gameId });
  }

  /**
   * Leave a game room
   */
  leaveGameRoom(gameId) {
    if (!this.isConnected) {
      throw new Error('Not connected to server');
    }

    console.log(`🚪 Leaving game room: ${gameId}`);
    this.socket.emit('leave-game-room', { gameId });
  }

  /**
   * Set ready status
   */
  setReady(gameId, isReady) {
    if (!this.isConnected) {
      throw new Error('Not connected to server');
    }

    console.log(`🎯 Setting ready status: ${isReady}`);
    this.socket.emit('player-ready', { gameId, isReady });
  }

  /**
   * Start game (host only)
   */
  startGame(gameId) {
    if (!this.isConnected) {
      throw new Error('Not connected to server');
    }

    console.log('🎮 Starting game...');
    this.socket.emit('start-game', { gameId });
  }

  /**
   * Declare trump suit
   */
  declareTrump(gameId, trumpSuit) {
    if (!this.isConnected) {
      throw new Error('Not connected to server');
    }

    console.log(`♠️ Declaring trump: ${trumpSuit}`);
    this.socket.emit('declare-trump', { gameId, trumpSuit });
  }

  /**
   * Play a card
   */
  playCard(gameId, card) {
    if (!this.isConnected) {
      throw new Error('Not connected to server');
    }

    console.log(`🃏 Playing card: ${card.rank} of ${card.suit}`);
    this.socket.emit('play-card', { gameId, card });
  }

  /**
   * Send ping to server
   */
  ping() {
    if (!this.isConnected) {
      throw new Error('Not connected to server');
    }

    console.log('🏓 Sending ping...');
    this.socket.emit('ping');
  }

  /**
   * Send test message
   */
  sendTest(message) {
    if (!this.isConnected) {
      throw new Error('Not connected to server');
    }

    console.log('🧪 Sending test message...');
    this.socket.emit('test', { message });
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    if (this.socket) {
      console.log('🔌 Disconnecting...');
      this.socket.disconnect();
      this.isConnected = false;
    }
  }
}

// Example usage
async function demonstrateWebSocketClient() {
  console.log('🚀 Starting WebSocket Client Demo\n');

  // Create multiple clients to simulate multiplayer
  const clients = [];
  
  try {
    // Create 4 players
    for (let i = 1; i <= 4; i++) {
      const client = new ContractCrownWebSocketClient();
      await client.connect(`user-${i}`, `Player${i}`, `player${i}@example.com`);
      clients.push(client);
      
      // Small delay between connections
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n🎯 All players connected!\n');

    // Simulate game flow
    const gameId = 'demo-game-123';

    // All players join the same room
    console.log('📍 Phase 1: Joining game room');
    for (const client of clients) {
      client.joinGameRoom(gameId);
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Players mark themselves as ready
    console.log('\n📍 Phase 2: Players getting ready');
    for (let i = 0; i < clients.length; i++) {
      clients[i].setReady(gameId, true);
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Host starts the game
    console.log('\n📍 Phase 3: Starting game');
    clients[0].startGame(gameId);

    await new Promise(resolve => setTimeout(resolve, 500));

    // Simulate trump declaration
    console.log('\n📍 Phase 4: Trump declaration');
    clients[0].declareTrump(gameId, 'Hearts');

    await new Promise(resolve => setTimeout(resolve, 500));

    // Simulate card plays
    console.log('\n📍 Phase 5: Playing cards');
    const cards = [
      { suit: 'Hearts', rank: 'A' },
      { suit: 'Hearts', rank: 'K' },
      { suit: 'Spades', rank: 'Q' },
      { suit: 'Hearts', rank: 'J' }
    ];

    for (let i = 0; i < clients.length; i++) {
      clients[i].playCard(gameId, cards[i]);
      await new Promise(resolve => setTimeout(resolve, 400));
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test ping functionality
    console.log('\n📍 Phase 6: Testing connection');
    clients[0].ping();
    clients[0].sendTest('Hello from demo client!');

    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('\n✅ Demo completed successfully!');

  } catch (error) {
    console.error('❌ Demo failed:', error.message);
  } finally {
    // Clean up connections
    console.log('\n🧹 Cleaning up connections...');
    for (const client of clients) {
      client.disconnect();
    }
  }
}

// Export for use in other modules
export default ContractCrownWebSocketClient;

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateWebSocketClient()
    .then(() => {
      console.log('\n👋 Demo finished');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Demo error:', error);
      process.exit(1);
    });
}