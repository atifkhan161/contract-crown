import { describe, it, expect, beforeEach } from 'vitest';
import ConflictResolutionService from '../src/services/ConflictResolutionService.js';

describe('ConflictResolutionService Integration Tests', () => {
  let conflictResolutionService;

  beforeEach(() => {
    conflictResolutionService = new ConflictResolutionService();
  });

  describe('Real-world Conflict Scenarios', () => {
    it('should handle concurrent user profile updates', () => {
      // Simulate two clients updating the same user profile simultaneously
      const localDoc = {
        user_id: 'user-123',
        username: 'player1',
        email: 'player1@example.com',
        password_hash: 'local-hash-abc123',
        total_games_played: 15,
        total_games_won: 8,
        last_login: '2023-01-01T10:00:00Z',
        created_at: '2023-01-01T08:00:00Z',
        updated_at: '2023-01-01T10:00:00Z'
      };

      const remoteDoc = {
        user_id: 'user-123',
        username: 'player1_updated',
        email: 'player1_new@example.com',
        password_hash: 'remote-hash-xyz789',
        total_games_played: 12,
        total_games_won: 10,
        last_login: '2023-01-01T11:00:00Z',
        created_at: '2023-01-01T08:00:00Z',
        updated_at: '2023-01-01T11:00:00Z'
      };

      const resolved = conflictResolutionService.resolveUserConflict(localDoc, remoteDoc);

      // Should preserve critical fields from local
      expect(resolved.user_id).toBe('user-123');
      expect(resolved.password_hash).toBe('local-hash-abc123');
      expect(resolved.created_at).toBe('2023-01-01T08:00:00Z');

      // Should use remote for non-critical fields (last write wins)
      expect(resolved.username).toBe('player1_updated');
      expect(resolved.email).toBe('player1_new@example.com');
      expect(resolved.last_login).toBe('2023-01-01T11:00:00Z');

      // Should take maximum values for statistics
      expect(resolved.total_games_played).toBe(15);
      expect(resolved.total_games_won).toBe(10);

      // Should have updated timestamp
      expect(new Date(resolved.updated_at)).toBeInstanceOf(Date);
    });

    it('should handle game state progression conflicts', () => {
      // Simulate game state conflict where one client shows game as waiting, another as in progress
      const localDoc = {
        game_id: 'game-456',
        game_code: 'ABC123',
        status: 'waiting',
        host_id: 'user-123',
        target_score: 52,
        created_at: '2023-01-01T09:00:00Z',
        updated_at: '2023-01-01T10:00:00Z'
      };

      const remoteDoc = {
        game_id: 'game-456',
        game_code: 'ABC123',
        status: 'in_progress',
        host_id: 'user-123',
        started_at: '2023-01-01T10:30:00Z',
        target_score: 52,
        created_at: '2023-01-01T09:00:00Z',
        updated_at: '2023-01-01T11:00:00Z'
      };

      const resolved = conflictResolutionService.resolveGameStateConflict(localDoc, remoteDoc);

      // Should use the more progressed state
      expect(resolved.status).toBe('in_progress');
      expect(resolved.started_at).toBe('2023-01-01T10:30:00Z');

      // Should preserve immutable fields
      expect(resolved.game_id).toBe('game-456');
      expect(resolved.game_code).toBe('ABC123');
      expect(resolved.host_id).toBe('user-123');
      expect(resolved.created_at).toBe('2023-01-01T09:00:00Z');

      // Should have updated timestamp
      expect(new Date(resolved.updated_at)).toBeInstanceOf(Date);
    });

    it('should handle room state conflicts with version numbers', () => {
      // Simulate room state conflict with version-based resolution
      const localDoc = {
        room_id: 'room-789',
        name: 'My Game Room',
        owner_id: 'user-123',
        status: 'waiting',
        max_players: 4,
        version: 5,
        game_state: {
          currentRound: 1,
          phase: 'trump_declaration',
          scores: { team1: 10, team2: 8 }
        },
        settings: {
          timeLimit: 60,
          allowSpectators: true
        },
        created_at: '2023-01-01T09:00:00Z',
        updated_at: '2023-01-01T10:00:00Z'
      };

      const remoteDoc = {
        room_id: 'room-789',
        name: 'My Game Room - Updated',
        owner_id: 'user-123',
        status: 'playing',
        max_players: 4,
        version: 7,
        game_state: {
          currentRound: 2,
          phase: 'card_play',
          scores: { team1: 15, team2: 12 }
        },
        settings: {
          timeLimit: 90,
          allowSpectators: false
        },
        created_at: '2023-01-01T09:00:00Z',
        updated_at: '2023-01-01T09:30:00Z'
      };

      const resolved = conflictResolutionService.resolveRoomConflict(localDoc, remoteDoc);

      // Should use remote document (higher version) and increment version
      expect(resolved.name).toBe('My Game Room - Updated');
      expect(resolved.status).toBe('playing');
      expect(resolved.version).toBe(8); // Incremented from max(5, 7) + 1
      expect(resolved.game_state.currentRound).toBe(2);
      expect(resolved.game_state.phase).toBe('card_play');

      // Should preserve immutable fields
      expect(resolved.room_id).toBe('room-789');
      expect(resolved.owner_id).toBe('user-123');
      expect(resolved.created_at).toBe('2023-01-01T09:00:00Z');

      // Should have updated timestamp
      expect(new Date(resolved.updated_at)).toBeInstanceOf(Date);
    });

    it('should handle complex game state merging', () => {
      // Test merging of complex game state objects
      const localDoc = {
        room_id: 'room-complex',
        name: 'Complex Game',
        owner_id: 'user-123',
        game_state: {
          currentRound: 2,
          currentTrick: 3,
          phase: 'card_play',
          trumpSuit: 'Hearts',
          scores: { team1: 20, team2: 15 },
          playerHands: {
            'player1': [{ suit: 'Hearts', rank: 'A' }],
            'player2': []
          }
        },
        updated_at: '2023-01-01T10:00:00Z'
      };

      const remoteDoc = {
        room_id: 'room-complex',
        name: 'Complex Game',
        owner_id: 'user-123',
        game_state: {
          currentRound: 1,
          currentTrick: 2,
          phase: 'trump_declaration',
          trumpSuit: null,
          scores: { team1: 18, team2: 22 },
          playerHands: {
            'player1': [],
            'player2': [{ suit: 'Spades', rank: 'K' }],
            'player3': [{ suit: 'Diamonds', rank: 'Q' }]
          }
        },
        updated_at: '2023-01-01T11:00:00Z'
      };

      const resolved = conflictResolutionService.resolveRoomConflict(localDoc, remoteDoc);

      // Should use remote (later timestamp) but merge game state intelligently
      expect(resolved.game_state.currentRound).toBe(2); // Should take higher round number (more progress)
      expect(resolved.game_state.trumpSuit).toBe('Hearts'); // Local has trump suit, remote doesn't
      
      // Scores should be merged (higher values)
      expect(resolved.game_state.scores.team1).toBe(20); // max(20, 18)
      expect(resolved.game_state.scores.team2).toBe(22); // max(15, 22)

      // Player hands should be merged (prefer non-empty hands)
      expect(resolved.game_state.playerHands.player1).toEqual([{ suit: 'Hearts', rank: 'A' }]);
      expect(resolved.game_state.playerHands.player2).toEqual([{ suit: 'Spades', rank: 'K' }]);
      expect(resolved.game_state.playerHands.player3).toEqual([{ suit: 'Diamonds', rank: 'Q' }]);
    });

    it('should handle edge cases gracefully', () => {
      // Test with missing or null fields
      const localDoc = {
        user_id: 'user-edge',
        username: 'edge_user',
        total_games_played: null,
        total_games_won: undefined,
        updated_at: '2023-01-01T10:00:00Z'
      };

      const remoteDoc = {
        user_id: 'user-edge',
        username: 'edge_user_remote',
        total_games_played: 5,
        total_games_won: 3,
        email: 'edge@example.com',
        updated_at: '2023-01-01T11:00:00Z'
      };

      const resolved = conflictResolutionService.resolveUserConflict(localDoc, remoteDoc);

      // Should handle null/undefined values gracefully
      expect(resolved.total_games_played).toBe(5);
      expect(resolved.total_games_won).toBe(3);
      expect(resolved.email).toBe('edge@example.com');
      expect(resolved.username).toBe('edge_user_remote'); // Last write wins
    });
  });

  describe('Strategy Selection', () => {
    it('should use appropriate strategy based on document type', () => {
      const userDoc1 = { user_id: 'u1', username: 'user1', updated_at: '2023-01-01T10:00:00Z' };
      const userDoc2 = { user_id: 'u1', username: 'user2', updated_at: '2023-01-01T11:00:00Z' };

      const gameDoc1 = { game_id: 'g1', status: 'waiting', updated_at: '2023-01-01T10:00:00Z' };
      const gameDoc2 = { game_id: 'g1', status: 'in_progress', updated_at: '2023-01-01T11:00:00Z' };

      const roomDoc1 = { room_id: 'r1', version: 1, updated_at: '2023-01-01T10:00:00Z' };
      const roomDoc2 = { room_id: 'r1', version: 2, updated_at: '2023-01-01T11:00:00Z' };

      // Test different strategies
      const userResolved = conflictResolutionService.resolveConflict(userDoc1, userDoc2, 'user-data');
      const gameResolved = conflictResolutionService.resolveConflict(gameDoc1, gameDoc2, 'game-state');
      const roomResolved = conflictResolutionService.resolveConflict(roomDoc1, roomDoc2, 'room-state');

      expect(userResolved.username).toBe('user2'); // Last write wins for users
      expect(gameResolved.status).toBe('in_progress'); // More progressed state for games
      expect(roomResolved.version).toBe(3); // Version incremented for rooms
    });

    it('should fallback to last-write-wins for unknown strategies', () => {
      const doc1 = { id: '1', data: 'local', updated_at: '2023-01-01T10:00:00Z' };
      const doc2 = { id: '1', data: 'remote', updated_at: '2023-01-01T11:00:00Z' };

      const resolved = conflictResolutionService.resolveConflict(doc1, doc2, 'unknown-strategy');

      expect(resolved.data).toBe('remote'); // Should use last-write-wins fallback
    });
  });
});