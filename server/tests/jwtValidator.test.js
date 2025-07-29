import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import JWTValidator from '../src/utils/jwtValidator.js';
import UserIdNormalizer from '../src/utils/userIdNormalizer.js';
import User from '../src/models/User.js';
import DatabaseInitializer from '../database/init.js';

describe('JWT Validator', () => {
  let jwtValidator;
  let testUser;
  let validToken;
  let expiredToken;
  let invalidToken;
  const secret = 'test-secret-key';

  beforeAll(async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = secret;

    // Initialize database for testing
    const dbInitializer = new DatabaseInitializer();
    await dbInitializer.reset();

    // Create test user with unique credentials
    const timestamp = Date.now();
    testUser = await User.create({
      username: `testuser_${timestamp}`,
      email: `test_${timestamp}@example.com`,
      password: 'password123'
    });

    // Create JWT validator instance
    jwtValidator = new JWTValidator();

    // Create test tokens
    validToken = jwt.sign(
      {
        id: testUser.user_id,
        username: testUser.username,
        email: testUser.email
      },
      secret,
      { expiresIn: '1h' }
    );

    expiredToken = jwt.sign(
      {
        id: testUser.user_id,
        username: testUser.username,
        email: testUser.email
      },
      secret,
      { expiresIn: '-1h' } // Already expired
    );

    invalidToken = 'invalid.token.here';
  });

  afterAll(async () => {
    // Clean up test environment
    delete process.env.JWT_SECRET;
  });

  describe('validateToken', () => {
    it('should validate a valid token with database verification', async () => {
      const result = await jwtValidator.validateToken(validToken);

      expect(result).toHaveProperty('userId', testUser.user_id);
      expect(result).toHaveProperty('username', testUser.username);
      expect(result).toHaveProperty('email', testUser.email);
    });

    it('should reject empty token', async () => {
      await expect(jwtValidator.validateToken('')).rejects.toThrow('Authentication token is required');
      await expect(jwtValidator.validateToken(null)).rejects.toThrow('Authentication token is required');
      await expect(jwtValidator.validateToken(undefined)).rejects.toThrow('Authentication token is required');
    });

    it('should reject expired token', async () => {
      await expect(jwtValidator.validateToken(expiredToken)).rejects.toThrow('Token has expired');
    });

    it('should reject invalid token format', async () => {
      await expect(jwtValidator.validateToken(invalidToken)).rejects.toThrow('Invalid token format');
    });

    it('should reject token with missing user information', async () => {
      const tokenWithoutUsername = jwt.sign(
        { id: testUser.user_id },
        secret,
        { expiresIn: '1h' }
      );

      await expect(jwtValidator.validateToken(tokenWithoutUsername)).rejects.toThrow('Token missing required user information');
    });

    it('should reject token for non-existent user', async () => {
      const tokenForNonExistentUser = jwt.sign(
        {
          id: 'non-existent-user-id',
          username: 'nonexistent',
          email: 'nonexistent@example.com'
        },
        secret,
        { expiresIn: '1h' }
      );

      await expect(jwtValidator.validateToken(tokenForNonExistentUser)).rejects.toThrow('User not found in database');
    });

    it('should handle token with user_id field instead of id', async () => {
      const tokenWithUserId = jwt.sign(
        {
          user_id: testUser.user_id,
          username: testUser.username,
          email: testUser.email
        },
        secret,
        { expiresIn: '1h' }
      );

      const result = await jwtValidator.validateToken(tokenWithUserId);
      expect(result).toHaveProperty('userId', testUser.user_id);
    });

    it('should normalize user ID to string', async () => {
      const tokenWithNumericId = jwt.sign(
        {
          id: 12345,
          username: testUser.username,
          email: testUser.email
        },
        secret,
        { expiresIn: '1h' }
      );

      // Mock User.findById to accept numeric ID
      const originalFindById = User.findById;
      User.findById = async (id) => {
        if (String(id) === '12345') {
          return testUser;
        }
        return originalFindById.call(User, id);
      };

      const result = await jwtValidator.validateToken(tokenWithNumericId);
      expect(result).toHaveProperty('userId', '12345');
      expect(typeof result.userId).toBe('string');

      // Restore original method
      User.findById = originalFindById;
    });
  });

  describe('validateUserExists', () => {
    it('should return true for existing user', async () => {
      const exists = await jwtValidator.validateUserExists(testUser.user_id);
      expect(exists).toBe(true);
    });

    it('should return false for non-existent user', async () => {
      const exists = await jwtValidator.validateUserExists('non-existent-id');
      expect(exists).toBe(false);
    });

    it('should handle database errors gracefully', async () => {
      // Mock User.findById to throw an error
      const originalFindById = User.findById;
      User.findById = async () => {
        throw new Error('Database connection failed');
      };

      const exists = await jwtValidator.validateUserExists(testUser.user_id);
      expect(exists).toBe(false);

      // Restore original method
      User.findById = originalFindById;
    });
  });

  describe('normalizeUserId', () => {
    it('should normalize id field', () => {
      const tokenData = { id: '123', username: 'test' };
      const result = jwtValidator.normalizeUserId(tokenData);
      expect(result).toBe('123');
    });

    it('should normalize user_id field', () => {
      const tokenData = { user_id: '456', username: 'test' };
      const result = jwtValidator.normalizeUserId(tokenData);
      expect(result).toBe('456');
    });

    it('should normalize userId field', () => {
      const tokenData = { userId: '789', username: 'test' };
      const result = jwtValidator.normalizeUserId(tokenData);
      expect(result).toBe('789');
    });

    it('should prefer id over other fields', () => {
      const tokenData = { id: '123', user_id: '456', userId: '789' };
      const result = jwtValidator.normalizeUserId(tokenData);
      expect(result).toBe('123');
    });

    it('should return null for missing user ID', () => {
      const tokenData = { username: 'test' };
      const result = jwtValidator.normalizeUserId(tokenData);
      expect(result).toBeNull();
    });

    it('should convert numeric IDs to strings', () => {
      const tokenData = { id: 12345 };
      const result = jwtValidator.normalizeUserId(tokenData);
      expect(result).toBe('12345');
      expect(typeof result).toBe('string');
    });
  });

  describe('validateWebsocketToken', () => {
    it('should validate token and add websocket error codes', async () => {
      const result = await jwtValidator.validateWebsocketToken(validToken);
      expect(result).toHaveProperty('userId', testUser.user_id);
    });

    it('should add NO_TOKEN error code for missing token', async () => {
      try {
        await jwtValidator.validateWebsocketToken(null);
      } catch (error) {
        expect(error.code).toBe('NO_TOKEN');
      }
    });

    it('should add TOKEN_EXPIRED error code for expired token', async () => {
      try {
        await jwtValidator.validateWebsocketToken(expiredToken);
      } catch (error) {
        expect(error.code).toBe('TOKEN_EXPIRED');
      }
    });

    it('should add USER_NOT_FOUND error code for non-existent user', async () => {
      const tokenForNonExistentUser = jwt.sign(
        { id: 'non-existent', username: 'test' },
        secret,
        { expiresIn: '1h' }
      );

      try {
        await jwtValidator.validateWebsocketToken(tokenForNonExistentUser);
      } catch (error) {
        expect(error.code).toBe('USER_NOT_FOUND');
      }
    });

    it('should add INVALID_TOKEN error code for invalid token', async () => {
      try {
        await jwtValidator.validateWebsocketToken(invalidToken);
      } catch (error) {
        expect(error.code).toBe('INVALID_TOKEN');
      }
    });
  });

  describe('validateHttpToken', () => {
    it('should validate token and add HTTP status codes', async () => {
      const result = await jwtValidator.validateHttpToken(validToken);
      expect(result).toHaveProperty('userId', testUser.user_id);
    });

    it('should add 401 status for missing token', async () => {
      try {
        await jwtValidator.validateHttpToken(null);
      } catch (error) {
        expect(error.status).toBe(401);
        expect(error.code).toBe('NO_TOKEN');
      }
    });

    it('should add 401 status for expired token', async () => {
      try {
        await jwtValidator.validateHttpToken(expiredToken);
      } catch (error) {
        expect(error.status).toBe(401);
        expect(error.code).toBe('TOKEN_EXPIRED');
      }
    });

    it('should add 500 status for unexpected errors', async () => {
      // Mock jwt.verify to throw unexpected error
      const originalVerify = jwt.verify;
      jwt.verify = () => {
        throw new Error('Unexpected error');
      };

      try {
        await jwtValidator.validateHttpToken(validToken);
      } catch (error) {
        expect(error.status).toBe(500);
        expect(error.code).toBe('AUTH_ERROR');
      }

      // Restore original method
      jwt.verify = originalVerify;
    });
  });

  describe('extractToken', () => {
    it('should extract token from Express Authorization header', () => {
      const req = {
        header: (name) => name === 'Authorization' ? 'Bearer test-token' : null
      };

      const token = jwtValidator.extractToken(req);
      expect(token).toBe('test-token');
    });

    it('should extract token from Socket.IO auth object', () => {
      const socket = {
        handshake: {
          auth: { token: 'socket-token' },
          headers: {},
          query: {}
        }
      };

      const token = jwtValidator.extractToken(socket);
      expect(token).toBe('socket-token');
    });

    it('should extract token from Socket.IO Authorization header', () => {
      const socket = {
        handshake: {
          auth: {},
          headers: { authorization: 'Bearer header-token' },
          query: {}
        }
      };

      const token = jwtValidator.extractToken(socket);
      expect(token).toBe('header-token');
    });

    it('should extract token from Socket.IO query parameters', () => {
      const socket = {
        handshake: {
          auth: {},
          headers: {},
          query: { token: 'query-token' }
        }
      };

      const token = jwtValidator.extractToken(socket);
      expect(token).toBe('query-token');
    });

    it('should return null when no token found', () => {
      const req = {
        header: () => null
      };

      const token = jwtValidator.extractToken(req);
      expect(token).toBeNull();
    });

    it('should prioritize auth object over headers in Socket.IO', () => {
      const socket = {
        handshake: {
          auth: { token: 'auth-token' },
          headers: { authorization: 'Bearer header-token' },
          query: { token: 'query-token' }
        }
      };

      const token = jwtValidator.extractToken(socket);
      expect(token).toBe('auth-token');
    });
  });

  describe('createAuthContext', () => {
    it('should create authentication context', () => {
      const validatedUser = {
        userId: '123',
        username: 'testuser',
        email: 'test@example.com'
      };

      const context = jwtValidator.createAuthContext(validatedUser);

      expect(context).toHaveProperty('userId', '123');
      expect(context).toHaveProperty('username', 'testuser');
      expect(context).toHaveProperty('email', 'test@example.com');
      expect(context).toHaveProperty('tokenValid', true);
      expect(context).toHaveProperty('databaseUserExists', true);
      expect(context).toHaveProperty('lastValidated');
      expect(new Date(context.lastValidated)).toBeInstanceOf(Date);
    });
  });

  describe('validateUserIdConsistency', () => {
    it('should return true for matching user IDs', () => {
      const result = jwtValidator.validateUserIdConsistency('123', '123');
      expect(result).toBe(true);
    });

    it('should return true for matching user IDs with different types', () => {
      const result = jwtValidator.validateUserIdConsistency(123, '123');
      expect(result).toBe(true);
    });

    it('should return false for different user IDs', () => {
      const result = jwtValidator.validateUserIdConsistency('123', '456');
      expect(result).toBe(false);
    });

    it('should return false for missing user IDs', () => {
      expect(jwtValidator.validateUserIdConsistency(null, '123')).toBe(false);
      expect(jwtValidator.validateUserIdConsistency('123', null)).toBe(false);
      expect(jwtValidator.validateUserIdConsistency(null, null)).toBe(false);
    });
  });
});