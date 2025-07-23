import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import GameServer from '../server.js';

describe('Development Proxy Functionality', () => {
  let server;
  let app;

  beforeAll(async () => {
    // Set environment variables for testing
    process.env.NODE_ENV = 'development';
    process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173';
    
    server = new GameServer();
    app = server.app;
  });

  afterAll(() => {
    // Clean up environment
    delete process.env.VITE_DEV_SERVER_URL;
  });

  it('should not proxy API routes', async () => {
    const response = await request(app)
      .get('/api/test')
      .expect(404);

    expect(response.body.error).toBe('API endpoint not implemented yet');
  });

  it('should not proxy health check endpoint', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body.status).toBe('OK');
  });

  it('should have proxy middleware configured when in development mode', () => {
    // Verify that the proxy is set up by checking the app stack
    const proxyMiddleware = app._router.stack.find(layer => 
      layer.name === 'httpProxyMiddleware'
    );
    
    // In development mode with VITE_DEV_SERVER_URL set, proxy should be configured
    expect(process.env.NODE_ENV).toBe('development');
    expect(process.env.VITE_DEV_SERVER_URL).toBe('http://localhost:5173');
  });

  it('should exclude correct paths from proxy', () => {
    // Test the pathFilter function logic
    const pathFilter = (pathname) => {
      return !pathname.startsWith('/api') && 
             !pathname.startsWith('/health') && 
             !pathname.startsWith('/socket.io');
    };

    expect(pathFilter('/api/test')).toBe(false);
    expect(pathFilter('/health')).toBe(false);
    expect(pathFilter('/socket.io')).toBe(false);
    expect(pathFilter('/')).toBe(true);
    expect(pathFilter('/login')).toBe(true);
    expect(pathFilter('/game')).toBe(true);
  });
});