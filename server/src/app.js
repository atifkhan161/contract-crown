import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import authRoutes from './routes/auth.js';
import roomsRoutes from './routes/rooms.js';
import waitingRoomsRoutes from './routes/waiting-rooms.js';
import usersRoutes from './routes/users.js';
import gamesRoutes from './routes/games.js';
import testAuthRoutes from './routes/test-auth.js';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create and configure Express application
 * @param {Object} io - Socket.IO server instance
 * @param {Object} socketManager - Socket manager instance
 * @param {Object} connectionStatusManager - Connection status manager instance
 * @param {Object} periodicReconciliationService - Periodic reconciliation service instance
 * @param {Object} monitoringService - Monitoring service instance
 * @param {Object} diagnosticTools - Diagnostic tools instance
 * @param {Object} performanceMonitor - Performance monitor instance
 * @returns {Object} Configured Express app
 */
export function createApp(io, socketManager, connectionStatusManager, periodicReconciliationService, monitoringService, diagnosticTools, performanceMonitor) {
  const app = express();

  // Setup middleware
  setupMiddleware(app);
  
  // Setup routes with dependencies
  setupRoutes(app, io, socketManager, connectionStatusManager, periodicReconciliationService, monitoringService, diagnosticTools, performanceMonitor);
  
  // Setup error handling
  setupErrorHandling(app);

  return app;
}

function setupMiddleware(app) {
  // Compression middleware for production static assets
  if (process.env.NODE_ENV === 'production') {
    app.use(compression({
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
  app.use(helmet({
    contentSecurityPolicy: false, // Allow for development
    crossOriginEmbedderPolicy: false
  }));

  // CORS configuration - simplified since frontend and backend are on same origin
  app.use(cors({
    origin: true, // Allow same origin
    credentials: true
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // limit each IP to 100 requests per windowMs
    message: {
      error: 'Too many requests from this IP, please try again later.'
    }
  });
  app.use('/api/', limiter);

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging middleware
  app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path} - IP: ${req.ip}`);
    next();
  });
}

function setupRoutes(app, io, socketManager, connectionStatusManager, periodicReconciliationService, monitoringService, diagnosticTools, performanceMonitor) {
  // Make io instance available to routes
  app.use((req, res, next) => {
    req.io = io;
    next();
  });

  // Make socket manager and connection status available to routes
  app.use((req, res, next) => {
    req.socketManager = socketManager;
    req.connectionStatusManager = connectionStatusManager;
    req.periodicReconciliationService = periodicReconciliationService;
    req.monitoringService = monitoringService;
    req.diagnosticTools = diagnosticTools;
    req.performanceMonitor = performanceMonitor;
    next();
  });

  // Development mode proxy to Vite dev server
  if (process.env.NODE_ENV === 'development' && process.env.VITE_DEV_SERVER_URL) {
    console.log(`[Proxy] Setting up development proxy to ${process.env.VITE_DEV_SERVER_URL}`);
    console.log('[Proxy] Make sure Vite dev server is running on the configured port');
    
    // Proxy non-API requests to Vite dev server
    app.use('/', createProxyMiddleware({
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
        console.error('[Proxy] Error connecting to Vite dev server:', err.message);
        console.error('[Proxy] Make sure Vite dev server is running on', process.env.VITE_DEV_SERVER_URL);
        if (!res.headersSent) {
          res.status(500).json({
            error: 'Development proxy error',
            message: `Failed to connect to Vite dev server at ${process.env.VITE_DEV_SERVER_URL}. Make sure it's running.`,
            details: err.message
          });
        }
      },
      onProxyReq: (proxyReq, req) => {
        // Only log non-asset requests to reduce noise
        if (!req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)) {
          console.log(`[Proxy] ${req.method} ${req.path} -> ${process.env.VITE_DEV_SERVER_URL}${req.path}`);
        }
      },
      onProxyRes: (proxyRes, req, res) => {
        // Add headers to support HMR
        if (req.path.includes('/@vite/') || req.path.includes('/__vite_ping')) {
          proxyRes.headers['cache-control'] = 'no-cache';
        }
      }
    }));
  } else if (process.env.NODE_ENV === 'development') {
    console.log('[Proxy] Development mode detected but VITE_DEV_SERVER_URL not set');
    console.log('[Proxy] Set VITE_DEV_SERVER_URL=http://localhost:5173 in server/.env to enable development proxy');
  }

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // WebSocket status endpoint
  app.get('/api/websocket/status', (req, res) => {
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
  app.get('/api/websocket/detailed-status', (req, res) => {
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

  // Periodic reconciliation status endpoint
  app.get('/api/reconciliation/status', (req, res) => {
    try {
      const status = req.periodicReconciliationService ? 
        req.periodicReconciliationService.getStatus() : 
        { error: 'Periodic reconciliation service not available' };
      
      res.status(200).json({
        reconciliation: status,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[API] Reconciliation status error:', error);
      res.status(500).json({
        error: 'Failed to get reconciliation status',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Force reconciliation for a specific room
  app.post('/api/reconciliation/force/:gameId', async (req, res) => {
    try {
      const { gameId } = req.params;
      
      if (!req.periodicReconciliationService) {
        return res.status(503).json({
          error: 'Periodic reconciliation service not available',
          timestamp: new Date().toISOString()
        });
      }
      
      const result = await req.periodicReconciliationService.forceReconciliation(gameId);
      
      res.status(200).json({
        message: 'Reconciliation completed',
        gameId,
        result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[API] Force reconciliation error:', error);
      res.status(500).json({
        error: 'Failed to force reconciliation',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Update reconciliation configuration
  app.put('/api/reconciliation/config', (req, res) => {
    try {
      if (!req.periodicReconciliationService) {
        return res.status(503).json({
          error: 'Periodic reconciliation service not available',
          timestamp: new Date().toISOString()
        });
      }
      
      const config = req.body;
      req.periodicReconciliationService.updateConfig(config);
      
      res.status(200).json({
        message: 'Configuration updated',
        config,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[API] Update reconciliation config error:', error);
      res.status(500).json({
        error: 'Failed to update configuration',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Reset reconciliation statistics
  app.post('/api/reconciliation/reset-stats', (req, res) => {
    try {
      if (!req.periodicReconciliationService) {
        return res.status(503).json({
          error: 'Periodic reconciliation service not available',
          timestamp: new Date().toISOString()
        });
      }
      
      req.periodicReconciliationService.resetStats();
      
      res.status(200).json({
        message: 'Statistics reset successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[API] Reset reconciliation stats error:', error);
      res.status(500).json({
        error: 'Failed to reset statistics',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Monitoring API endpoints
  
  // Get comprehensive monitoring dashboard
  app.get('/api/monitoring/dashboard', (req, res) => {
    try {
      if (!req.monitoringService) {
        return res.status(503).json({
          error: 'Monitoring service not available',
          timestamp: new Date().toISOString()
        });
      }
      
      const dashboardData = req.monitoringService.getDashboardData();
      
      res.status(200).json({
        dashboard: dashboardData,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[API] Monitoring dashboard error:', error);
      res.status(500).json({
        error: 'Failed to get monitoring dashboard',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get monitoring metrics export
  app.get('/api/monitoring/metrics', (req, res) => {
    try {
      if (!req.monitoringService) {
        return res.status(503).json({
          error: 'Monitoring service not available',
          timestamp: new Date().toISOString()
        });
      }
      
      const metrics = req.monitoringService.exportMetrics();
      
      res.status(200).json({
        metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[API] Monitoring metrics error:', error);
      res.status(500).json({
        error: 'Failed to get monitoring metrics',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get room diagnostics
  app.get('/api/monitoring/room/:gameId/diagnostics', (req, res) => {
    try {
      const { gameId } = req.params;
      
      if (!req.monitoringService) {
        return res.status(503).json({
          error: 'Monitoring service not available',
          timestamp: new Date().toISOString()
        });
      }
      
      const roomDiagnostics = req.monitoringService.getRoomDiagnostics(gameId);
      
      res.status(200).json({
        gameId,
        diagnostics: roomDiagnostics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[API] Room diagnostics error:', error);
      res.status(500).json({
        error: 'Failed to get room diagnostics',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Reset monitoring metrics
  app.post('/api/monitoring/reset', (req, res) => {
    try {
      if (!req.monitoringService) {
        return res.status(503).json({
          error: 'Monitoring service not available',
          timestamp: new Date().toISOString()
        });
      }
      
      req.monitoringService.resetMetrics();
      
      res.status(200).json({
        message: 'Monitoring metrics reset successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[API] Reset monitoring metrics error:', error);
      res.status(500).json({
        error: 'Failed to reset monitoring metrics',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Diagnostic Tools API endpoints
  
  // Run comprehensive lobby diagnostics
  app.post('/api/diagnostics/lobby/:gameId', async (req, res) => {
    try {
      const { gameId } = req.params;
      
      if (!req.diagnosticTools) {
        return res.status(503).json({
          error: 'Diagnostic tools not available',
          timestamp: new Date().toISOString()
        });
      }
      
      const diagnostic = await req.diagnosticTools.runLobbyDiagnostics(gameId);
      
      res.status(200).json({
        diagnostic,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[API] Lobby diagnostics error:', error);
      res.status(500).json({
        error: 'Failed to run lobby diagnostics',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Run connection test for a user
  app.post('/api/diagnostics/connection/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      
      if (!req.diagnosticTools) {
        return res.status(503).json({
          error: 'Diagnostic tools not available',
          timestamp: new Date().toISOString()
        });
      }
      
      const diagnostic = await req.diagnosticTools.runConnectionTest(userId);
      
      res.status(200).json({
        diagnostic,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[API] Connection test error:', error);
      res.status(500).json({
        error: 'Failed to run connection test',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get diagnostic result by ID
  app.get('/api/diagnostics/result/:diagnosticId', (req, res) => {
    try {
      const { diagnosticId } = req.params;
      
      if (!req.diagnosticTools) {
        return res.status(503).json({
          error: 'Diagnostic tools not available',
          timestamp: new Date().toISOString()
        });
      }
      
      const result = req.diagnosticTools.getDiagnosticResult(diagnosticId);
      
      if (!result) {
        return res.status(404).json({
          error: 'Diagnostic result not found',
          diagnosticId,
          timestamp: new Date().toISOString()
        });
      }
      
      res.status(200).json({
        result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[API] Get diagnostic result error:', error);
      res.status(500).json({
        error: 'Failed to get diagnostic result',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get all diagnostic results
  app.get('/api/diagnostics/results', (req, res) => {
    try {
      if (!req.diagnosticTools) {
        return res.status(503).json({
          error: 'Diagnostic tools not available',
          timestamp: new Date().toISOString()
        });
      }
      
      const results = req.diagnosticTools.getAllDiagnosticResults();
      const summary = req.diagnosticTools.getDiagnosticSummary();
      
      res.status(200).json({
        results,
        summary,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[API] Get diagnostic results error:', error);
      res.status(500).json({
        error: 'Failed to get diagnostic results',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Performance Monitor API endpoints
  
  // Get performance summary
  app.get('/api/performance/summary', (req, res) => {
    try {
      if (!req.performanceMonitor) {
        return res.status(503).json({
          error: 'Performance monitor not available',
          timestamp: new Date().toISOString()
        });
      }
      
      const summary = req.performanceMonitor.getPerformanceSummary();
      
      res.status(200).json({
        performance: summary,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[API] Performance summary error:', error);
      res.status(500).json({
        error: 'Failed to get performance summary',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get room performance profile
  app.get('/api/performance/room/:gameId', (req, res) => {
    try {
      const { gameId } = req.params;
      
      if (!req.performanceMonitor) {
        return res.status(503).json({
          error: 'Performance monitor not available',
          timestamp: new Date().toISOString()
        });
      }
      
      const profile = req.performanceMonitor.getRoomProfile(gameId);
      
      if (!profile) {
        return res.status(404).json({
          error: 'Room performance profile not found',
          gameId,
          timestamp: new Date().toISOString()
        });
      }
      
      res.status(200).json({
        gameId,
        profile,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[API] Room performance profile error:', error);
      res.status(500).json({
        error: 'Failed to get room performance profile',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get user performance profile
  app.get('/api/performance/user/:userId', (req, res) => {
    try {
      const { userId } = req.params;
      
      if (!req.performanceMonitor) {
        return res.status(503).json({
          error: 'Performance monitor not available',
          timestamp: new Date().toISOString()
        });
      }
      
      const profile = req.performanceMonitor.getUserProfile(userId);
      
      if (!profile) {
        return res.status(404).json({
          error: 'User performance profile not found',
          userId,
          timestamp: new Date().toISOString()
        });
      }
      
      res.status(200).json({
        userId,
        profile,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[API] User performance profile error:', error);
      res.status(500).json({
        error: 'Failed to get user performance profile',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Export performance data
  app.get('/api/performance/export', (req, res) => {
    try {
      if (!req.performanceMonitor) {
        return res.status(503).json({
          error: 'Performance monitor not available',
          timestamp: new Date().toISOString()
        });
      }
      
      const performanceData = req.performanceMonitor.exportPerformanceData();
      
      res.status(200).json({
        export: performanceData,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[API] Performance export error:', error);
      res.status(500).json({
        error: 'Failed to export performance data',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Reset performance metrics
  app.post('/api/performance/reset', (req, res) => {
    try {
      if (!req.performanceMonitor) {
        return res.status(503).json({
          error: 'Performance monitor not available',
          timestamp: new Date().toISOString()
        });
      }
      
      req.performanceMonitor.resetMetrics();
      
      res.status(200).json({
        message: 'Performance metrics reset successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[API] Reset performance metrics error:', error);
      res.status(500).json({
        error: 'Failed to reset performance metrics',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Authentication routes
  app.use('/api/auth', authRoutes);
  
  // Test authentication routes (development only)
  if (process.env.NODE_ENV !== 'production') {
    app.use('/api/auth', testAuthRoutes);
  }
  
  // Rooms routes
  app.use('/api/rooms', roomsRoutes);
  
  // Waiting room routes
  app.use('/api/waiting-rooms', waitingRoomsRoutes);
  
  // Users routes
  app.use('/api/users', usersRoutes);
  
  // Games routes
  app.use('/api/games', gamesRoutes);

  // API routes placeholder for other endpoints
  app.use('/api', (req, res, next) => {
    res.status(404).json({
      error: 'API endpoint not implemented yet',
      path: req.path,
      method: req.method
    });
  });

  // Serve static files from client build output
  const staticPath = path.join(__dirname, '..', '..', 'client', 'dist');
  
  // Check if client/dist directory exists in production
  if (process.env.NODE_ENV === 'production' && !existsSync(staticPath)) {
    console.error('[Static Files] Production build directory not found at:', staticPath);
    console.error('[Static Files] Run "npm run build" from the client directory to create the production build');
  }
  
  // Configure static file serving with production optimizations
  app.use(express.static(staticPath, {
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
      const filename = path.basename(filePath);
      
      if (process.env.NODE_ENV === 'production') {
        // Security headers for all static files
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        
        // Cache hashed assets (JS, CSS with hash) for 1 year with immutable flag
        if (ext === '.js' || ext === '.css') {
          // Check if filename contains hash (Vite pattern: name-[hash].ext or name.[hash].ext)
          if (filename.match(/[\-\.][a-f0-9]{8,}\./)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else {
            // Non-hashed JS/CSS files get shorter cache with must-revalidate
            res.setHeader('Cache-Control', 'public, max-age=86400, must-revalidate'); // 1 day
          }
        }
        // Cache images and fonts for 30 days
        else if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot'].includes(ext)) {
          res.setHeader('Cache-Control', 'public, max-age=2592000'); // 30 days
        }
        // Cache manifest and service worker files for shorter duration
        else if (['.json', '.xml', '.txt'].includes(ext)) {
          if (filename === 'manifest.json' || filename.includes('sw.js') || filename.includes('service-worker')) {
            res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour for PWA files
          } else {
            res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day for other files
          }
        }
        // HTML files should not be cached to ensure updates are served
        else if (ext === '.html') {
          res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        }
      } else {
        // Development: no cache to ensure fresh content during development
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  }));
  
  // Handle client-side routing - serve index.html for non-API routes
  app.get('*', (req, res) => {
    // Don't serve index.html for API routes, health check, or socket.io
    if (req.path.startsWith('/api/') || req.path.startsWith('/health') || req.path.startsWith('/socket.io')) {
      return res.status(404).json({
        error: 'Endpoint not found',
        path: req.path
      });
    }
    
    const indexPath = path.join(staticPath, 'index.html');
    
    // Set appropriate headers for the SPA fallback
    res.setHeader('Content-Type', 'text/html');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
    
    res.sendFile(indexPath, (err) => {
      if (err) {
        console.error('[Static Files] Error serving index.html from:', indexPath, err);
        res.status(500).json({
          error: 'Failed to serve application',
          message: 'Client build files not found. Run "npm run build" from the client directory first.',
          path: indexPath
        });
      }
    });
  });
}

function setupErrorHandling(app) {
  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Cannot ${req.method} ${req.path}`,
      timestamp: new Date().toISOString()
    });
  });

  // Global error handler
  app.use((err, req, res, next) => {
    console.error('[Error]', err);

    // Don't leak error details in production
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    res.status(err.status || 500).json({
      error: err.message || 'Internal Server Error',
      ...(isDevelopment && { stack: err.stack }),
      timestamp: new Date().toISOString()
    });
  });
}

export default createApp;