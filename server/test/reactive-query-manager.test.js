import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ReactiveQueryManager from '../src/services/ReactiveQueryManager.js';
import ConflictResolutionService from '../src/services/ConflictResolutionService.js';

// Mock RxDB connection
const mockRxDBConnection = {
  getCollection: vi.fn()
};

// Mock Socket.IO
const mockSocketManager = {
  io: {
    sockets: {
      sockets: new Map()
    },
    to: vi.fn(() => ({
      emit: vi.fn()
    }))
  }
};

// Mock RxDB collection
const mockCollection = {
  findOne: vi.fn(() => ({
    $: {
      subscribe: vi.fn()
    }
  })),
  find: vi.fn(() => ({
    $: {
      subscribe: vi.fn()
    }
  }))
};

// Mock socket
const mockSocket = {
  id: 'test-socket-id',
  emit: vi.fn()
};

vi.mock('../../database/rxdb-connection.js', () => ({
  default: mockRxDBConnection
}));

describe('ReactiveQueryManager', () => {
  let reactiveQueryManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRxDBConnection.getCollection.mockReturnValue(mockCollection);
    mockSocketManager.io.sockets.sockets.set('test-socket-id', mockSocket);
    
    reactiveQueryManager = new ReactiveQueryManager(mockSocketManager);
  });

  afterEach(() => {
    // Clean up any subscriptions
    if (reactiveQueryManager) {
      reactiveQueryManager.unsubscribeSocket('test-socket-id');
    }
  });

  describe('Room Subscriptions', () => {
    it('should create room subscription successfully', () => {
      const roomId = 'test-room-id';
      const socketId = 'test-socket-id';

      const subscriptionId = reactiveQueryManager.subscribeToRoom(roomId, socketId);

      expect(subscriptionId).toBeDefined();
      expect(subscriptionId).toContain('room_');
      expect(subscriptionId).toContain(roomId);
      expect(subscriptionId).toContain(socketId);
      expect(mockRxDBConnection.getCollection).toHaveBeenCalledWith('rooms');
    });

    it('should create room players subscription successfully', () => {
      const roomId = 'test-room-id';
      const socketId = 'test-socket-id';

      const subscriptionId = reactiveQueryManager.subscribeToRoomPlayers(roomId, socketId);

      expect(subscriptionId).toBeDefined();
      expect(subscriptionId).toContain('room_players_');
      expect(mockRxDBConnection.getCollection).toHaveBeenCalledWith('roomPlayers');
    });
  });

  describe('Game Subscriptions', () => {
    it('should create game subscription successfully', () => {
      const gameId = 'test-game-id';
      const socketId = 'test-socket-id';

      const subscriptionId = reactiveQueryManager.subscribeToGame(gameId, socketId);

      expect(subscriptionId).toBeDefined();
      expect(subscriptionId).toContain('game_');
      expect(subscriptionId).toContain(gameId);
      expect(mockRxDBConnection.getCollection).toHaveBeenCalledWith('games');
    });

    it('should create game players subscription successfully', () => {
      const gameId = 'test-game-id';
      const socketId = 'test-socket-id';

      const subscriptionId = reactiveQueryManager.subscribeToGamePlayers(gameId, socketId);

      expect(subscriptionId).toBeDefined();
      expect(subscriptionId).toContain('game_players_');
      expect(mockRxDBConnection.getCollection).toHaveBeenCalledWith('gamePlayers');
    });
  });

  describe('User Subscriptions', () => {
    it('should create user subscription successfully', () => {
      const userId = 'test-user-id';
      const socketId = 'test-socket-id';

      const subscriptionId = reactiveQueryManager.subscribeToUser(userId, socketId);

      expect(subscriptionId).toBeDefined();
      expect(subscriptionId).toContain('user_');
      expect(subscriptionId).toContain(userId);
      expect(mockRxDBConnection.getCollection).toHaveBeenCalledWith('users');
    });
  });

  describe('Subscription Management', () => {
    it('should track subscriptions correctly', () => {
      const roomId = 'test-room-id';
      const socketId = 'test-socket-id';

      const subscriptionId = reactiveQueryManager.subscribeToRoom(roomId, socketId);
      const stats = reactiveQueryManager.getStats();

      expect(stats.totalSubscriptions).toBe(1);
      expect(stats.activeSocketConnections).toBe(1);
      expect(stats.roomSubscriptions).toBe(1);
    });

    it('should unsubscribe socket subscriptions correctly', () => {
      const roomId = 'test-room-id';
      const socketId = 'test-socket-id';

      // Create multiple subscriptions
      reactiveQueryManager.subscribeToRoom(roomId, socketId);
      reactiveQueryManager.subscribeToRoomPlayers(roomId, socketId);

      const unsubscribedCount = reactiveQueryManager.unsubscribeSocket(socketId);

      expect(unsubscribedCount).toBe(2);
      
      const stats = reactiveQueryManager.getStats();
      expect(stats.totalSubscriptions).toBe(0);
      expect(stats.activeSocketConnections).toBe(0);
    });
  });
});

describe('ConflictResolutionService', () => {
  let conflictResolutionService;

  beforeEach(() => {
    conflictResolutionService = new ConflictResolutionService();
  });

  describe('Last Write Wins Strategy', () => {
    it('should choose document with latest timestamp', () => {
      const localDoc = {
        id: 'test-id',
        data: 'local',
        updated_at: '2023-01-01T10:00:00Z'
      };

      const remoteDoc = {
        id: 'test-id',
        data: 'remote',
        updated_at: '2023-01-01T11:00:00Z'
      };

      const resolved = conflictResolutionService.lastWriteWinsStrategy(localDoc, remoteDoc);

      expect(resolved.data).toBe('remote');
      expect(resolved.updated_at).toBeDefined();
    });
  });

  describe('User Conflict Resolution', () => {
    it('should preserve critical user fields', () => {
      const localDoc = {
        user_id: 'test-user-id',
        username: 'local-user',
        password_hash: 'local-hash',
        total_games_played: 10,
        total_games_won: 5,
        created_at: '2023-01-01T09:00:00Z',
        updated_at: '2023-01-01T10:00:00Z'
      };

      const remoteDoc = {
        user_id: 'test-user-id',
        username: 'remote-user',
        password_hash: 'remote-hash',
        total_games_played: 8,
        total_games_won: 7,
        created_at: '2023-01-01T09:00:00Z',
        updated_at: '2023-01-01T11:00:00Z'
      };

      const resolved = conflictResolutionService.resolveUserConflict(localDoc, remoteDoc);

      // Should preserve local password hash and user_id
      expect(resolved.user_id).toBe('test-user-id');
      expect(resolved.password_hash).toBe('local-hash');
      
      // Should take higher statistics
      expect(resolved.total_games_played).toBe(10);
      expect(resolved.total_games_won).toBe(7);
      
      // Should use remote username (last write wins for non-critical fields)
      expect(resolved.username).toBe('remote-user');
    });
  });

  describe('Game State Conflict Resolution', () => {
    it('should handle game progression correctly', () => {
      const localDoc = {
        game_id: 'test-game-id',
        status: 'waiting',
        created_at: '2023-01-01T09:00:00Z',
        updated_at: '2023-01-01T10:00:00Z'
      };

      const remoteDoc = {
        game_id: 'test-game-id',
        status: 'in_progress',
        started_at: '2023-01-01T10:30:00Z',
        created_at: '2023-01-01T09:00:00Z',
        updated_at: '2023-01-01T11:00:00Z'
      };

      const resolved = conflictResolutionService.resolveGameStateConflict(localDoc, remoteDoc);

      // Should use more progressed status
      expect(resolved.status).toBe('in_progress');
      expect(resolved.started_at).toBe('2023-01-01T10:30:00Z');
      
      // Should preserve immutable fields
      expect(resolved.game_id).toBe('test-game-id');
      expect(resolved.created_at).toBe('2023-01-01T09:00:00Z');
    });
  });

  describe('Room State Conflict Resolution', () => {
    it('should use version-based resolution when versions are available', () => {
      const localDoc = {
        room_id: 'test-room-id',
        name: 'Local Room',
        version: 2,
        updated_at: '2023-01-01T10:00:00Z'
      };

      const remoteDoc = {
        room_id: 'test-room-id',
        name: 'Remote Room',
        version: 3,
        updated_at: '2023-01-01T09:00:00Z'
      };

      const resolved = conflictResolutionService.resolveRoomConflict(localDoc, remoteDoc);

      // Should use remote document (higher version)
      expect(resolved.name).toBe('Remote Room');
      expect(resolved.version).toBe(4); // Incremented
    });
  });

  describe('Strategy Validation', () => {
    it('should return available strategies', () => {
      const strategies = conflictResolutionService.getAvailableStrategies();
      
      expect(strategies).toContain('last-write-wins');
      expect(strategies).toContain('user-data');
      expect(strategies).toContain('game-state');
      expect(strategies).toContain('room-state');
    });

    it('should validate strategy names', () => {
      expect(conflictResolutionService.isValidStrategy('last-write-wins')).toBe(true);
      expect(conflictResolutionService.isValidStrategy('invalid-strategy')).toBe(false);
    });
  });
});