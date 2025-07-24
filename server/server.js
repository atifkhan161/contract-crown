import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createProxyMiddleware } from 'http-proxy-middleware';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import authRoutes from './routes/auth.js';
import roomsRoutes from './routes/rooms.js';
import usersRoutes from './routes/users.js';
import DatabaseInitializer from './database/init.js';
import SocketManager from './websocket/socketManager.js';
import ConnectionStatusManager from './websocket/connectionStatus.js';

// Load environment variables
dotenv.config();

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class GameServer {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: true,
        credentials: true
      },
      transports: ['websocket', 'polling']
    });
    this.port = process.env.PORT || 3030;
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketIO();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    // Compression middleware for production static assets
    if (process.env.NODE_ENV === 'production') {
      this.app.use(compression({
        filter: (req, res) => {
          // Don't compress responses with this request header
          if (req.headers['x-no-compression']) {
            return false;
          }
          // Use compression filter function
          return compression.filter(req, res);
        },
        level: 6, // Compression level (1-9, 6 is default)
        threshold: 1024, // Only compress responses larger than 1KB
      }));
    }

    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: false, // Allow for development
      crossOriginEmbedderPolicy: false
    }));

    // CORS configuration - simplified since frontend and backend are on same origin
    this.app.use(cors({
      origin: true, // Allow same origin
      credentials: true
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: {
        error: 'Too many requests from this IP, please try again later.'
      }
    });
    this.app.use('/api/', limiter);

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging middleware
    this.app.use((req, res, next) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] ${req.method} ${req.path} - IP: ${req.ip}`);
      next();
    });
  }

  setupRoutes() {
    // Make io instance available to routes
    this.app.use((req, res, next) => {
      req.io = this.io;
      next();
    });

    // Development mode proxy to Vite dev server
    if (process.env.NODE_ENV === 'development' && process.env.VITE_DEV_SERVER_URL) {
      console.log(`[Proxy] Setting up development proxy to ${process.env.VITE_DEV_SERVER_URL}`);
      
      // Proxy non-API requests to Vite dev server
      this.app.use('/', createProxyMiddleware({
        target: process.env.VITE_DEV_SERVER_URL,
        changeOrigin: true,
        ws: true, // Enable WebSocket proxying for HMR
        pathFilter: (pathname) => {
          // Don't proxy API routes, health check, or socket.io
          return !pathname.startsWith('/api') && 
                 !pathname.startsWith('/health') && 
                 !pathname.startsWith('/socket.io');
        },
        onError: (err, req, res) => {
          console.error('[Proxy] Error:', err.message);
          res.status(500).json({
            error: 'Proxy error',
            message: 'Failed to proxy request to Vite dev server'
          });
        },
        onProxyReq: (proxyReq, req) => {
          console.log(`[Proxy] ${req.method} ${req.path} -> ${process.env.VITE_DEV_SERVER_URL}${req.path}`);
        }
      }));
    }

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // WebSocket status endpoint
    this.app.get('/api/websocket/status', (req, res) => {
      try {
        const stats = req.connectionStatusManager ? 
          req.connectionStatusManager.getPublicStats() : 
          { error: 'Connection status manager not available' };
        
        res.status(200).json({
          websocket: {
            enabled: true,
            ...stats
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('[API] WebSocket status error:', error);
        res.status(500).json({
          error: 'Failed to get WebSocket status',
          timestamp: new Date().toISOString()
        });
      }
    });

    // WebSocket detailed status endpoint (for admin/monitoring)
    this.app.get('/api/websocket/detailed-status', (req, res) => {
      try {
        const stats = req.connectionStatusManager ? 
          req.connectionStatusManager.getDetailedStats() : 
          { error: 'Connection status manager not available' };
        
        res.status(200).json({
          websocket: {
            enabled: true,
            ...stats
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('[API] WebSocket detailed status error:', error);
        res.status(500).json({
          error: 'Failed to get detailed WebSocket status',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Authentication routes
    this.app.use('/api/auth', authRoutes);
    
    // Rooms routes
    this.app.use('/api/rooms', roomsRoutes);
    
    // Users routes
    this.app.use('/api/users', usersRoutes);

    // API routes placeholder for other endpoints
    this.app.use('/api', (req, res, next) => {
      res.status(404).json({
        error: 'API endpoint not implemented yet',
        path: req.path,
        method: req.method
      });
    });

    // Serve static files from Vite build output
    const staticPath = path.join(__dirname, '..', 'dist');
    
    // Check if dist directory exists in production
    if (process.env.NODE_ENV === 'production' && !existsSync(staticPath)) {
      console.error('[Static Files] Production build directory not found at:', staticPath);
      console.error('[Static Files] Run "npm run build" to create the production build');
    }
    
    // Configure static file serving with production optimizations
    this.app.use(express.static(staticPath, {
      // Cache static assets for 1 year in production, no cache in development
      maxAge: process.env.NODE_ENV === 'production' ? '365d' : 0,
      // Enable ETag generation for cache validation
      etag: true,
      // Enable Last-Modified header
      lastModified: true,
      // Set immutable cache for hashed assets in production
      immutable: process.env.NODE_ENV === 'production',
      // Custom cache control for different file types
      setHeaders: (res, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        
        if (process.env.NODE_ENV === 'production') {
          // Cache hashed assets (JS, CSS with hash) for 1 year
          if (ext === '.js' || ext === '.css') {
            const filename = path.basename(filePath);
            // Check if filename contains hash (common pattern: name-[hash].ext)
            if (filename.match(/\-[a-f0-9]{8,}\./)) {
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            } else {
              // Non-hashed JS/CSS files get shorter cache
              res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
            }
          }
          // Cache images and fonts for 30 days
          else if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot'].includes(ext)) {
            res.setHeader('Cache-Control', 'public, max-age=2592000'); // 30 days
          }
          // Cache manifest and other files for 1 day
          else if (['.json', '.xml', '.txt'].includes(ext)) {
            res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
          }
        } else {
          // Development: no cache
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      }
    }));
    
    // Handle client-side routing - serve index.html for non-API routes
    this.app.get('*', (req, res) => {
      // Don't serve index.html for API routes
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({
          error: 'API endpoint not found',
          path: req.path
        });
      }
      
      res.sendFile(path.join(staticPath, 'index.html'), (err) => {
        if (err) {
          console.error('Error serving index.html:', err);
          res.status(500).json({
            error: 'Failed to serve application',
            message: 'Build files not found. Run "npm run build" first.'
          });
        }
      });
    });
  }

  setupSocketIO() {
    // Initialize the Socket Manager with enhanced functionality
    this.socketManager = new SocketManager(this.io);
    
    // Initialize Connection Status Manager
    this.connectionStatusManager = new ConnectionStatusManager(this.socketManager);
    
    // Make socket manager and connection status available to routes
    this.app.use((req, res, next) => {
      req.socketManager = this.socketManager;
      req.connectionStatusManager = this.connectionStatusManager;
      next();
    });
    
    console.log('[WebSocket] Enhanced Socket.IO setup complete with authentication and room management');
  }

  setupErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Cannot ${req.method} ${req.path}`,
        timestamp: new Date().toISOString()
      });
    });

    // Global error handler
    this.app.use((err, req, res, next) => {
      console.error('[Error]', err);

      // Don't leak error details in production
      const isDevelopment = process.env.NODE_ENV !== 'production';
      
      res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
        ...(isDevelopment && { stack: err.stack }),
        timestamp: new Date().toISOString()
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (err) => {
      console.error('[Uncaught Exception]', err);
      if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
      }
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('[Unhandled Rejection] at:', promise, 'reason:', reason);
      if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
      }
    });
  }

  async start() {
    try {
      // Initialize database
      const dbInitializer = new DatabaseInitializer();
      await dbInitializer.initialize();
      
      this.server.listen(this.port, () => {
        console.log(`[Server] Contract Crown server running on port ${this.port}`);
        console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
      });
    } catch (error) {
      console.error('[Server] Failed to start server:', error.message);
      process.exit(1);
    }
  }
}

// Start the server only if not in test environment
if (process.env.NODE_ENV !== 'test') {
  const gameServer = new GameServer();
  await gameServer.start();
}

export default GameServer;