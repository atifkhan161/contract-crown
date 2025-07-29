import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { authenticateSocket } from '../src/middlewares/socketAuth.js';
import auth from '../src/middlewares/auth.js';
import User from '../src/models/User.js';
import DatabaseInitializer from '../database/init.js';

describe('Enhanced Authentication Middleware', () => {
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
      username: `authtest_${timestamp}`,
      email: `authtest_${timestamp}@example.com`,
      password: 'password123'
    });

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
      { expiresIn: '-1h' }
    );

    invalidToken = 'invalid.token.here';
  });

  afterAll(async () => {
    delete process.env.JWT_SECRET;
  });

  describe('HTTP Authentication Middleware', () => {
    let mockReq, mockRes, mockNext;

    beforeEach(() => {
      mockReq = {
        header: (name) => null
      };
      mockRes = {
        status: (code) => ({
          json: (data) => ({ status: code, body: data })
        })
      };
      mockNext = () => {};
    });

    it('should authenticate valid token with database verification', async () => {
      mockReq.header = (name) => name === 'Authorization' ? `Bearer ${validToken}` : null;
      
      let nextCalled = false;
      mockNext = () => { nextCalled = true; };

      await auth(mockReq, mockRes, mockNext);

      expect(nextCalled).toBe(true);
      expect(mockReq.user).toBeDefined();
      expect(mockReq.user.userId).toBe(testUser.user_id);
      expect(mockReq.user.username).toBe(testUser.username);
      expect(mockReq.authContext).toBeDefined();
      expect(mockReq.authContext.tokenValid).toBe(true);
    });

    it('should reject request with no token', async () => {
      let response;
      mockRes.status = (code) => ({
        json: (data) => { response = { status: code, body: data }; }
      });

      await auth(mockReq, mockRes, mockNext);

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('NO_TOKEN');
      expect(response.body.message).toBe('No token provided, authorization denied');
    });

    it('should reject expired token', async () => {
      mockReq.header = (name) => name === 'Authorization' ? `Bearer ${expiredToken}` : null;
      
      let response;
      mockRes.status = (code) => ({
        json: (data) => { response = { status: code, body: data }; }
      });

      await auth(mockReq, mockRes, mockNext);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Token has expired');
    });

    it('should reject invalid token', async () => {
      mockReq.header = (name) => name === 'Authorization' ? `Bearer ${invalidToken}` : null;
      
      let response;
      mockRes.status = (code) => ({
        json: (data) => { response = { status: code, body: data }; }
      });

      await auth(mockReq, mockRes, mockNext);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Token is not valid');
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

      mockReq.header = (name) => name === 'Authorization' ? `Bearer ${tokenForNonExistentUser}` : null;
      
      let response;
      mockRes.status = (code) => ({
        json: (data) => { response = { status: code, body: data }; }
      });

      await auth(mockReq, mockRes, mockNext);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('User not found');
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

      mockReq.header = (name) => name === 'Authorization' ? `Bearer ${tokenWithUserId}` : null;
      
      let nextCalled = false;
      mockNext = () => { nextCalled = true; };

      await auth(mockReq, mockRes, mockNext);

      expect(nextCalled).toBe(true);
      expect(mockReq.user.userId).toBe(testUser.user_id);
    });

    it('should normalize numeric user ID to string', async () => {
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

      mockReq.header = (name) => name === 'Authorization' ? `Bearer ${tokenWithNumericId}` : null;
      
      let nextCalled = false;
      mockNext = () => { nextCalled = true; };

      await auth(mockReq, mockRes, mockNext);

      expect(nextCalled).toBe(true);
      expect(mockReq.user.userId).toBe('12345');
      expect(typeof mockReq.user.userId).toBe('string');

      // Restore original method
      User.findById = originalFindById;
    });
  });

  describe('WebSocket Authentication Middleware', () => {
    let mockSocket, mockNext;

    beforeEach(() => {
      mockSocket = {
        handshake: {
          auth: {},
          headers: {},
          query: {}
        }
      };
      mockNext = () => {};
    });

    it('should authenticate valid token with database verification', async () => {
      mockSocket.handshake.auth.token = validToken;
      
      let nextCalled = false;
      let error = null;
      mockNext = (err) => { 
        nextCalled = true; 
        error = err;
      };

      await authenticateSocket(mockSocket, mockNext);

      expect(nextCalled).toBe(true);
      expect(error).toBeNull();
      expect(mockSocket.userId).toBe(testUser.user_id);
      expect(mockSocket.username).toBe(testUser.username);
      expect(mockSocket.authContext).toBeDefined();
      expect(mockSocket.authContext.tokenValid).toBe(true);
    });

    it('should reject connection with no token', async () => {
      let error = null;
      mockNext = (err) => { error = err; };

      await authenticateSocket(mockSocket, mockNext);

      expect(error).toBeDefined();
      expect(error.message).toBe('Authentication token required');
      expect(error.data.code).toBe('NO_TOKEN');
    });

    it('should reject expired token', async () => {
      mockSocket.handshake.auth.token = expiredToken;
      
      let error = null;
      mockNext = (err) => { error = err; };

      await authenticateSocket(mockSocket, mockNext);

      expect(error).toBeDefined();
      expect(error.message).toBe('Token has expired');
    });

    it('should reject invalid token', async () => {
      mockSocket.handshake.auth.token = invalidToken;
      
      let error = null;
      mockNext = (err) => { error = err; };

      await authenticateSocket(mockSocket, mockNext);

      expect(error).toBeDefined();
      expect(error.message).toBe('Invalid token format');
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

      mockSocket.handshake.auth.token = tokenForNonExistentUser;
      
      let error = null;
      mockNext = (err) => { error = err; };

      await authenticateSocket(mockSocket, mockNext);

      expect(error).toBeDefined();
      expect(error.message).toBe('User not found in database');
    });

    it('should extract token from Authorization header', async () => {
      mockSocket.handshake.headers.authorization = `Bearer ${validToken}`;
      
      let nextCalled = false;
      let error = null;
      mockNext = (err) => { 
        nextCalled = true; 
        error = err;
      };

      await authenticateSocket(mockSocket, mockNext);

      expect(nextCalled).toBe(true);
      expect(error).toBeNull();
      expect(mockSocket.userId).toBe(testUser.user_id);
    });

    it('should extract token from query parameters', async () => {
      mockSocket.handshake.query.token = validToken;
      
      let nextCalled = false;
      let error = null;
      mockNext = (err) => { 
        nextCalled = true; 
        error = err;
      };

      await authenticateSocket(mockSocket, mockNext);

      expect(nextCalled).toBe(true);
      expect(error).toBeNull();
      expect(mockSocket.userId).toBe(testUser.user_id);
    });

    it('should prioritize auth token over header token', async () => {
      mockSocket.handshake.auth.token = validToken;
      mockSocket.handshake.headers.authorization = `Bearer ${invalidToken}`;
      
      let nextCalled = false;
      let error = null;
      mockNext = (err) => { 
        nextCalled = true; 
        error = err;
      };

      await authenticateSocket(mockSocket, mockNext);

      expect(nextCalled).toBe(true);
      expect(error).toBeNull();
      expect(mockSocket.userId).toBe(testUser.user_id);
    });

    it('should handle token with missing username', async () => {
      const tokenWithoutUsername = jwt.sign(
        { id: testUser.user_id },
        secret,
        { expiresIn: '1h' }
      );

      mockSocket.handshake.auth.token = tokenWithoutUsername;
      
      let error = null;
      mockNext = (err) => { error = err; };

      await authenticateSocket(mockSocket, mockNext);

      expect(error).toBeDefined();
      expect(error.message).toBe('Token missing required user information');
    });

    it('should validate user ID format', async () => {
      const tokenWithInvalidUserId = jwt.sign(
        {
          id: 'invalid@user#id',
          username: testUser.username,
          email: testUser.email
        },
        secret,
        { expiresIn: '1h' }
      );

      // Mock User.findById to accept the invalid ID for testing
      const originalFindById = User.findById;
      User.findById = async (id) => {
        if (id === 'invalid@user#id') {
          return testUser;
        }
        return originalFindById.call(User, id);
      };

      mockSocket.handshake.auth.token = tokenWithInvalidUserId;
      
      let error = null;
      mockNext = (err) => { error = err; };

      await authenticateSocket(mockSocket, mockNext);

      expect(error).toBeDefined();
      expect(error.message).toContain('Invalid user ID format');
      expect(error.data.code).toBe('INVALID_USER_ID_FORMAT');

      // Restore original method
      User.findById = originalFindById;
    });
  });

  describe('User ID Consistency Validation', () => {
    it('should handle consistent user IDs across token and request', async () => {
      const mockReq = {
        header: (name) => name === 'Authorization' ? `Bearer ${validToken}` : null,
        body: { userId: testUser.user_id }
      };
      const mockRes = {
        status: (code) => ({
          json: (data) => ({ status: code, body: data })
        })
      };
      
      let nextCalled = false;
      const mockNext = () => { nextCalled = true; };

      await auth(mockReq, mockRes, mockNext);

      expect(nextCalled).toBe(true);
      expect(mockReq.user.userId).toBe(testUser.user_id);
      
      // Verify consistency
      expect(mockReq.user.userId).toBe(mockReq.body.userId);
    });

    it('should normalize different user ID formats consistently', async () => {
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

      const mockReq = {
        header: (name) => name === 'Authorization' ? `Bearer ${tokenWithNumericId}` : null
      };
      const mockRes = {
        status: (code) => ({
          json: (data) => ({ status: code, body: data })
        })
      };
      
      let nextCalled = false;
      const mockNext = () => { nextCalled = true; };

      await auth(mockReq, mockRes, mockNext);

      expect(nextCalled).toBe(true);
      expect(mockReq.user.userId).toBe('12345');
      expect(typeof mockReq.user.userId).toBe('string');

      // Restore original method
      User.findById = originalFindById;
    });
  });
});