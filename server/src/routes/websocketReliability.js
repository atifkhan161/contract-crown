/**
 * Websocket Reliability Monitoring and Diagnostics Routes
 * Provides endpoints for monitoring event delivery, reliability statistics,
 * and managing the reliability layer configuration.
 */

import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * Get websocket reliability statistics
 */
router.get('/stats', authenticateToken, (req, res) => {
    try {
        const reliableSocketManager = req.app.get('reliableSocketManager');
        
        if (!reliableSocketManager) {
            return res.status(503).json({
                error: 'Websocket reliability layer not available'
            });
        }

        const stats = reliableSocketManager.getReliabilityStats();
        
        // Calculate overall success rates
        const overallStats = {
            totalEvents: 0,
            totalDelivered: 0,
            totalFailed: 0,
            totalFallbackSuccess: 0,
            overallSuccessRate: 0
        };

        for (const eventStats of Object.values(stats.eventStats)) {
            overallStats.totalEvents += eventStats.attempted;
            overallStats.totalDelivered += eventStats.delivered;
            overallStats.totalFailed += eventStats.failed;
            overallStats.totalFallbackSuccess += eventStats.fallback_success;
        }

        if (overallStats.totalEvents > 0) {
            overallStats.overallSuccessRate = 
                ((overallStats.totalDelivered + overallStats.totalFallbackSuccess) / overallStats.totalEvents * 100).toFixed(2);
        }

        res.json({
            ...stats,
            overallStats,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[WebsocketReliability] Error getting stats:', error);
        res.status(500).json({
            error: 'Failed to get reliability statistics',
            message: error.message
        });
    }
});

/**
 * Get detailed event delivery statistics by event type
 */
router.get('/stats/:eventType', authenticateToken, (req, res) => {
    try {
        const { eventType } = req.params;
        const reliableSocketManager = req.app.get('reliableSocketManager');
        
        if (!reliableSocketManager) {
            return res.status(503).json({
                error: 'Websocket reliability layer not available'
            });
        }

        const stats = reliableSocketManager.getReliabilityStats();
        const eventStats = stats.eventStats[eventType];

        if (!eventStats) {
            return res.status(404).json({
                error: 'Event type not found',
                eventType,
                availableEventTypes: Object.keys(stats.eventStats)
            });
        }

        const successRate = eventStats.attempted > 0 ? 
            ((eventStats.delivered / eventStats.attempted) * 100).toFixed(2) : '0.00';
        
        const fallbackRate = eventStats.attempted > 0 ? 
            ((eventStats.fallback_success / eventStats.attempted) * 100).toFixed(2) : '0.00';

        res.json({
            eventType,
            stats: eventStats,
            successRate: `${successRate}%`,
            fallbackRate: `${fallbackRate}%`,
            isCritical: stats.criticalEvents.includes(eventType),
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[WebsocketReliability] Error getting event stats:', error);
        res.status(500).json({
            error: 'Failed to get event statistics',
            message: error.message
        });
    }
});

/**
 * Get current reliability configuration
 */
router.get('/config', authenticateToken, (req, res) => {
    try {
        const reliableSocketManager = req.app.get('reliableSocketManager');
        
        if (!reliableSocketManager) {
            return res.status(503).json({
                error: 'Websocket reliability layer not available'
            });
        }

        const stats = reliableSocketManager.getReliabilityStats();
        
        res.json({
            monitoringEnabled: stats.monitoringEnabled,
            criticalEvents: stats.criticalEvents,
            pendingEvents: stats.pendingEvents,
            retryConfig: {
                maxRetries: 3,
                baseDelay: 1000,
                maxDelay: 8000,
                backoffMultiplier: 2
            },
            httpFallbackEnabled: true,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[WebsocketReliability] Error getting config:', error);
        res.status(500).json({
            error: 'Failed to get reliability configuration',
            message: error.message
        });
    }
});

/**
 * Update reliability monitoring settings
 */
router.post('/config/monitoring', authenticateToken, (req, res) => {
    try {
        const { enabled } = req.body;
        const reliableSocketManager = req.app.get('reliableSocketManager');
        
        if (!reliableSocketManager) {
            return res.status(503).json({
                error: 'Websocket reliability layer not available'
            });
        }

        if (typeof enabled !== 'boolean') {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'enabled must be a boolean value'
            });
        }

        reliableSocketManager.setReliabilityMonitoring(enabled);

        res.json({
            message: `Reliability monitoring ${enabled ? 'enabled' : 'disabled'}`,
            monitoringEnabled: enabled,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[WebsocketReliability] Error updating monitoring config:', error);
        res.status(500).json({
            error: 'Failed to update monitoring configuration',
            message: error.message
        });
    }
});

/**
 * Add event type to critical events list
 */
router.post('/config/critical-events', authenticateToken, (req, res) => {
    try {
        const { eventType } = req.body;
        const reliableSocketManager = req.app.get('reliableSocketManager');
        
        if (!reliableSocketManager) {
            return res.status(503).json({
                error: 'Websocket reliability layer not available'
            });
        }

        if (!eventType || typeof eventType !== 'string') {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'eventType must be a non-empty string'
            });
        }

        reliableSocketManager.addCriticalEvent(eventType);

        const stats = reliableSocketManager.getReliabilityStats();

        res.json({
            message: `Added ${eventType} to critical events`,
            eventType,
            criticalEvents: stats.criticalEvents,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[WebsocketReliability] Error adding critical event:', error);
        res.status(500).json({
            error: 'Failed to add critical event',
            message: error.message
        });
    }
});

/**
 * Remove event type from critical events list
 */
router.delete('/config/critical-events/:eventType', authenticateToken, (req, res) => {
    try {
        const { eventType } = req.params;
        const reliableSocketManager = req.app.get('reliableSocketManager');
        
        if (!reliableSocketManager) {
            return res.status(503).json({
                error: 'Websocket reliability layer not available'
            });
        }

        reliableSocketManager.removeCriticalEvent(eventType);

        const stats = reliableSocketManager.getReliabilityStats();

        res.json({
            message: `Removed ${eventType} from critical events`,
            eventType,
            criticalEvents: stats.criticalEvents,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[WebsocketReliability] Error removing critical event:', error);
        res.status(500).json({
            error: 'Failed to remove critical event',
            message: error.message
        });
    }
});

/**
 * Force event delivery for testing purposes
 */
router.post('/test/force-delivery', authenticateToken, (req, res) => {
    try {
        const { target, eventType, eventData } = req.body;
        const reliableSocketManager = req.app.get('reliableSocketManager');
        
        if (!reliableSocketManager) {
            return res.status(503).json({
                error: 'Websocket reliability layer not available'
            });
        }

        if (!target || !eventType) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'target and eventType are required'
            });
        }

        // Force event delivery (no retries for testing)
        reliableSocketManager.forceEventDelivery(target, eventType, eventData || {})
            .then(success => {
                res.json({
                    message: 'Test event delivery completed',
                    success,
                    target,
                    eventType,
                    timestamp: new Date().toISOString()
                });
            })
            .catch(error => {
                res.status(500).json({
                    error: 'Test event delivery failed',
                    message: error.message,
                    target,
                    eventType,
                    timestamp: new Date().toISOString()
                });
            });

    } catch (error) {
        console.error('[WebsocketReliability] Error in force delivery test:', error);
        res.status(500).json({
            error: 'Failed to execute test event delivery',
            message: error.message
        });
    }
});

/**
 * Get health status of reliability layer
 */
router.get('/health', (req, res) => {
    try {
        const reliableSocketManager = req.app.get('reliableSocketManager');
        
        if (!reliableSocketManager) {
            return res.status(503).json({
                status: 'unhealthy',
                error: 'Websocket reliability layer not available',
                timestamp: new Date().toISOString()
            });
        }

        const stats = reliableSocketManager.getReliabilityStats();
        
        // Determine health based on recent performance
        let healthStatus = 'healthy';
        let healthScore = 100;
        const issues = [];

        // Check if monitoring is enabled
        if (!stats.monitoringEnabled) {
            issues.push('Monitoring is disabled');
            healthScore -= 20;
        }

        // Check for high failure rates
        for (const [eventType, eventStats] of Object.entries(stats.eventStats)) {
            if (eventStats.attempted > 0) {
                const failureRate = (eventStats.failed / eventStats.attempted) * 100;
                if (failureRate > 50) {
                    issues.push(`High failure rate for ${eventType}: ${failureRate.toFixed(2)}%`);
                    healthScore -= 30;
                }
            }
        }

        // Check for too many pending events
        if (stats.pendingEvents > 100) {
            issues.push(`High number of pending events: ${stats.pendingEvents}`);
            healthScore -= 25;
        }

        if (healthScore < 70) {
            healthStatus = 'degraded';
        }
        if (healthScore < 40) {
            healthStatus = 'unhealthy';
        }

        const httpStatus = healthStatus === 'healthy' ? 200 : 
                          healthStatus === 'degraded' ? 200 : 503;

        res.status(httpStatus).json({
            status: healthStatus,
            score: Math.max(0, healthScore),
            issues: issues.length > 0 ? issues : undefined,
            stats: {
                monitoringEnabled: stats.monitoringEnabled,
                pendingEvents: stats.pendingEvents,
                criticalEventsCount: stats.criticalEvents.length,
                eventTypesTracked: Object.keys(stats.eventStats).length
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[WebsocketReliability] Error checking health:', error);
        res.status(500).json({
            status: 'error',
            error: 'Failed to check reliability layer health',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Reset reliability statistics (for testing/debugging)
 */
router.post('/reset-stats', authenticateToken, (req, res) => {
    try {
        const reliableSocketManager = req.app.get('reliableSocketManager');
        
        if (!reliableSocketManager) {
            return res.status(503).json({
                error: 'Websocket reliability layer not available'
            });
        }

        // Note: This would require adding a reset method to the reliability layer
        // For now, we'll just return a message indicating the operation
        
        res.json({
            message: 'Statistics reset requested',
            note: 'Statistics will be cleared on next server restart',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[WebsocketReliability] Error resetting stats:', error);
        res.status(500).json({
            error: 'Failed to reset statistics',
            message: error.message
        });
    }
});

export default router;
