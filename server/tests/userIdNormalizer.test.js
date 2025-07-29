import { describe, it, expect } from 'vitest';
import UserIdNormalizer from '../src/utils/userIdNormalizer.js';

describe('UserIdNormalizer', () => {
  describe('normalizeFromToken', () => {
    it('should normalize id field from token', () => {
      const tokenData = { id: '123', username: 'test' };
      const result = UserIdNormalizer.normalizeFromToken(tokenData);
      expect(result).toBe('123');
    });

    it('should normalize user_id field from token', () => {
      const tokenData = { user_id: '456', username: 'test' };
      const result = UserIdNormalizer.normalizeFromToken(tokenData);
      expect(result).toBe('456');
    });

    it('should normalize userId field from token', () => {
      const tokenData = { userId: '789', username: 'test' };
      const result = UserIdNormalizer.normalizeFromToken(tokenData);
      expect(result).toBe('789');
    });

    it('should prefer id over other fields', () => {
      const tokenData = { id: '123', user_id: '456', userId: '789' };
      const result = UserIdNormalizer.normalizeFromToken(tokenData);
      expect(result).toBe('123');
    });

    it('should convert numeric IDs to strings', () => {
      const tokenData = { id: 12345 };
      const result = UserIdNormalizer.normalizeFromToken(tokenData);
      expect(result).toBe('12345');
      expect(typeof result).toBe('string');
    });

    it('should trim whitespace', () => {
      const tokenData = { id: '  123  ' };
      const result = UserIdNormalizer.normalizeFromToken(tokenData);
      expect(result).toBe('123');
    });

    it('should return null for invalid input', () => {
      expect(UserIdNormalizer.normalizeFromToken(null)).toBeNull();
      expect(UserIdNormalizer.normalizeFromToken(undefined)).toBeNull();
      expect(UserIdNormalizer.normalizeFromToken('string')).toBeNull();
      expect(UserIdNormalizer.normalizeFromToken(123)).toBeNull();
    });

    it('should return null when no user ID fields present', () => {
      const tokenData = { username: 'test', email: 'test@example.com' };
      const result = UserIdNormalizer.normalizeFromToken(tokenData);
      expect(result).toBeNull();
    });
  });

  describe('normalizeFromDatabase', () => {
    it('should normalize user_id field from database record', () => {
      const dbRecord = { user_id: '123', username: 'test' };
      const result = UserIdNormalizer.normalizeFromDatabase(dbRecord);
      expect(result).toBe('123');
    });

    it('should fallback to id field', () => {
      const dbRecord = { id: '456', username: 'test' };
      const result = UserIdNormalizer.normalizeFromDatabase(dbRecord);
      expect(result).toBe('456');
    });

    it('should fallback to userId field', () => {
      const dbRecord = { userId: '789', username: 'test' };
      const result = UserIdNormalizer.normalizeFromDatabase(dbRecord);
      expect(result).toBe('789');
    });

    it('should prefer user_id over other fields', () => {
      const dbRecord = { user_id: '123', id: '456', userId: '789' };
      const result = UserIdNormalizer.normalizeFromDatabase(dbRecord);
      expect(result).toBe('123');
    });

    it('should return null for invalid input', () => {
      expect(UserIdNormalizer.normalizeFromDatabase(null)).toBeNull();
      expect(UserIdNormalizer.normalizeFromDatabase(undefined)).toBeNull();
      expect(UserIdNormalizer.normalizeFromDatabase('string')).toBeNull();
    });
  });

  describe('normalizeFromRequest', () => {
    it('should normalize userId field from request', () => {
      const requestData = { userId: '123', action: 'test' };
      const result = UserIdNormalizer.normalizeFromRequest(requestData);
      expect(result).toBe('123');
    });

    it('should fallback to user_id field', () => {
      const requestData = { user_id: '456', action: 'test' };
      const result = UserIdNormalizer.normalizeFromRequest(requestData);
      expect(result).toBe('456');
    });

    it('should fallback to id field', () => {
      const requestData = { id: '789', action: 'test' };
      const result = UserIdNormalizer.normalizeFromRequest(requestData);
      expect(result).toBe('789');
    });

    it('should prefer userId over other fields', () => {
      const requestData = { userId: '123', user_id: '456', id: '789' };
      const result = UserIdNormalizer.normalizeFromRequest(requestData);
      expect(result).toBe('123');
    });
  });

  describe('normalizeFromSocket', () => {
    it('should normalize userId field from socket', () => {
      const socket = { userId: '123', socketId: 'socket123' };
      const result = UserIdNormalizer.normalizeFromSocket(socket);
      expect(result).toBe('123');
    });

    it('should fallback to user_id field', () => {
      const socket = { user_id: '456', socketId: 'socket123' };
      const result = UserIdNormalizer.normalizeFromSocket(socket);
      expect(result).toBe('456');
    });

    it('should fallback to id field', () => {
      const socket = { id: '789', socketId: 'socket123' };
      const result = UserIdNormalizer.normalizeFromSocket(socket);
      expect(result).toBe('789');
    });

    it('should prefer userId over other fields', () => {
      const socket = { userId: '123', user_id: '456', id: '789' };
      const result = UserIdNormalizer.normalizeFromSocket(socket);
      expect(result).toBe('123');
    });
  });

  describe('normalizeFromMultipleSources', () => {
    it('should return consistent user ID from multiple sources', () => {
      const sources = {
        token: { id: '123', username: 'test' },
        database: { user_id: '123', username: 'test' },
        request: { userId: '123', action: 'test' },
        socket: { userId: '123', socketId: 'socket123' }
      };

      const result = UserIdNormalizer.normalizeFromMultipleSources(sources);

      expect(result.userId).toBe('123');
      expect(result.isConsistent).toBe(true);
      expect(result.validationPassed).toBe(true);
      expect(result.hasMultipleSources).toBe(true);
    });

    it('should detect inconsistent user IDs', () => {
      const sources = {
        token: { id: '123', username: 'test' },
        database: { user_id: '456', username: 'test' },
        request: { userId: '789', action: 'test' }
      };

      const result = UserIdNormalizer.normalizeFromMultipleSources(sources);

      expect(result.userId).toBe('123'); // First available
      expect(result.isConsistent).toBe(false);
      expect(result.validationPassed).toBe(false);
      expect(result.hasMultipleSources).toBe(true);
    });

    it('should handle single source', () => {
      const sources = {
        token: { id: '123', username: 'test' }
      };

      const result = UserIdNormalizer.normalizeFromMultipleSources(sources);

      expect(result.userId).toBe('123');
      expect(result.isConsistent).toBe(true);
      expect(result.validationPassed).toBe(true);
      expect(result.hasMultipleSources).toBe(false);
    });

    it('should handle no sources', () => {
      const result = UserIdNormalizer.normalizeFromMultipleSources({});

      expect(result.userId).toBeNull();
      expect(result.isConsistent).toBe(true);
      expect(result.validationPassed).toBe(false);
      expect(result.hasMultipleSources).toBe(false);
    });

    it('should provide detailed source information', () => {
      const sources = {
        token: { id: '123', username: 'test' },
        database: { user_id: '456', username: 'test' }
      };

      const result = UserIdNormalizer.normalizeFromMultipleSources(sources);

      expect(result.sources.token).toBe('123');
      expect(result.sources.database).toBe('456');
      expect(result.sources.request).toBeNull();
      expect(result.sources.socket).toBeNull();
    });
  });

  describe('createNormalizedUserData', () => {
    it('should create normalized user data from token-like object', () => {
      const userData = {
        id: '123',
        username: 'testuser',
        email: 'test@example.com'
      };

      const result = UserIdNormalizer.createNormalizedUserData(userData);

      expect(result.userId).toBe('123');
      expect(result.username).toBe('testuser');
      expect(result.email).toBe('test@example.com');
      expect(result._original).toEqual(userData);
    });

    it('should create normalized user data from database-like object', () => {
      const userData = {
        user_id: '456',
        username: 'dbuser',
        email: 'db@example.com'
      };

      const result = UserIdNormalizer.createNormalizedUserData(userData);

      expect(result.userId).toBe('456');
      expect(result.username).toBe('dbuser');
      expect(result.email).toBe('db@example.com');
    });

    it('should handle alternative field names', () => {
      const userData = {
        userId: '789',
        user_name: 'altuser',
        user_email: 'alt@example.com'
      };

      const result = UserIdNormalizer.createNormalizedUserData(userData);

      expect(result.userId).toBe('789');
      expect(result.username).toBe('altuser');
      expect(result.email).toBe('alt@example.com');
    });

    it('should return null for invalid input', () => {
      expect(UserIdNormalizer.createNormalizedUserData(null)).toBeNull();
      expect(UserIdNormalizer.createNormalizedUserData(undefined)).toBeNull();
      expect(UserIdNormalizer.createNormalizedUserData('string')).toBeNull();
    });
  });

  describe('validateUserIdFormat', () => {
    it('should validate UUID format', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const result = UserIdNormalizer.validateUserIdFormat(uuid);

      expect(result.isValid).toBe(true);
      expect(result.normalizedId).toBe(uuid);
      expect(result.format).toBe('uuid');
    });

    it('should validate numeric format', () => {
      const numericId = '12345';
      const result = UserIdNormalizer.validateUserIdFormat(numericId);

      expect(result.isValid).toBe(true);
      expect(result.normalizedId).toBe(numericId);
      expect(result.format).toBe('numeric');
    });

    it('should validate alphanumeric format', () => {
      const alphanumericId = 'user123_test';
      const result = UserIdNormalizer.validateUserIdFormat(alphanumericId);

      expect(result.isValid).toBe(true);
      expect(result.normalizedId).toBe(alphanumericId);
      expect(result.format).toBe('alphanumeric');
    });

    it('should reject empty user ID', () => {
      const result = UserIdNormalizer.validateUserIdFormat('');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('User ID cannot be empty');
    });

    it('should reject null user ID', () => {
      const result = UserIdNormalizer.validateUserIdFormat(null);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('User ID is required');
    });

    it('should reject invalid format', () => {
      const invalidId = 'user@#$%';
      const result = UserIdNormalizer.validateUserIdFormat(invalidId);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('User ID format is invalid');
    });

    it('should trim whitespace before validation', () => {
      const result = UserIdNormalizer.validateUserIdFormat('  123  ');

      expect(result.isValid).toBe(true);
      expect(result.normalizedId).toBe('123');
    });
  });

  describe('compareUserIds', () => {
    it('should return true for identical user IDs', () => {
      const result = UserIdNormalizer.compareUserIds('123', '123');
      expect(result).toBe(true);
    });

    it('should return true for user IDs with different types', () => {
      const result = UserIdNormalizer.compareUserIds(123, '123');
      expect(result).toBe(true);
    });

    it('should return true after trimming whitespace', () => {
      const result = UserIdNormalizer.compareUserIds('  123  ', '123');
      expect(result).toBe(true);
    });

    it('should return false for different user IDs', () => {
      const result = UserIdNormalizer.compareUserIds('123', '456');
      expect(result).toBe(false);
    });

    it('should return false for null/undefined values', () => {
      expect(UserIdNormalizer.compareUserIds(null, '123')).toBe(false);
      expect(UserIdNormalizer.compareUserIds('123', null)).toBe(false);
      expect(UserIdNormalizer.compareUserIds(null, null)).toBe(false);
      expect(UserIdNormalizer.compareUserIds(undefined, '123')).toBe(false);
    });
  });

  describe('extractFromAuthContext', () => {
    it('should extract from Express req.user object', () => {
      const authContext = {
        user: { userId: '123', username: 'test' }
      };

      const result = UserIdNormalizer.extractFromAuthContext(authContext);
      expect(result).toBe('123');
    });

    it('should extract from Socket.IO socket object', () => {
      const authContext = {
        userId: '456',
        socketId: 'socket123'
      };

      const result = UserIdNormalizer.extractFromAuthContext(authContext);
      expect(result).toBe('456');
    });

    it('should extract from socket with handshake', () => {
      const authContext = {
        handshake: { auth: { userId: '789' } }
      };

      const result = UserIdNormalizer.extractFromAuthContext(authContext);
      expect(result).toBe('789');
    });

    it('should extract from direct user data', () => {
      const authContext = {
        userId: '999',
        username: 'direct'
      };

      const result = UserIdNormalizer.extractFromAuthContext(authContext);
      expect(result).toBe('999');
    });

    it('should return null for invalid context', () => {
      expect(UserIdNormalizer.extractFromAuthContext(null)).toBeNull();
      expect(UserIdNormalizer.extractFromAuthContext(undefined)).toBeNull();
      expect(UserIdNormalizer.extractFromAuthContext({})).toBeNull();
    });
  });
});