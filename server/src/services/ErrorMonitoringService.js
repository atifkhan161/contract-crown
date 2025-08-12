import MigrationErrorHandler from './MigrationErrorHandler.js';
import RxDBErrorHandler from './RxDBErrorHandler.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Error Monitoring Service
 * Provides comprehensive monitoring and alerting for both migration and runtime errors
 */
class ErrorMonitoringService {
    constructor() {
        this.migrationErrorHandler = new MigrationErrorHandler();
        this.rxdbErrorHandler = new RxDBErrorHandler();
        this.logPath = path.join(process.cwd(), 'server', 'data', 'logs');
        
        // Monitoring configuration
        this.monitoringConfig = {
            checkInterval: 60000, // 1 minute
            alertCooldown: 300000, // 5 minutes
            criticalErrorThreshold: 5,
            errorRateThreshold: 10, // errors per minute
            storageFailureThreshold: 3
        };
        
        // Alert state tracking
        this.alertState = {
            lastAlertTime: {},
            activeAlerts: new Set(),
            alertHistory: []
        };
        
        // Monitoring intervals
        this.monitoringInterval = null;
        this.isMonitoring = false;
        
        this.ensureLogDirectory();
    }

    /**
     * Ensure log directory exists
     */
    async ensureLogDirectory() {
        try {
            await fs.access(this.logPath);
        } catch (error) {
            await fs.mkdir(this.logPath, { recursive: true });
        }
    }

    /**
     * Start error monitoring
     * @param {Object} config - Optional monitoring configuration
     */
    async startMonitoring(config = {}) {
        try {
            if (this.isMonitoring) {
                console.log('[Error Monitoring] Monitoring is already running');
                return;
            }

            // Merge configuration
            this.monitoringConfig = { ...this.monitoringConfig, ...config };
            
            console.log('[Error Monitoring] Starting error monitoring service...');
            console.log(`[Error Monitoring] Check interval: ${this.monitoringConfig.checkInterval}ms`);
            
            this.isMonitoring = true;
            
            // Start monitoring interval
            this.monitoringInterval = setInterval(
                () => this.performMonitoringCheck(),
                this.monitoringConfig.checkInterval
            );
            
            // Perform initial check
            await this.performMonitoringCheck();
            
            console.log('[Error Monitoring] Error monitoring service started successfully');
            
        } catch (error) {
            console.error('[Error Monitoring] Error starting monitoring service:', error.message);
            throw error;
        }
    }

    /**
     * Stop error monitoring
     */
    async stopMonitoring() {
        try {
            if (!this.isMonitoring) {
                console.log('[Error Monitoring] Monitoring is not running');
                return;
            }

            console.log('[Error Monitoring] Stopping error monitoring service...');
            
            this.isMonitoring = false;
            
            if (this.monitoringInterval) {
                clearInterval(this.monitoringInterval);
                this.monitoringInterval = null;
            }
            
            console.log('[Error Monitoring] Error monitoring service stopped');
            
        } catch (error) {
            console.error('[Error Monitoring] Error stopping monitoring service:', error.message);
            throw error;
        }
    }

    /**
     * Perform monitoring check
     */
    async performMonitoringCheck() {
        try {
            const checkTimestamp = new Date().toISOString();
            
            // Get current error statistics
            const migrationStats = await this.getMigrationErrorStats();
            const runtimeStats = await this.getRuntimeErrorStats();
            
            // Check for alert conditions
            const alerts = await this.checkAlertConditions(migrationStats, runtimeStats);
            
            // Process alerts
            if (alerts.length > 0) {
                await this.processAlerts(alerts, checkTimestamp);
            }
            
            // Log monitoring check
            await this.logMonitoringCheck({
                timestamp: checkTimestamp,
                migrationStats,
                runtimeStats,
                alerts: alerts.length,
                activeAlerts: Array.from(this.alertState.activeAlerts)
            });
            
            // Reset error counts for rate calculations
            this.rxdbErrorHandler.resetErrorCounts();
            
        } catch (error) {
            console.error('[Error Monitoring] Error during monitoring check:', error.message);
        }
    }

    /**
     * Get migration error statistics
     * @returns {Promise<Object>} Migration error statistics
     */
    async getMigrationErrorStats() {
        try {
            return await this.migrationErrorHandler.getErrorStatistics();
        } catch (error) {
            console.warn('[Error Monitoring] Error getting migration stats:', error.message);
            return { totalErrors: 0, message: 'Stats unavailable' };
        }
    }

    /**
     * Get runtime error statistics
     * @returns {Promise<Object>} Runtime error statistics
     */
    async getRuntimeErrorStats() {
        try {
            return await this.rxdbErrorHandler.getRuntimeErrorStatistics();
        } catch (error) {
            console.warn('[Error Monitoring] Error getting runtime stats:', error.message);
            return { totalErrors: 0, message: 'Stats unavailable' };
        }
    }

    /**
     * Check for alert conditions
     * @param {Object} migrationStats - Migration error statistics
     * @param {Object} runtimeStats - Runtime error statistics
     * @returns {Promise<Array>} Array of alerts
     */
    async checkAlertConditions(migrationStats, runtimeStats) {
        const alerts = [];
        const now = Date.now();
        
        // Check critical migration errors
        if (migrationStats.errorsBySeverity?.CRITICAL > 0) {
            alerts.push({
                type: 'critical_migration_errors',
                severity: 'CRITICAL',
                message: `${migrationStats.errorsBySeverity.CRITICAL} critical migration errors detected`,
                count: migrationStats.errorsBySeverity.CRITICAL,
                category: 'migration'
            });
        }
        
        // Check high migration error rate
        if (migrationStats.totalErrors > this.monitoringConfig.criticalErrorThreshold) {
            alerts.push({
                type: 'high_migration_error_rate',
                severity: 'HIGH',
                message: `High migration error rate: ${migrationStats.totalErrors} errors`,
                count: migrationStats.totalErrors,
                category: 'migration'
            });
        }
        
        // Check critical runtime errors
        if (runtimeStats.errorsBySeverity?.CRITICAL > 0) {
            alerts.push({
                type: 'critical_runtime_errors',
                severity: 'CRITICAL',
                message: `${runtimeStats.errorsBySeverity.CRITICAL} critical runtime errors detected`,
                count: runtimeStats.errorsBySeverity.CRITICAL,
                category: 'runtime'
            });
        }
        
        // Check storage failures
        if (runtimeStats.errorsByType?.storage > this.monitoringConfig.storageFailureThreshold) {
            alerts.push({
                type: 'storage_failures',
                severity: 'HIGH',
                message: `Multiple storage failures: ${runtimeStats.errorsByType.storage} failures`,
                count: runtimeStats.errorsByType.storage,
                category: 'storage'
            });
        }
        
        // Check graceful degradation activation
        if (runtimeStats.currentDegradationLevel) {
            alerts.push({
                type: 'graceful_degradation_active',
                severity: 'HIGH',
                message: `Graceful degradation active: ${runtimeStats.currentDegradationLevel}`,
                degradationLevel: runtimeStats.currentDegradationLevel,
                category: 'degradation'
            });
        }
        
        // Check RxDB alert thresholds
        const rxdbAlerts = this.rxdbErrorHandler.checkAlertThresholds();
        
        if (rxdbAlerts.errorRateExceeded) {
            alerts.push({
                type: 'high_error_rate',
                severity: 'MEDIUM',
                message: 'High error rate detected in RxDB operations',
                category: 'runtime'
            });
        }
        
        if (rxdbAlerts.conflictRateExceeded) {
            alerts.push({
                type: 'high_conflict_rate',
                severity: 'MEDIUM',
                message: 'High conflict rate detected in RxDB operations',
                category: 'conflicts'
            });
        }
        
        if (rxdbAlerts.storageFailuresExceeded) {
            alerts.push({
                type: 'storage_threshold_exceeded',
                severity: 'HIGH',
                message: 'Storage failure threshold exceeded',
                category: 'storage'
            });
        }
        
        return alerts;
    }

    /**
     * Process alerts
     * @param {Array} alerts - Array of alerts to process
     * @param {string} timestamp - Alert timestamp
     */
    async processAlerts(alerts, timestamp) {
        try {
            for (const alert of alerts) {
                const alertKey = `${alert.type}_${alert.category}`;
                const lastAlertTime = this.alertState.lastAlertTime[alertKey] || 0;
                const now = Date.now();
                
                // Check if alert is in cooldown period
                if (now - lastAlertTime < this.monitoringConfig.alertCooldown) {
                    continue;
                }
                
                // Process the alert
                await this.triggerAlert(alert, timestamp);
                
                // Update alert state
                this.alertState.lastAlertTime[alertKey] = now;
                this.alertState.activeAlerts.add(alertKey);
                this.alertState.alertHistory.push({
                    ...alert,
                    timestamp,
                    alertKey
                });
                
                // Keep alert history manageable
                if (this.alertState.alertHistory.length > 100) {
                    this.alertState.alertHistory = this.alertState.alertHistory.slice(-50);
                }
            }
            
        } catch (error) {
            console.error('[Error Monitoring] Error processing alerts:', error.message);
        }
    }

    /**
     * Trigger an alert
     * @param {Object} alert - Alert information
     * @param {string} timestamp - Alert timestamp
     */
    async triggerAlert(alert, timestamp) {
        try {
            // Log the alert
            console.warn(`[Error Monitoring] ALERT [${alert.severity}] ${alert.message}`);
            
            // Write alert to file
            await this.logAlert(alert, timestamp);
            
            // Send notifications based on severity
            await this.sendAlertNotification(alert, timestamp);
            
            // Take automated actions if configured
            await this.takeAutomatedAction(alert, timestamp);
            
        } catch (error) {
            console.error('[Error Monitoring] Error triggering alert:', error.message);
        }
    }

    /**
     * Log alert to file
     * @param {Object} alert - Alert information
     * @param {string} timestamp - Alert timestamp
     */
    async logAlert(alert, timestamp) {
        try {
            const alertLogFile = path.join(this.logPath, 'alerts.log');
            
            const alertEntry = {
                timestamp,
                ...alert,
                alertId: `${alert.type}_${Date.now()}`
            };
            
            const logLine = JSON.stringify(alertEntry) + '\n';
            await fs.appendFile(alertLogFile, logLine);
            
        } catch (error) {
            console.error('[Error Monitoring] Error logging alert:', error.message);
        }
    }

    /**
     * Send alert notification
     * @param {Object} alert - Alert information
     * @param {string} timestamp - Alert timestamp
     */
    async sendAlertNotification(alert, timestamp) {
        try {
            // This is a placeholder for notification implementation
            // In a real system, you would integrate with:
            // - Email services
            // - Slack/Teams webhooks
            // - SMS services
            // - Monitoring systems (Prometheus, Grafana, etc.)
            
            console.log(`[Error Monitoring] Notification: ${alert.severity} alert - ${alert.message}`);
            
            // Example webhook notification (commented out)
            /*
            if (process.env.ALERT_WEBHOOK_URL) {
                const webhookPayload = {
                    text: `🚨 ${alert.severity} Alert: ${alert.message}`,
                    timestamp,
                    alert
                };
                
                // Send webhook notification
                // await fetch(process.env.ALERT_WEBHOOK_URL, {
                //     method: 'POST',
                //     headers: { 'Content-Type': 'application/json' },
                //     body: JSON.stringify(webhookPayload)
                // });
            }
            */
            
        } catch (error) {
            console.error('[Error Monitoring] Error sending alert notification:', error.message);
        }
    }

    /**
     * Take automated action based on alert
     * @param {Object} alert - Alert information
     * @param {string} timestamp - Alert timestamp
     */
    async takeAutomatedAction(alert, timestamp) {
        try {
            switch (alert.type) {
                case 'critical_migration_errors':
                    // Could pause migration or switch to safe mode
                    console.log('[Error Monitoring] Automated action: Consider pausing migration due to critical errors');
                    break;
                    
                case 'storage_failures':
                    // Could activate graceful degradation
                    console.log('[Error Monitoring] Automated action: Consider activating graceful degradation');
                    break;
                    
                case 'high_error_rate':
                    // Could reduce operation frequency
                    console.log('[Error Monitoring] Automated action: Consider reducing operation frequency');
                    break;
                    
                default:
                    // No automated action for this alert type
                    break;
            }
            
        } catch (error) {
            console.error('[Error Monitoring] Error taking automated action:', error.message);
        }
    }

    /**
     * Log monitoring check
     * @param {Object} checkData - Monitoring check data
     */
    async logMonitoringCheck(checkData) {
        try {
            const monitoringLogFile = path.join(this.logPath, 'monitoring.log');
            const logLine = JSON.stringify(checkData) + '\n';
            await fs.appendFile(monitoringLogFile, logLine);
            
        } catch (error) {
            console.error('[Error Monitoring] Error logging monitoring check:', error.message);
        }
    }

    /**
     * Get monitoring dashboard data
     * @returns {Promise<Object>} Dashboard data
     */
    async getDashboardData() {
        try {
            const migrationStats = await this.getMigrationErrorStats();
            const runtimeStats = await this.getRuntimeErrorStats();
            
            return {
                timestamp: new Date().toISOString(),
                monitoring: {
                    isActive: this.isMonitoring,
                    checkInterval: this.monitoringConfig.checkInterval,
                    activeAlerts: Array.from(this.alertState.activeAlerts),
                    recentAlerts: this.alertState.alertHistory.slice(-10)
                },
                migration: {
                    totalErrors: migrationStats.totalErrors || 0,
                    errorsByCategory: migrationStats.errorsByCategory || {},
                    errorsBySeverity: migrationStats.errorsBySeverity || {}
                },
                runtime: {
                    totalErrors: runtimeStats.totalErrors || 0,
                    errorsByType: runtimeStats.errorsByType || {},
                    errorsBySeverity: runtimeStats.errorsBySeverity || {},
                    currentDegradationLevel: runtimeStats.currentDegradationLevel,
                    degradationActivations: runtimeStats.degradationActivations || 0
                },
                system: {
                    uptime: process.uptime(),
                    memoryUsage: process.memoryUsage(),
                    nodeVersion: process.version
                }
            };
            
        } catch (error) {
            console.error('[Error Monitoring] Error getting dashboard data:', error.message);
            throw error;
        }
    }

    /**
     * Get alert history
     * @param {number} limit - Maximum number of alerts to return
     * @returns {Array} Alert history
     */
    getAlertHistory(limit = 50) {
        return this.alertState.alertHistory.slice(-limit);
    }

    /**
     * Clear alert history
     */
    clearAlertHistory() {
        this.alertState.alertHistory = [];
        this.alertState.activeAlerts.clear();
        this.alertState.lastAlertTime = {};
        console.log('[Error Monitoring] Alert history cleared');
    }

    /**
     * Update monitoring configuration
     * @param {Object} newConfig - New configuration
     */
    updateConfiguration(newConfig) {
        this.monitoringConfig = { ...this.monitoringConfig, ...newConfig };
        console.log('[Error Monitoring] Configuration updated:', newConfig);
    }

    /**
     * Get comprehensive error report
     * @param {string} date - Date for report (YYYY-MM-DD format)
     * @returns {Promise<Object>} Comprehensive error report
     */
    async getComprehensiveErrorReport(date = null) {
        try {
            const targetDate = date || new Date().toISOString().split('T')[0];
            
            const migrationStats = await this.migrationErrorHandler.getErrorStatistics(targetDate);
            const runtimeStats = await this.rxdbErrorHandler.getRuntimeErrorStatistics(targetDate);
            
            // Get alerts for the date
            const alertsForDate = this.alertState.alertHistory.filter(alert => 
                alert.timestamp.startsWith(targetDate)
            );
            
            const report = {
                date: targetDate,
                summary: {
                    totalMigrationErrors: migrationStats.totalErrors || 0,
                    totalRuntimeErrors: runtimeStats.totalErrors || 0,
                    totalAlerts: alertsForDate.length,
                    criticalIssues: this.identifyCriticalIssues(migrationStats, runtimeStats, alertsForDate)
                },
                migration: migrationStats,
                runtime: runtimeStats,
                alerts: alertsForDate,
                recommendations: this.generateRecommendations(migrationStats, runtimeStats, alertsForDate)
            };
            
            return report;
            
        } catch (error) {
            console.error('[Error Monitoring] Error generating comprehensive error report:', error.message);
            throw error;
        }
    }

    /**
     * Identify critical issues from statistics
     * @param {Object} migrationStats - Migration statistics
     * @param {Object} runtimeStats - Runtime statistics
     * @param {Array} alerts - Alerts for the period
     * @returns {Array} Critical issues
     */
    identifyCriticalIssues(migrationStats, runtimeStats, alerts) {
        const criticalIssues = [];
        
        // Critical migration errors
        if (migrationStats.errorsBySeverity?.CRITICAL > 0) {
            criticalIssues.push({
                type: 'critical_migration_errors',
                count: migrationStats.errorsBySeverity.CRITICAL,
                description: 'Critical errors detected during migration process'
            });
        }
        
        // Critical runtime errors
        if (runtimeStats.errorsBySeverity?.CRITICAL > 0) {
            criticalIssues.push({
                type: 'critical_runtime_errors',
                count: runtimeStats.errorsBySeverity.CRITICAL,
                description: 'Critical errors detected during runtime operations'
            });
        }
        
        // Graceful degradation active
        if (runtimeStats.currentDegradationLevel) {
            criticalIssues.push({
                type: 'graceful_degradation',
                level: runtimeStats.currentDegradationLevel,
                description: 'System is operating in degraded mode'
            });
        }
        
        // High alert frequency
        const criticalAlerts = alerts.filter(alert => alert.severity === 'CRITICAL');
        if (criticalAlerts.length > 5) {
            criticalIssues.push({
                type: 'high_critical_alert_frequency',
                count: criticalAlerts.length,
                description: 'High frequency of critical alerts'
            });
        }
        
        return criticalIssues;
    }

    /**
     * Generate recommendations based on error patterns
     * @param {Object} migrationStats - Migration statistics
     * @param {Object} runtimeStats - Runtime statistics
     * @param {Array} alerts - Alerts for the period
     * @returns {Array} Recommendations
     */
    generateRecommendations(migrationStats, runtimeStats, alerts) {
        const recommendations = [];
        
        // Migration recommendations
        if (migrationStats.totalErrors > 10) {
            recommendations.push({
                category: 'migration',
                priority: 'HIGH',
                recommendation: 'Consider running migration in smaller batches to reduce error impact'
            });
        }
        
        if (migrationStats.errorsByCategory?.connection > 0) {
            recommendations.push({
                category: 'migration',
                priority: 'MEDIUM',
                recommendation: 'Review database connection stability and network configuration'
            });
        }
        
        // Runtime recommendations
        if (runtimeStats.errorsByType?.validation > 5) {
            recommendations.push({
                category: 'runtime',
                priority: 'MEDIUM',
                recommendation: 'Review data validation rules and input data quality'
            });
        }
        
        if (runtimeStats.errorsByType?.conflict > 3) {
            recommendations.push({
                category: 'runtime',
                priority: 'MEDIUM',
                recommendation: 'Review concurrent access patterns and conflict resolution strategies'
            });
        }
        
        if (runtimeStats.errorsByType?.storage > 2) {
            recommendations.push({
                category: 'runtime',
                priority: 'HIGH',
                recommendation: 'Investigate storage system health and consider backup strategies'
            });
        }
        
        // Alert-based recommendations
        const storageAlerts = alerts.filter(alert => alert.category === 'storage');
        if (storageAlerts.length > 0) {
            recommendations.push({
                category: 'system',
                priority: 'HIGH',
                recommendation: 'Immediate storage system investigation required'
            });
        }
        
        return recommendations;
    }

    /**
     * Health check for monitoring service
     * @returns {Object} Health status
     */
    getHealthStatus() {
        return {
            monitoring: {
                isActive: this.isMonitoring,
                uptime: this.isMonitoring ? Date.now() - this.lastResetTime : 0
            },
            alerts: {
                active: this.alertState.activeAlerts.size,
                total: this.alertState.alertHistory.length
            },
            handlers: {
                migration: !!this.migrationErrorHandler,
                runtime: !!this.rxdbErrorHandler
            }
        };
    }
}

export default ErrorMonitoringService;