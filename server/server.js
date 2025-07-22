import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import DatabaseInitializer from './database/init.js';

// Load environment variables
dotenv.config();

class GameServer {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: process.env.CLIENT_URL || "http://localhost:5173",
        methods: ["GET", "POST"]
      }
    });
    this.port = process.env.PORT || 3000;
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketIO();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: false, // Allow for development
      crossOriginEmbedderPolicy: false
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
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
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // Authentication routes
    this.app.use('/api/auth', authRoutes);

    // API routes placeholder for other endpoints
    this.app.use('/api', (req, res, next) => {
      res.status(404).json({
        error: 'API endpoint not implemented yet',
        path: req.path,
        method: req.method
      });
    });

    // Serve static files in production
    if (process.env.NODE_ENV === 'production') {
      this.app.use(express.static('public'));
      
      // Handle client-side routing
      this.app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
      });
    }
  }

  setupSocketIO() {
    this.io.on('connection', (socket) => {
      console.log(`[WebSocket] Client connected: ${socket.id}`);

      socket.on('disconnect', (reason) => {
        console.log(`[WebSocket] Client disconnected: ${socket.id}, reason: ${reason}`);
      });

      // Placeholder for game-specific socket events
      socket.on('test', (data) => {
        console.log('[WebSocket] Test event received:', data);
        socket.emit('test-response', { message: 'Server received test event' });
      });
    });
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
        console.log(`[Server] Client URL: ${process.env.CLIENT_URL || 'http://localhost:5173'}`);
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