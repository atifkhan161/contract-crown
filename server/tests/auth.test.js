import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import GameServer from '../server.js';
import DatabaseInitializer from '../database/init.js';

describe('Authentication API', () => {
  let server;
  let app;

  beforeAll(async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';

    // Initialize database for testing
    const dbInitializer = new DatabaseInitializer();
    await dbInitializer.reset(); // Clean slate for tests

    // Create server instance without starting it
    const gameServer = new GameServer();
    app = gameServer.app;
    server = gameServer.server;
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        username: 'testuser123',
        email: 'test@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toHaveProperty('message', 'User registered successfully');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('username', userData.username);
      expect(response.body.user).toHaveProperty('email', userData.email);
      expect(response.body.user).not.toHaveProperty('password_hash');
    });

    it('should reject registration with invalid email', async () => {
      const userData = {
        username: 'testuser456',
        email: 'invalid-email',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Validation failed');
      expect(response.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'email',
            message: 'Please provide a valid email address'
          })
        ])
      );
    });

    it('should reject registration with short password', async () => {
      const userData = {
        username: 'testuser789',
        email: 'test2@example.com',
        password: '123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Validation failed');
      expect(response.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'password',
            message: 'Password must be at least 6 characters long'
          })
        ])
      );
    });

    it('should reject registration with invalid username', async () => {
      const userData = {
        username: 'ab', // too short
        email: 'test3@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Validation failed');
    });

    it('should reject duplicate email registration', async () => {
      const userData = {
        username: 'testuser999',
        email: 'test@example.com', // Same email as first test
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(409);

      expect(response.body).toHaveProperty('error', 'Email already registered');
      expect(response.body).toHaveProperty('field', 'email');
    });

    it('should reject duplicate username registration', async () => {
      const userData = {
        username: 'testuser123', // Same username as first test
        email: 'different@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(409);

      expect(response.body).toHaveProperty('error', 'Username already taken');
      expect(response.body).toHaveProperty('field', 'username');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login user with valid email and password', async () => {
      const loginData = {
        identifier: 'test@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Login successful');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('username', 'testuser123');
      expect(response.body.user).toHaveProperty('email', 'test@example.com');
      expect(response.body.user).not.toHaveProperty('password_hash');
      expect(response.body.user).toHaveProperty('last_login');
    });

    it('should login user with valid username and password', async () => {
      const loginData = {
        identifier: 'testuser123',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Login successful');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('username', 'testuser123');
      expect(response.body.user).toHaveProperty('email', 'test@example.com');
    });

    it('should reject login with invalid email', async () => {
      const loginData = {
        identifier: 'nonexistent@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Invalid credentials');
    });

    it('should reject login with invalid username', async () => {
      const loginData = {
        identifier: 'nonexistentuser',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Invalid credentials');
    });

    it('should reject login with wrong password', async () => {
      const loginData = {
        identifier: 'test@example.com',
        password: 'wrongpassword'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Invalid credentials');
    });

    it('should reject login with missing identifier', async () => {
      const loginData = {
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Validation failed');
      expect(response.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'identifier',
            message: 'Username or email is required'
          })
        ])
      );
    });

    it('should reject login with missing password', async () => {
      const loginData = {
        identifier: 'test@example.com'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Validation failed');
      expect(response.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'password',
            message: 'Password is required'
          })
        ])
      );
    });

    it('should reject login with empty identifier', async () => {
      const loginData = {
        identifier: '',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Validation failed');
    });

    it('should reject login with empty password', async () => {
      const loginData = {
        identifier: 'test@example.com',
        password: ''
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Validation failed');
    });
  });

  describe('GET /api/auth/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/auth/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'OK');
      expect(response.body).toHaveProperty('service', 'Authentication API');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
});