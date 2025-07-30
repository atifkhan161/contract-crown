import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import createApp from './app.js';
import DatabaseInitializer from '../database/init.js';
import SocketManager from '../websocket/socketManager.js';
import ConnectionStatusManager from '../websocket/connectionStatus.js';
import PeriodicStateReconciliationService from './services/PeriodicStateReconciliationService.js';
import MonitoringService from './services/MonitoringService.js';
import DiagnosticTools from './services/DiagnosticTools.js';
import PerformanceMonitor from './services/PerformanceMonitor.js';

// Load environment variables
dotenv.config();

class GameServer {
  constructor() {
    this.port = process.env.PORT || 3030;
    
    // Initialize Socket.IO server first
    this.setupSocketIO();
    
    // Create Express app with dependencies
    this.app = createApp(this.io, this.socketManager, this.connectionStatusManager, this.periodicReconciliationService, this.monitoringService, this.diagnosticTools, this.performanceMonitor);
    
    // Create HTTP server with Express app
    this.server = createServer(this.app);
    
    // Attach Socket.IO to HTTP server
    this.io.attach(this.server);
    
    // Setup process error handling
    this.setupProcessErrorHandling();
  }

  setupSocketIO() {
    // Create Socket.IO server instance
    this.io = new Server({
      cors: {
        origin: true,
        credentials: true
      },
      transports: ['websocket', 'polling']
    });
    
    // Initialize the Socket Manager with enhanced functionality
    this.socketManager = new SocketManager(this.io);
    
    // Initialize Connection Status Manager
    this.connectionStatusManager = new ConnectionStatusManager(this.socketManager);
    
    // Initialize Periodic State Reconciliation Service
    this.periodicReconciliationService = new PeriodicStateReconciliationService(this.socketManager);
    
    // Initialize Monitoring Services
    this.monitoringService = new MonitoringService(this.socketManager, this.connectionStatusManager, this.periodicReconciliationService);
    this.diagnosticTools = new DiagnosticTools(this.socketManager, this.connectionStatusManager, this.monitoringService);
    this.performanceMonitor = new PerformanceMonitor(this.socketManager);
    
    console.log('[WebSocket] Enhanced Socket.IO setup complete with authentication and room management');
  }

  setupProcessErrorHandling() {
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
        
        // Start periodic reconciliation service
        this.periodicReconciliationService.start();
        console.log('[Server] Periodic state reconciliation service started');
        
        // Start monitoring services
        this.monitoringService.start();
        this.performanceMonitor.start();
        console.log('[Server] Monitoring and performance services started');
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