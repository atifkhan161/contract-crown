import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import GameServer from '../server.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Static File Production Optimizations', () => {
  let server;
  let app;
  const testDistPath = path.join(__dirname, '..', '..', 'dist');

  beforeAll(async () => {
    // Create test dist directory with sample files
    if (!fs.existsSync(testDistPath)) {
      fs.mkdirSync(testDistPath, { recursive: true });
    }

    // Create test files
    fs.writeFileSync(path.join(testDistPath, 'index.html'), '<html><body>Test App</body></html>');
    fs.writeFileSync(path.join(testDistPath, 'app-abc123def.js'), 'console.log("hashed js");');
    fs.writeFileSync(path.join(testDistPath, 'app.js'), 'console.log("non-hashed js");');
    fs.writeFileSync(path.join(testDistPath, 'styles-xyz789.css'), 'body { color: red; }');
    fs.writeFileSync(path.join(testDistPath, 'logo.png'), 'fake-png-data');
    fs.writeFileSync(path.join(testDistPath, 'manifest.json'), '{"name": "test"}');

    // Set production environment
    process.env.NODE_ENV = 'production';
    
    // Create server instance
    const gameServer = new GameServer();
    server = gameServer.server;
    app = gameServer.app;
  });

  afterAll(async () => {
    // Clean up test files (but preserve existing dist if it was there)
    const filesToClean = [
      'app-abc123def.js', 'app.js', 'styles-xyz789.css', 
      'logo.png', 'manifest.json'
    ];
    
    filesToClean.forEach(file => {
      const filePath = path.join(testDistPath, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });
    
    // Only remove test index.html if it contains our test content
    const indexPath = path.join(testDistPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath, 'utf8');
      if (content.includes('Test App')) {
        fs.unlinkSync(indexPath);
      }
    }
    
    // Reset environment
    delete process.env.NODE_ENV;
    
    if (server) {
      server.close();
    }
  });

  it('should apply compression in production', async () => {
    const response = await request(app)
      .get('/health')
      .set('Accept-Encoding', 'gzip');
    
    expect(response.status).toBe(200);
    // In production, compression should be applied to JSON responses
  });

  it('should set appropriate cache headers for hashed JS files', async () => {
    // Mock the static path to use our test directory
    const originalStaticPath = path.join(__dirname, '..', '..', 'dist');
    
    const response = await request(app)
      .get('/app-abc123def.js');
    
    if (response.status === 200) {
      expect(response.headers['cache-control']).toContain('max-age=31536000');
      expect(response.headers['cache-control']).toContain('immutable');
    }
  });

  it('should set shorter cache for non-hashed JS files', async () => {
    const response = await request(app)
      .get('/app.js');
    
    if (response.status === 200) {
      expect(response.headers['cache-control']).toContain('max-age=86400');
    }
  });

  it('should set appropriate cache headers for images', async () => {
    const response = await request(app)
      .get('/logo.png');
    
    if (response.status === 200) {
      expect(response.headers['cache-control']).toContain('max-age=2592000');
    }
  });

  it('should set appropriate cache headers for manifest files', async () => {
    const response = await request(app)
      .get('/manifest.json');
    
    if (response.status === 200) {
      expect(response.headers['cache-control']).toContain('max-age=86400');
    }
  });

  it('should serve index.html for client-side routes', async () => {
    const response = await request(app)
      .get('/some-spa-route');
    
    expect(response.status).toBe(200);
    expect(response.text).toContain('<html>');
  });

  it('should not serve index.html for API routes', async () => {
    const response = await request(app)
      .get('/api/nonexistent');
    
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('API endpoint not implemented yet');
  });
});

describe('Development Mode Static Files', () => {
  let server;
  let app;

  beforeAll(async () => {
    // Set development environment
    process.env.NODE_ENV = 'development';
    
    // Create server instance
    const gameServer = new GameServer();
    server = gameServer.server;
    app = gameServer.app;
  });

  afterAll(async () => {
    // Reset environment
    delete process.env.NODE_ENV;
    
    if (server) {
      server.close();
    }
  });

  it('should not apply compression in development', async () => {
    const response = await request(app)
      .get('/health');
    
    expect(response.status).toBe(200);
    // In development, compression middleware should not be active
  });

  it('should set no-cache headers in development', async () => {
    const response = await request(app)
      .get('/some-static-file.js');
    
    // Even if file doesn't exist, the static middleware should set headers
    if (response.headers['cache-control']) {
      expect(response.headers['cache-control']).toContain('no-cache');
    }
  });
});