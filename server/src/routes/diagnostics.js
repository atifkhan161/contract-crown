/**
 * Diagnostics Routes
 * Provides endpoints for monitoring connection health and system diagnostics
 */

import express from 'express';

const router = express.Router();

/**
 * Get connection diagnostics report
 */
router.get('/connections', (req, res) => {
  try {
    // Get the socket manager from the app context
    const socketManager = req.app.get('socketManager');
    
    if (!socketManager || !socketManager.connectionDiagnostics) {
      return res.status(503).json({
        error: 'Connection diagnostics not available',
        message: 'Socket manager or diagnostics not initialized'
      });
    }

    const report = socketManager.connectionDiagnostics.generateReport();
    
    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('[Diagnostics] Error generating connection report:', error);
    res.status(500).json({
      error: 'Failed to generate diagnostics report',
      message: error.message
    });
  }
});

/**
 * Get connection statistics for a specific user
 */
router.get('/connections/user/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const socketManager = req.app.get('socketManager');
    
    if (!socketManager || !socketManager.connectionDiagnostics) {
      return res.status(503).json({
        error: 'Connection diagnostics not available'
      });
    }

    const userStats = socketManager.connectionDiagnostics.getUserConnectionStats(userId);
    
    if (!userStats) {
      return res.status(404).json({
        error: 'User connection not found',
        userId
      });
    }

    res.json({
      success: true,
      data: userStats
    });
  } catch (error) {
    console.error('[Diagnostics] Error getting user connection stats:', error);
    res.status(500).json({
      error: 'Failed to get user connection statistics',
      message: error.message
    });
  }
});

/**
 * Force a connection health check
 */
router.post('/connections/health-check', (req, res) => {
  try {
    const socketManager = req.app.get('socketManager');
    
    if (!socketManager || !socketManager.connectionDiagnostics) {
      return res.status(503).json({
        error: 'Connection diagnostics not available'
      });
    }

    socketManager.connectionDiagnostics.forceHealthCheck();
    
    res.json({
      success: true,
      message: 'Health check initiated'
    });
  } catch (error) {
    console.error('[Diagnostics] Error forcing health check:', error);
    res.status(500).json({
      error: 'Failed to initiate health check',
      message: error.message
    });
  }
});

/**
 * Get basic server health status
 */
router.get('/health', (req, res) => {
  try {
    const socketManager = req.app.get('socketManager');
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      connections: {
        active: 0,
        total: 0
      }
    };

    if (socketManager && socketManager.connectionStatusManager) {
      const stats = socketManager.connectionStatusManager.getPublicStats();
      health.connections = {
        active: stats.activeConnections,
        total: socketManager.connectionStatusManager.connectionStats.totalConnections
      };
    }

    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    console.error('[Diagnostics] Error getting health status:', error);
    res.status(500).json({
      error: 'Failed to get health status',
      message: error.message
    });
  }
});

export default router;
